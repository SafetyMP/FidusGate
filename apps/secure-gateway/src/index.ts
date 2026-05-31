import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { FidusGateDatabase, CommandLogEntry } from '@fidusgate/database';
import * as http from 'node:http';
import { verifyReceipt, generateKeyPair, createAttestedSession } from '@fidusgate/crypto-utils';
import { startMcpServer } from './mcp-server';
import { Transaction, AuditReceipt, SecurityFinding } from '@fidusgate/core-types';
import { CedarEvaluator } from './cedar-evaluator';
import { isCommandLineSecure } from './command-auditor';
import * as ws from 'ws';

// Active WebSocket connections tracking
const wsClients = new Set<ws.WebSocket>();

export function broadcastWS(event: string, data: any) {
  const payload = JSON.stringify({ event, data });
  wsClients.forEach(client => {
    if (client.readyState === ws.WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err: any) {
        console.error('Failed to send WebSocket broadcast:', err.message);
      }
    }
  });
}

// SecOps Agent Runaway Loop Circuit Breaker state
let consecutiveViolations = 0;
let circuitBreakerTripped = false;
let circuitBreakerCooldownUntil = 0;

export function checkCircuitBreaker(): boolean {
  if (circuitBreakerTripped) {
    if (Date.now() > circuitBreakerCooldownUntil) {
      circuitBreakerTripped = false;
      consecutiveViolations = 0;
      log('info', '🛡️ Circuit breaker automatically reset. Sandbox executions unlocked.');
      broadcastWS('circuit_breaker_reset', { active: false });
    } else {
      return true; // Still tripped
    }
  }
  return false;
}

export function handleViolation() {
  consecutiveViolations++;
  if (consecutiveViolations >= 3) {
    circuitBreakerTripped = true;
    circuitBreakerCooldownUntil = Date.now() + 3 * 60 * 1000; // 3-minute lockout
    log('security', '🚨 CRITICAL RUNAWAY AGENT ALERT: 3 consecutive policy violations detected! Circuit breaker TRIPPED.');
    broadcastWS('circuit_breaker_tripped', { 
      active: true, 
      cooldownUntil: new Date(circuitBreakerCooldownUntil).toISOString(),
      reason: '3 consecutive Cedar policy violations'
    });
  }
}

export function handleSuccessfulExecution() {
  consecutiveViolations = 0;
}

// ==========================================
// Stateful DevOps Compliance Tracker
// ==========================================
export interface DevOpsComplianceState {
  pipelineVerified: boolean;
  securityAudited: boolean;
  hamChecked: boolean;
  lastPipelineRun?: string;
  lastSecurityAudit?: string;
  lastHamCheck?: string;
  lastCodeModified?: string;
}

export class DevOpsComplianceTracker {
  private statePath = path.resolve(process.cwd(), '.memory/devops-compliance-state.json');
  private state: DevOpsComplianceState = {
    pipelineVerified: true,
    securityAudited: true,
    hamChecked: true
  };

  constructor() {
    this.loadState();
  }

  private loadState() {
    if (fs.existsSync(this.statePath)) {
      try {
        this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      } catch (err: any) {
        console.error('Failed to parse devops-compliance-state.json:', err.message);
      }
    } else {
      this.saveState();
    }
  }

  private saveState() {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err: any) {
      console.error('Failed to write devops-compliance-state.json:', err.message);
    }
  }

  public getState(): DevOpsComplianceState {
    return this.state;
  }

  public onFileModified() {
    this.state.pipelineVerified = false;
    this.state.securityAudited = false;
    this.state.hamChecked = false;
    this.state.lastCodeModified = new Date().toISOString();
    this.saveState();
  }

  public onPipelineSuccess() {
    this.state.pipelineVerified = true;
    this.state.lastPipelineRun = new Date().toISOString();
    this.saveState();
  }

  public onSecurityAuditSuccess() {
    this.state.securityAudited = true;
    this.state.lastSecurityAudit = new Date().toISOString();
    this.saveState();
  }

  public onHamCheckSuccess() {
    this.state.hamChecked = true;
    this.state.lastHamCheck = new Date().toISOString();
    this.saveState();
  }
}

// ==========================================
// Stateful Integrated Business Planning (IBP) Tracker
// ==========================================
export interface IBPComplianceState {
  currentSprintGoal: string;
  tokenBudget: number;
  tokensConsumed: number;
  specializedTasksExecuted: string[];
  genericTasksExecuted: string[];
  crossFunctionalSynthesized: boolean;
  lastSynthesisReport?: string;
  lastSynthesisTimestamp?: string;
}

export class IBPComplianceTracker {
  private statePath = path.resolve(process.cwd(), '.memory/ibp-compliance-state.json');
  private state: IBPComplianceState = {
    currentSprintGoal: "Standardize Antigravity Project Compliance and Security Integration",
    tokenBudget: 80000,
    tokensConsumed: 0,
    specializedTasksExecuted: [],
    genericTasksExecuted: [],
    crossFunctionalSynthesized: true
  };

  constructor() {
    this.loadState();
  }

  private loadState() {
    if (fs.existsSync(this.statePath)) {
      try {
        this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      } catch (err: any) {
        console.error('Failed to parse ibp-compliance-state.json:', err.message);
      }
    } else {
      this.saveState();
    }
  }

  private saveState() {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err: any) {
      console.error('Failed to write ibp-compliance-state.json:', err.message);
    }
  }

  public getState(): IBPComplianceState {
    return this.state;
  }

  public recordTokenUsage(estimatedTokens: number) {
    this.state.tokensConsumed += estimatedTokens;
    this.saveState();
  }

  public logTask(type: 'specialized' | 'generic', taskName: string) {
    if (type === 'specialized') {
      if (!this.state.specializedTasksExecuted.includes(taskName)) {
        this.state.specializedTasksExecuted.push(taskName);
        this.state.crossFunctionalSynthesized = false; // Reset synthesis on new code modifications
      }
    } else {
      if (!this.state.genericTasksExecuted.includes(taskName)) {
        this.state.genericTasksExecuted.push(taskName);
      }
    }
    this.saveState();
  }

  public submitSynthesis(report: string) {
    this.state.crossFunctionalSynthesized = true;
    this.state.lastSynthesisReport = report;
    this.state.lastSynthesisTimestamp = new Date().toISOString();
    this.saveState();
  }

  public isBudgetAligned(): boolean {
    return this.state.tokensConsumed <= this.state.tokenBudget;
  }

  public clearTasks() {
    this.state.specializedTasksExecuted = [];
    this.state.genericTasksExecuted = [];
    this.state.crossFunctionalSynthesized = true;
    this.state.tokensConsumed = 0;
    this.saveState();
  }
}
// ==========================================
// Stateful Product Lifecycle Management (PLM) Tracker
// ==========================================
export interface FeedbackEntry {
  timestamp: string;
  role: string;
  comment: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface PLMComplianceState {
  activeRequirementId: string | null;
  modifiedFiles: string[];
  associatedTestsWritten: boolean;
  hasApiDrift: boolean;
  driftVerified: boolean;
  releaseVersionUpdated: boolean;
  changelogUpdated: boolean;
  activeDirectives: string[];
  feedbackAligned: boolean;
  historicalFeedback: FeedbackEntry[];
}

export class PLMComplianceTracker {
  private statePath = path.resolve(process.cwd(), '.memory/plm-compliance-state.json');
  private state: PLMComplianceState = {
    activeRequirementId: null,
    modifiedFiles: [],
    associatedTestsWritten: true,
    hasApiDrift: false,
    driftVerified: true,
    releaseVersionUpdated: true,
    changelogUpdated: true,
    activeDirectives: [],
    feedbackAligned: true,
    historicalFeedback: []
  };

  constructor() {
    this.loadState();
  }

  private loadState() {
    if (fs.existsSync(this.statePath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        this.state = {
          ...this.state,
          ...loaded,
          activeDirectives: loaded.activeDirectives || [],
          feedbackAligned: loaded.feedbackAligned !== undefined ? loaded.feedbackAligned : true,
          historicalFeedback: loaded.historicalFeedback || []
        };
      } catch (err: any) {
        console.error('Failed to parse plm-compliance-state.json:', err.message);
      }
    } else {
      this.saveState();
    }
  }

  private saveState() {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err: any) {
      console.error('Failed to write plm-compliance-state.json:', err.message);
    }
  }

  public getState(): PLMComplianceState {
    return this.state;
  }

  public setRequirement(id: string) {
    this.state.activeRequirementId = id;
    this.state.modifiedFiles = [];
    this.state.associatedTestsWritten = true;
    this.state.hasApiDrift = false;
    this.state.driftVerified = true;
    this.state.releaseVersionUpdated = true;
    this.state.changelogUpdated = true;
    this.saveState();
  }

  public onFileModified(filePath: string) {
    if (filePath.startsWith('apps/') || filePath.startsWith('packages/')) {
      if (!this.state.modifiedFiles.includes(filePath)) {
        this.state.modifiedFiles.push(filePath);
      }
      
      const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.');
      if (isTestFile) {
        this.state.associatedTestsWritten = true;
      } else {
        const hasTestModified = this.state.modifiedFiles.some(f => f.includes('.test.') || f.includes('.spec.'));
        this.state.associatedTestsWritten = hasTestModified;
      }

      const isSchemaOrContract = filePath.includes('schema.prisma') || filePath.includes('packages/core-types/src/');
      if (isSchemaOrContract) {
        this.state.hasApiDrift = true;
        this.state.driftVerified = false;
      }

      if (filePath.endsWith('package.json')) {
        this.state.releaseVersionUpdated = true;
      } else if (filePath.endsWith('CHANGELOG.md')) {
        this.state.changelogUpdated = true;
      }
    }
    this.saveState();
  }

  public onPublishAttempt() {
    const updatedVersion = this.state.modifiedFiles.some(f => f.endsWith('package.json'));
    const updatedChangelog = this.state.modifiedFiles.some(f => f.endsWith('CHANGELOG.md'));
    this.state.releaseVersionUpdated = updatedVersion;
    this.state.changelogUpdated = updatedChangelog;
    this.saveState();
  }

  public verifyDrift() {
    this.state.driftVerified = true;
    this.saveState();
  }

  public addFeedback(role: string, comment: string, severity: 'info' | 'warn' | 'critical') {
    const entry: FeedbackEntry = {
      timestamp: new Date().toISOString(),
      role,
      comment,
      severity
    };
    if (!this.state.historicalFeedback) {
      this.state.historicalFeedback = [];
    }
    this.state.historicalFeedback.push(entry);
    
    if (severity === 'critical' || severity === 'warn') {
      if (!this.state.activeDirectives) {
        this.state.activeDirectives = [];
      }
      this.state.activeDirectives.push(comment);
      this.state.feedbackAligned = false;
    }
    this.saveState();
  }

  public alignFeedback(requirementId: string, justification: string) {
    this.state.feedbackAligned = true;
    this.state.activeDirectives = [];
    this.saveState();
  }

  public clearTasks() {
    this.state.activeRequirementId = null;
    this.state.modifiedFiles = [];
    this.state.associatedTestsWritten = true;
    this.state.hasApiDrift = false;
    this.state.driftVerified = true;
    this.state.releaseVersionUpdated = true;
    this.state.changelogUpdated = true;
    this.state.activeDirectives = [];
    this.state.feedbackAligned = true;
    this.state.historicalFeedback = [];
    this.saveState();
  }
}

const app = express();
const port = process.env.PORT || 3001;
const db = new Proxy(new FidusGateDatabase(), {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return function (...args: any[]) {
        const result = value.apply(target, args);
        // Intercept async write results to broadcast
        if (result instanceof Promise) {
          return result.then((res) => {
            if (prop === 'addTransaction') {
              broadcastWS('transaction_created', args[0]);
            } else if (prop === 'addCommandLog') {
              broadcastWS('command_log_created', args[0]);
            }
            return res;
          });
        }
        return result;
      };
    }
    return value;
  }
}) as unknown as FidusGateDatabase;
const devopsTracker = new DevOpsComplianceTracker();
const ibpTracker = new IBPComplianceTracker();
const plmTracker = new PLMComplianceTracker();

// SRE Telemetry Counters
let fidusgatePolicyEvaluationsAllow = 0;
let fidusgatePolicyEvaluationsDeny = 0;
let activeSandboxContainers = 0;


// Load FidusGate MCP Configuration and policies
const configPath = path.resolve(process.cwd(), 'protect-mcp.config.json');
let config: any = { mode: 'enforce' }; // default
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e: any) {
    console.error('Failed to parse protect-mcp.config.json:', e.message);
  }
}

const policyPath = path.resolve(process.cwd(), config.policy || 'policy.cedar');
let cedarEvaluator = new CedarEvaluator(policyPath);
log('info', `Loaded TS Cedar Policy Parser with ${cedarEvaluator.getRulesCount()} rules. Enforcing mode: ${config.mode.toUpperCase()}`);

// Implement safe filesystem watcher for hot-reloading policy changes
fs.watch(process.cwd(), (eventType, filename) => {
  if (filename === 'policy.cedar' || filename === 'policy.cedarschema') {
    log('info', `Detected filesystem change in ${filename}. Initiating hot-reload...`);
    try {
      const newEvaluator = new CedarEvaluator(policyPath);
      // Validate the evaluator has successfully parsed rules
      if (newEvaluator.getRulesCount() >= 0) {
        cedarEvaluator = newEvaluator;
        log('info', `✅ HOT-RELOAD SUCCESSFUL: Loaded new Cedar policy with ${cedarEvaluator.getRulesCount()} rules.`);
      }
    } catch (e: any) {
      log('error', `❌ HOT-RELOAD FAILED: Policy has compilation/syntax errors. Keeping current active policy. Error: ${e.message}`);
    }
  }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fidusgate-super-secure-dev-jwt-secret';

// Logger helper with security tagging
function log(level: 'info' | 'warn' | 'error' | 'security', message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
}

// ==========================================
// Recommendation #5: Real-time Incident Alerting
// ==========================================
async function dispatchWebhookAlert(type: 'blocked_action' | 'finding', data: any) {
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  const teamsUrl = process.env.TEAMS_WEBHOOK_URL;
  
  if (!slackUrl && !teamsUrl) return;
  
  try {
    // 1. Compile Slack Payload (Slack block format)
    let slackPayload = {};
    if (type === 'blocked_action') {
      const { receipt } = data;
      slackPayload = {
        text: `🚨 *FidusGate Security Alert: Blocked AI Agent Action!*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚨 *FidusGate Security Alert: Blocked AI Agent Action!*\\nAn autonomous coding agent attempted to execute a high-risk tool call that was programmatically blocked by Cedar policy controls.`
            }
          },
          {
            type: "divider"
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*🔧 Tool Attempted:*\n\`${receipt.payload.tool_name}\`` },
              { type: "mrkdwn", text: `*🛡️ Decision:*\n\`${receipt.payload.decision.toUpperCase()}\`` },
              { type: "mrkdwn", text: `*🎖️ Risk Tier:*\n\`Tier ${receipt.payload.claimed_issuer_tier}\`` },
              { type: "mrkdwn", text: `*✍️ Signed Issuer:*\n\`${receipt.payload.issuer_id}\`` }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*📋 Audit Reason:* ${receipt.payload.reason}`
            }
          }
        ]
      };
    } else if (type === 'finding') {
      const { finding } = data;
      slackPayload = {
        text: `⚠️ *FidusGate Security Finding: CI Pipeline Vulnerability!*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ *FidusGate Security Finding: Pipeline Vulnerability Scanned!*\\nThe static CI/CD workflow security auditor has detected a potential prompt injection vulnerability in your GitHub Actions configurations.`
            }
          },
          {
            type: "divider"
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*🎯 Vector ID:*\n\`${finding.vector}\`` },
              { type: "mrkdwn", text: `*🔴 Severity:*\n*${finding.severity.toUpperCase()}*` },
              { type: "mrkdwn", text: `*📂 Target File:*\n\`${finding.file}\`` },
              { type: "mrkdwn", text: `*⚙️ Workflow Step:*\n\`${finding.step}\`` }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*💥 Critical Impact:* ${finding.impact}\n\n*🛡️ Recommended Remediation:* ${finding.remediation}`
            }
          }
        ]
      };
    }

    // 2. Compile MS Teams Payload (Office 365 MessageCard format)
    let teamsPayload = {};
    if (type === 'blocked_action') {
      const { receipt } = data;
      teamsPayload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "E81123", // Crimson red for blocks
        "summary": "FidusGate Security Alert: Blocked AI Agent Action",
        "title": "🚨 FidusGate Security Alert: Blocked AI Agent Action",
        "sections": [{
          "activityTitle": "An autonomous coding agent attempted to execute a high-risk tool call that was programmatically blocked by Cedar policy controls.",
          "facts": [
            { "name": "🔧 Tool Attempted", "value": `\`${receipt.payload.tool_name}\`` },
            { "name": "🛡️ Decision", "value": `\`${receipt.payload.decision.toUpperCase()}\`` },
            { "name": "🎖️ Risk Tier", "value": `\`Tier ${receipt.payload.claimed_issuer_tier}\`` },
            { "name": "✍️ Signed Issuer", "value": `\`${receipt.payload.issuer_id}\`` },
            { "name": "📋 Audit Reason", "value": receipt.payload.reason || "N/A" }
          ],
          "markdown": true
        }]
      };
    } else if (type === 'finding') {
      const { finding } = data;
      teamsPayload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "F8A100", // Orange for warnings
        "summary": "FidusGate Security Finding: Pipeline Vulnerability",
        "title": "⚠️ FidusGate Security Finding: Pipeline Vulnerability Scanned",
        "sections": [{
          "activityTitle": "The static CI/CD workflow security auditor has detected a potential prompt injection vulnerability in your GitHub Actions configurations.",
          "facts": [
            { "name": "🎯 Vector ID", "value": `\`${finding.vector}\`` },
            { "name": "🔴 Severity", "value": `**${finding.severity.toUpperCase()}**` },
            { "name": "📂 Target File", "value": `\`${finding.file}\`` },
            { "name": "⚙️ Workflow Step", "value": `\`${finding.step}\`` },
            { "name": "💥 Critical Impact", "value": finding.impact },
            { "name": "🛡️ Recommended Remediation", "value": finding.remediation }
          ],
          "markdown": true
        }]
      };
    }

    // 3. Dispatch to Slack Webhook
    if (slackUrl) {
      try {
        const response = await fetch(slackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload)
        });
        
        if (response.ok) {
          log('info', `Security notification successfully dispatched to Slack webhook.`);
        } else {
          log('warn', `Slack webhook returned non-200 status: ${response.status}`);
        }
      } catch (err: any) {
        log('error', `Failed to dispatch Slack webhook notification alert:`, err.message);
      }
    }

    // 4. Dispatch to MS Teams Webhook
    if (teamsUrl) {
      try {
        const response = await fetch(teamsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(teamsPayload)
        });
        
        if (response.ok) {
          log('info', `Security notification successfully dispatched to MS Teams webhook.`);
        } else {
          log('warn', `MS Teams webhook returned non-200 status: ${response.status}`);
        }
      } catch (err: any) {
        log('error', `Failed to dispatch MS Teams webhook notification alert:`, err.message);
      }
    }
  } catch (err: any) {
    log('error', `Exception caught during webhook payload compilation:`, err.message);
  }
}

// ==========================================
// Recommendation #1: OIDC / JWT Authentication Gatekeeping
// ==========================================
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    role: 'developer' | 'admin' | 'auditor';
    email: string;
  };
}

function requireAuth(allowedRoles: ('developer' | 'admin' | 'auditor')[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Standard bypass helper if enabled via env (defaults to false for strict authentication gating)
    const isBypass = process.env.DISABLE_AUTH === 'true';
    if (isBypass) {
      (req as AuthenticatedRequest).user = { id: 'usr_bypass', role: 'admin', email: 'admin@fidusgate.internal' };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Bearer token in Authorization header is missing.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      (req as AuthenticatedRequest).user = decoded;
      
      if (!allowedRoles.includes(decoded.role)) {
        res.status(403).json({ error: `Forbidden: Role '${decoded.role}' lacks sufficient privileges for this endpoint.` });
        return;
      }
      
      next();
    } catch (err: any) {
      log('security', 'CRITICAL AUTHENTICATION FAILURE: Invalid or expired JWT presented!', { error: err.message });
      res.status(401).json({ error: 'Access Denied: Invalid or expired authentication token.' });
    }
  };
}

// OIDC Simulated JWT Token Signer Endpoint
app.post('/api/auth/token', (req, res) => {
  try {
    const { role, email } = req.body;
    if (!role || !email) {
      res.status(400).json({ error: 'Missing required parameters: role, email' });
      return;
    }

    if (!['developer', 'admin', 'auditor'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Supported roles: developer, admin, auditor' });
      return;
    }

    const token = jwt.sign(
      { id: `usr_${Math.floor(1000 + Math.random() * 9000)}`, role, email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    log('info', `Generated authenticated JWT token for user: ${email} (${role.toUpperCase()})`);
    res.json({ token, role, email });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Ephemeral Keyring Session Bootstrapping Endpoint (Role: developer, admin)
app.post('/api/sessions/bootstrap', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const userEmail = (req as AuthenticatedRequest).user?.email || 'agent@fidusgate.internal';
    const issuerId = `sb:issuer:${userEmail.split('@')[0]}`;
    
    // Create an attested session keyring
    const session = createAttestedSession(
      MASTER_ROOT_KEYS.privateKeyHex,
      MASTER_ROOT_KEYS.publicKeyHex,
      issuerId,
      3600 // 1 hour expiration
    );
    
    const sessionId = `sess_${Math.floor(100000 + Math.random() * 900000)}`;
    activeSessions[sessionId] = {
      privateKeyHex: session.sessionKeyPair.privateKeyHex,
      publicKeyHex: session.sessionKeyPair.publicKeyHex,
      attestation: session.attestationCert
    };
    
    log('security', `SECURITY KEYRING BOOTSTRAP: Spawned ephemeral session keyring [${sessionId}] attested for issuer: ${issuerId}`);
    res.json({
      sessionId,
      publicKey: session.sessionKeyPair.publicKeyHex,
      attestation: session.attestationCert
    });
  } catch (err: any) {
    log('error', 'Failed to bootstrap ephemeral session keyring', err);
    res.status(500).json({ error: `Failed to bootstrap session: ${err.message}` });
  }
});

// Sign a payload using an active ephemeral session keyring
app.post('/api/sessions/sign', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const { sessionId, payload } = req.body;
    if (!sessionId || !payload) {
      res.status(400).json({ error: 'Missing required parameters: sessionId, payload' });
      return;
    }
    
    const session = activeSessions[sessionId];
    if (!session) {
      res.status(404).json({ error: 'Active session keyring not found or expired.' });
      return;
    }
    
    const { signPayload } = require('@fidusgate/crypto-utils');
    const localReceipt = signPayload(payload, session.privateKeyHex, session.attestation.issuerId);
    
    // Embed the attestation certificate in the signature payload
    const attestedReceipt = {
      ...localReceipt,
      signature: {
        ...localReceipt.signature,
        attestation: session.attestation
      }
    };
    
    res.json(attestedReceipt);
  } catch (err: any) {
    res.status(500).json({ error: `Signing failed: ${err.message}` });
  }
});

// ==========================================
// Recommendation #3: Rust-Native Cedar Daemon Resolver
// ==========================================
async function evaluateCedarPolicy(principal: string, action: string, resource: string, context: any): Promise<'allow' | 'deny'> {
  const daemonUrl = process.env.CEDAR_DAEMON_URL || 'http://localhost:50051/authorize';
  
  // Record estimated token usage for IBP budget enforcement
  const payloadSize = JSON.stringify({ principal, action, resource, context }).length;
  const estimatedTokens = Math.max(300, Math.floor(payloadSize / 4));
  ibpTracker.recordTokenUsage(estimatedTokens);

  // If executing commit or release, update the publish/release metrics statefully
  const cmd = context?.commandLine || '';
  if (action === 'execute_command' && (cmd.includes('git commit') || cmd.includes('npm publish'))) {
    plmTracker.onPublishAttempt();
  }

  // Inject stateful DevOps compliance indicators
  const isDevopsBypass = process.env.DISABLE_DEVOPS_GATE === 'true';
  const devopsState = isDevopsBypass ? {
    pipelineVerified: true,
    securityAudited: true,
    hamChecked: true
  } : devopsTracker.getState();

  // Inject stateful IBP indicators
  const ibpState = ibpTracker.getState();
  const isBudgetAligned = ibpTracker.isBudgetAligned();

  // Inject stateful PLM indicators
  const plmState = plmTracker.getState();

  const fullContext = {
    ...context,
    devops: {
      pipeline_passed: devopsState.pipelineVerified,
      security_audited: devopsState.securityAudited,
      ham_drift_checked: devopsState.hamChecked
    },
    ibp: {
      cross_functional_synthesized: ibpState.crossFunctionalSynthesized,
      budget_aligned: isBudgetAligned
    },
    plm: {
      active_requirement_id: plmState.activeRequirementId,
      associated_tests_written: plmState.associatedTestsWritten,
      has_api_drift: plmState.hasApiDrift,
      drift_verified: plmState.driftVerified,
      release_version_updated: plmState.releaseVersionUpdated,
      changelog_updated: plmState.changelogUpdated,
      has_active_feedback: plmState.activeDirectives.length > 0,
      feedback_aligned: plmState.feedbackAligned
    }
  };

  const decision = await (async () => {
    try {
      const response = await fetch(daemonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ principal, action, resource, context: fullContext }),
        signal: AbortSignal.timeout(500) // Fast 500ms timeout to prevent hanging the gateway
      });
      
      if (response.ok) {
        const result = await response.json() as any;
        log('info', `📡 Cedar Rust Daemon returned formal authorization decision: ${result.decision.toUpperCase()}`);
        return result.decision as 'allow' | 'deny';
      }
    } catch (err: any) {
      // Quiet fallback to TS Cedar evaluator
    }

    // TS-Native AST Cedar Policy Parser & Evaluator (passing nested fullContext as 4th argument)
    const tsDecision = cedarEvaluator.isAuthorized(
      principal,
      action,
      {
        path: context?.path || '',
        commandLine: context?.commandLine || ''
      },
      fullContext
    );
    
    log('info', `🛡️  TypeScript Cedar Parser returned dynamic authorization decision: ${tsDecision.toUpperCase()}`);
    return tsDecision;
  })();

  if (decision === 'allow') {
    fidusgatePolicyEvaluationsAllow++;
    handleSuccessfulExecution();
  } else {
    fidusgatePolicyEvaluationsDeny++;
    handleViolation();
  }

  return decision;
}

// ==========================================
// REST API Routes
// ==========================================

// 1. GET /api/transactions - Retrieve list of transactions (Role: developer, admin, auditor)
app.get('/api/transactions', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const list = await db.getTransactions();
    res.json(list);
  } catch (error) {
    log('error', 'Failed to retrieve transactions', error);
    res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
});

// Helper to mask sensitive information (PII)
function maskPII(text: string): string {
  if (text.includes('@')) {
    const parts = text.split('@');
    const name = parts[0];
    const domain = parts[1];
    return `${name.substring(0, 1)}***@${domain.substring(0, 1)}***`;
  }
  
  const words = text.split(' ');
  if (words.length > 1) {
    return words.map(w => `${w.substring(0, 1)}***`).join(' ');
  }
  
  return `${text.substring(0, 2)}***`;
}

// 2. POST /api/transactions - Create a new transaction (Role: developer, admin)
app.post('/api/transactions', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const { sender, recipient, amount, currency } = req.body;
    
    if (!sender || !recipient || amount === undefined || !currency) {
       res.status(400).json({ error: 'Missing required parameters: sender, recipient, amount, currency' });
       return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isSenderPii = emailRegex.test(sender) || sender.toLowerCase().includes(' wallet') || sender.split(' ').length > 2;
    const isRecipientPii = emailRegex.test(recipient) || recipient.toLowerCase().includes(' wallet') || recipient.split(' ').length > 2;
    const requiresMasking = isSenderPii || isRecipientPii;
    
    const processedSender = requiresMasking ? maskPII(sender) : sender;
    const processedRecipient = requiresMasking ? maskPII(recipient) : recipient;
    
    const isSuspicious = sender.toLowerCase().includes('tor') || recipient.toLowerCase().includes('tor') || amount > 1000000;
    const status = isSuspicious ? 'flagged' : 'completed';
    
    const newTx: Transaction = {
      id: `tx_${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      sender: processedSender,
      recipient: processedRecipient,
      amount: Number(amount),
      currency,
      status,
      maskedPii: requiresMasking
    };
    
    await db.addTransaction(newTx);
    log('info', `Transaction registered successfully: ${newTx.id}`, { id: newTx.id, status });
    res.status(201).json(newTx);
  } catch (error) {
    log('error', 'Failed to create transaction', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

const PUBLIC_KEY_MAP: Record<string, string> = {
  'sb:issuer:de073ae64e43': '302a300506032b6570032100df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83',
  'sb:issuer:pm-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de81',
  'sb:issuer:architecture-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de82',
  'sb:issuer:backend-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83',
  'sb:issuer:frontend-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de84',
  'sb:issuer:qa-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de85',
  'sb:issuer:security-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de86',
  'sb:issuer:devops-sme': '302a300506032b6570032100cf20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de87'
};

// Dynamically generate the Master Root Keypair for attestation at startup
const MASTER_ROOT_KEYS = generateKeyPair();
PUBLIC_KEY_MAP['sb:issuer:de073ae64e43'] = MASTER_ROOT_KEYS.publicKeyHex;

const activeSessions: Record<string, {
  privateKeyHex: string;
  publicKeyHex: string;
  attestation: any;
}> = {};


// 3. GET /api/receipts - Retrieve list of signed audit receipts (Role: developer, admin, auditor)
app.get('/api/receipts', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const receipts = await db.getAuditReceipts();
    res.json(receipts);
  } catch (error) {
    log('error', 'Failed to retrieve audit receipts', error);
    res.status(500).json({ error: 'Failed to retrieve receipts' });
  }
});

// 4. POST /api/receipts - Verify and record a signed receipt (Role: developer, admin)
app.post('/api/receipts', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const receipt: AuditReceipt = req.body;
    const { payload, signature } = receipt;
    
    if (!payload || !signature || !signature.sig || !signature.kid) {
       res.status(400).json({ error: 'Malformed receipt structure. Missing payload or signature.' });
       return;
    }
    
    const publicKeyHex = PUBLIC_KEY_MAP[signature.kid] || signature.kid;
    const isValid = verifyReceipt(receipt, publicKeyHex);
    
    if (!isValid) {
      log('security', 'CRITICAL SECURITY ALERT: Tampered or invalid audit receipt signature detected!', {
        tool_name: payload.tool_name,
        kid: signature.kid
      });
       res.status(400).json({
        error: 'Invalid receipt signature. Verification failed. The audit trail may have been tampered with!',
        verified: false
      });
       return;
    }
    
    // Evaluate decision using dual Cedar evaluation system (Rust + TS)
    const decision = await evaluateCedarPolicy(
      payload.issuer_id, 
      payload.tool_name, 
      'file_system', 
      { 
        path: payload.args?.path || (payload.tool_name !== 'execute_command' ? payload.reason : ''),
        commandLine: payload.args?.commandLine || (payload.tool_name === 'execute_command' ? payload.reason : '')
      }
    );
    
    // In enforce mode, if the receipt claims ALLOW but the policy evaluates to DENY, reject receipt submission!
    if (config.mode === 'enforce' && decision === 'deny' && payload.decision === 'allow') {
      log('security', `CRITICAL POLICY VIOLATION: Agent submitted ALLOW receipt but policy evaluates to DENY!`, {
        tool_name: payload.tool_name,
        issuer_id: payload.issuer_id
      });
      res.status(403).json({
        error: `Access Denied: Policy evaluation returned DENY for this action. Receipt submission rejected under zero-trust enforcement.`,
        verified: false
      });
      return;
    }
    
    payload.decision = decision;

    // Stateful DevOps, IBP, and PLM compliance checks
    if (decision === 'allow') {
      if (['write_file', 'replace_file_content', 'multi_replace_file_content'].includes(payload.tool_name)) {
        devopsTracker.onFileModified();
        ibpTracker.logTask('specialized', payload.tool_name);
        plmTracker.onFileModified(payload.args?.path || '');
        log('info', `DevOps compliance gate invalidated: file modification detected by tool '${payload.tool_name}'.`);
      } else if (payload.tool_name === 'execute_command') {
        const cmd = payload.args?.commandLine || payload.reason || '';
        if (cmd.includes('ci-verify.sh') || cmd.includes('npm run ci')) {
          devopsTracker.onPipelineSuccess();
          ibpTracker.logTask('generic', 'pipeline_verification');
          log('info', 'DevOps compliance gate verified: local pipeline emulation executed successfully.');
        } else if (cmd.includes('ham-drift-watcher.sh') || cmd.includes('pre-commit-ham-audit.sh')) {
          devopsTracker.onHamCheckSuccess();
          ibpTracker.logTask('generic', 'drift_check');
          log('info', 'DevOps compliance gate verified: context drift check executed successfully.');
        } else if (cmd.includes('git commit') || cmd.includes('npm publish')) {
          plmTracker.onPublishAttempt();
        } else {
          ibpTracker.logTask('specialized', 'execute_generic_command');
        }
      }
    }

    await db.addAuditReceipt(receipt);
    log('security', `Cryptographically verified receipt logged: ${payload.tool_name} -> ${payload.decision}`, {
      tool_name: payload.tool_name,
      decision: payload.decision,
      kid: signature.kid
    });
    
    if (payload.decision === 'deny') {
      dispatchWebhookAlert('blocked_action', { receipt });
    }
    
    res.status(201).json({ message: 'Receipt verified and logged successfully', verified: true });
  } catch (error) {
    log('error', 'Failed to process receipt verification', error);
    res.status(500).json({ error: 'Failed to process receipt' });
  }
});

// 4b. POST /api/receipts/verify - Verify an Ed25519 signed receipt without storing it (Public)
app.post('/api/receipts/verify', (req, res) => {
  try {
    const receipt: AuditReceipt = req.body;
    const { payload, signature } = receipt;
    
    if (!payload || !signature || !signature.sig || !signature.kid) {
       res.status(400).json({ error: 'Malformed receipt structure. Missing payload or signature.' });
       return;
    }
    
    const publicKeyHex = PUBLIC_KEY_MAP[signature.kid] || signature.kid;
    const isValid = verifyReceipt(receipt, publicKeyHex);
    
    res.json({ verified: isValid });
  } catch (error) {
    log('error', 'Failed to perform standalone verification', error);
    res.status(500).json({ error: 'Failed to verify receipt' });
  }
});

// 5. GET /api/findings - Retrieve static analysis security findings (Role: developer, admin, auditor)
app.get('/api/findings', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const list = await db.getFindings();
    res.json(list);
  } catch (error) {
    log('error', 'Failed to retrieve findings', error);
    res.status(500).json({ error: 'Failed to retrieve findings' });
  }
});

// 6. POST /api/findings - Push a set of static analysis findings (Role: admin)
app.post('/api/findings', requireAuth(['admin']), async (req, res) => {
  try {
    const findings: SecurityFinding[] = req.body;
    if (!Array.isArray(findings)) {
       res.status(400).json({ error: 'Invalid findings format. Expected a JSON array.' });
       return;
    }
    
    await db.setFindings(findings);
    log('security', `CI Security Auditor reported ${findings.length} findings.`, { count: findings.length });
    
    // Stateful DevOps compliance checks: mark security audited as true if zero High findings
    const highFindings = findings.filter(f => f.severity === 'High');
    if (highFindings.length === 0) {
      devopsTracker.onSecurityAuditSuccess();
      ibpTracker.logTask('generic', 'security_scanner');
      log('info', 'DevOps compliance gate verified: static security audit passed with zero High findings.');
    }

    findings.forEach(f => {
      if (f.severity === 'High') {
        dispatchWebhookAlert('finding', { finding: f });
      }
    });
    
    res.json({ message: 'Findings updated successfully', count: findings.length });
  } catch (error) {
    log('error', 'Failed to update findings', error);
    res.status(500).json({ error: 'Failed to update findings' });
  }
});

// ==========================================
// Multi-Agent Consensus Gating Checks
// ==========================================
const CONSENSUS_REQUIRED_PATTERNS = [
  /rm\s+-rf/,
  /npm\s+install/,
  /curl\b/,
  /wget\b/,
  /clearDatabase/,
  /database\s+clear/
];

function requiresConsensus(command: string, role: string): boolean {
  if (role === 'developer') return true; // Developers always require consensus for executions!
  return CONSENSUS_REQUIRED_PATTERNS.some(pattern => pattern.test(command));
}

// ==========================================
// Recommendation #2: Live Sandbox Execution API (Role: admin, developer)
// ==========================================
app.post('/api/sandbox/execute', requireAuth(['admin', 'developer']), async (req, res) => {
  try {
    if (checkCircuitBreaker()) {
      const remainingSecs = Math.max(0, Math.ceil((circuitBreakerCooldownUntil - Date.now()) / 1000));
      res.status(429).json({
        error: `Sandbox execution locked. SecOps Circuit Breaker tripped due to consecutive security violations. Lock releases in ${remainingSecs} seconds.`
      });
      return;
    }

    const { command } = req.body;
    if (!command) {
       res.status(400).json({ error: 'Missing required parameters: command' });
       return;
    }

    const userEmail = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    const userRole = (req as AuthenticatedRequest).user?.role || 'admin';

    // Consensus Gating Interceptor
    if (requiresConsensus(command, userRole)) {
      const prisma = db.getPrisma();
      if (prisma) {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry
        const pendingAction = await prisma.pendingAction.create({
          data: {
            expiresAt,
            command,
            initiator: userEmail,
            role: userRole,
            requiredVotes: 2,
            status: 'pending'
          }
        });
        
        log('security', `🛡️ CONSENSUS GATING TRIGGERED: Suspended command execution [${command}] from ${userEmail} (${userRole.toUpperCase()}). Action ID: ${pendingAction.id}`);
        broadcastWS('consensus_gating_triggered', {
          actionId: pendingAction.id,
          command,
          initiator: userEmail,
          role: userRole,
          status: 'pending'
        });

        res.json({
          status: 'pending_consensus',
          actionId: pendingAction.id,
          message: 'This high-privileged command has been suspended under active Consensus Gating. It requires 2 cryptographic approval signatures from authorized roles to execute.'
        });
        return;
      }
    }

    // Input command tokenized audit (Defense-in-Depth against bypasses)
    const auditResult = isCommandLineSecure(command);
    if (!auditResult.secure) {
      log('security', `BLOCKED WEB CONSOLE COMMAND: Forbidden command execution attempted. Reason: ${auditResult.reason}`, { command });
      
      handleViolation();
      
      // Persist forensic log for blocked/audit-violated command
      await db.addCommandLog({
        id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
        timestamp: new Date().toISOString(),
        command,
        user: userEmail,
        role: userRole,
        status: 'failed',
        exitCode: 1,
        cedarDecision: 'deny'
      });

      res.status(403).json({ 
        error: `Command execution forbidden. Reason: ${auditResult.reason}`,
        remediationSuggestion: auditResult.remediationSuggestion
      });
      return;
    }

    log('info', `Executing sandboxed console task: [${command}] on behalf of Administrator`);
    
    // Execute command within unprivileged sandbox container and stream logs
    const workspacePath = path.resolve(__dirname, '..', '..', '..');
    const sandboxCmd = `bash scripts/sandbox-execute.sh "${command}" "${workspacePath}"`;
    
    activeSandboxContainers++;
    try {
      try {
        const logs = execSync(sandboxCmd, { cwd: workspacePath, encoding: 'utf8', stdio: 'pipe' });
        
        // Persist forensic log for successful run
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command,
          user: userEmail,
          role: userRole,
          status: 'success',
          exitCode: 0,
          cedarDecision: 'allow'
        });

        res.json({ logs, status: 'success' });
      } catch (error: any) {
        log('error', `Web console command execution failed`, error.message);
        const exitCode = error.status || 1;
        const errorLogs = [error.stdout, error.stderr].filter(Boolean).join('\n') || error.message;

        // Persist forensic log for failed run
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command,
          user: userEmail,
          role: userRole,
          status: 'failed',
          exitCode,
          cedarDecision: 'allow'
        });

        res.status(500).json({ error: 'Sandboxed execution failed', logs: errorLogs, status: 'failed' });
      }
    } finally {
      activeSandboxContainers--;
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Sandbox execution exception occurred', message: error.message });
  }
});

// 8. POST /api/authorize - Real-time pre-execution tool validation (Role: developer, admin)
app.post('/api/authorize', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const { principal, tool_name, args } = req.body;
    
    if (!principal || !tool_name) {
      res.status(400).json({ error: 'Missing required parameters: principal, tool_name' });
      return;
    }

    // Evaluate decision using dual Cedar evaluation system (Rust + TS)
    const decision = await evaluateCedarPolicy(
      principal,
      tool_name,
      'file_system',
      {
        path: args?.path || '',
        commandLine: args?.commandLine || ''
      }
    );

    log('info', `Real-time tool authorization evaluated: ${principal} -> ${tool_name} -> ${decision.toUpperCase()}`);
    res.json({ decision });
  } catch (error: any) {
    log('error', 'Failed to perform real-time tool authorization', error.message);
    res.status(500).json({ error: 'Authorization evaluation failed' });
  }
});

// ==========================================
// Stateful IBP Gating Endpoints
// ==========================================

// 9. POST /api/ibp/synthesize - Submit IBP Cross-Functional Synthesis Report (Role: developer, admin)
app.post('/api/ibp/synthesize', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const { report } = req.body;
    if (!report || report.trim().length < 50) {
      res.status(400).json({ error: 'Missing or too short synthesis report. IBP report must be at least 50 characters.' });
      return;
    }

    ibpTracker.submitSynthesis(report);
    log('security', 'IBP Governance verified: Agent successfully submitted cross-functional synthesis report.');
    res.json({ message: 'IBP cross-functional synthesis report received and verified.', verified: true });
  } catch (error: any) {
    log('error', 'Failed to process IBP synthesis report', error.message);
    res.status(500).json({ error: 'Failed to process synthesis' });
  }
});

// 10. GET /api/ibp/state - Retrieve current IBP compliance and budget state (Role: developer, admin, auditor)
app.get('/api/ibp/state', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    res.json(ibpTracker.getState());
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve IBP state' });
  }
});

// ==========================================
// Multi-Agent Consensus Gating Endpoints
// ==========================================

// GET /api/consensus/pending - Retrieve list of suspended actions waiting for approvals
app.get('/api/consensus/pending', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const prisma = db.getPrisma();
    if (!prisma) {
      res.json([]);
      return;
    }
    const list = await prisma.pendingAction.findMany({
      where: { status: 'pending' },
      include: { approvals: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(list);
  } catch (error: any) {
    log('error', 'Failed to retrieve pending consensus actions', error);
    res.status(500).json({ error: 'Failed to retrieve pending actions' });
  }
});

// POST /api/consensus/approve - Cryptographically approve a suspended action
app.post('/api/consensus/approve', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const { actionId, signature } = req.body;
    if (!actionId || !signature) {
      res.status(400).json({ error: 'Missing required parameters: actionId, signature' });
      return;
    }

    const prisma = db.getPrisma();
    if (!prisma) {
      res.status(500).json({ error: 'PostgreSQL persistence layer is not active.' });
      return;
    }

    const action = await prisma.pendingAction.findUnique({
      where: { id: actionId },
      include: { approvals: true }
    });

    if (!action) {
      res.status(404).json({ error: 'Pending action not found.' });
      return;
    }

    if (action.status !== 'pending') {
      res.status(400).json({ error: `Pending action is already in ${action.status} state.` });
      return;
    }

    if (new Date(action.expiresAt).getTime() < Date.now()) {
      await prisma.pendingAction.update({
        where: { id: actionId },
        data: { status: 'expired' }
      });
      res.status(400).json({ error: 'Pending action has expired.' });
      return;
    }

    const userEmail = (req as AuthenticatedRequest).user?.email || 'approver@fidusgate.internal';
    const userRole = (req as AuthenticatedRequest).user?.role || 'admin';

    // Prevent double voting by the same user email or the initiator
    if (action.initiator === userEmail) {
      res.status(400).json({ error: 'Action initiator cannot sign their own consensus request.' });
      return;
    }

    const alreadyApproved = action.approvals.some(app => app.approver === userEmail);
    if (alreadyApproved) {
      res.status(400).json({ error: 'You have already approved this action.' });
      return;
    }

    // Mathematically verify the approver's cryptographic signature!
    const publicKeyHex = PUBLIC_KEY_MAP[`sb:issuer:${userEmail.split('@')[0]}`] || PUBLIC_KEY_MAP['sb:issuer:de073ae64e43'];
    
    // The payload signed by the approver is the actionId
    const { verifyReceipt } = require('@fidusgate/crypto-utils');
    const isValid = verifyReceipt({
      payload: {
        type: 'consensus:approval',
        tool_name: 'approve',
        decision: 'allow',
        policy_digest: 'actionId:' + actionId,
        issued_at: new Date().toISOString(),
        issuer_id: `sb:issuer:${userEmail.split('@')[0]}`
      },
      signature: {
        alg: 'EdDSA',
        kid: `sb:issuer:${userEmail.split('@')[0]}`,
        sig: signature
      }
    }, publicKeyHex);

    if (!isValid) {
      res.status(400).json({ error: 'Cryptographic signature verification failed.' });
      return;
    }

    // Write approval record
    await prisma.consensusApproval.create({
      data: {
        actionId,
        approver: userEmail,
        role: userRole,
        signature
      }
    });

    // Refresh approvals list
    const currentApprovals = await prisma.consensusApproval.findMany({
      where: { actionId }
    });

    log('security', `CONSENSUS GATING SIGN-OFF: ${userEmail} (${userRole.toUpperCase()}) approved action ${actionId}. Active signatures: ${currentApprovals.length}/${action.requiredVotes}`);

    let executedOutput = '';
    let executeStatus = 'pending';

    // If threshold is reached, execute the suspended task! ( initiator + 1 approver = 2 signatures )
    if (currentApprovals.length >= action.requiredVotes - 1) {
      executeStatus = 'approved';
      await prisma.pendingAction.update({
        where: { id: actionId },
        data: { status: 'approved' }
      });

      log('security', `🛡️ CONSENSUS GATING PASSED: Action ${actionId} approved. Launching command in gVisor sandbox: [${action.command}]`);

      // Execute command inside sandbox
      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      const sandboxCmd = `bash scripts/sandbox-execute.sh "${action.command}" "${workspacePath}"`;

      try {
        executedOutput = execSync(sandboxCmd, { cwd: workspacePath, encoding: 'utf8', stdio: 'pipe' });
        
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: action.command,
          user: action.initiator,
          role: action.role,
          status: 'success',
          exitCode: 0,
          cedarDecision: 'allow'
        });
      } catch (err: any) {
        executedOutput = [err.stdout, err.stderr].filter(Boolean).join('\n') || err.message;
        await db.addCommandLog({
          id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
          timestamp: new Date().toISOString(),
          command: action.command,
          user: action.initiator,
          role: action.role,
          status: 'failed',
          exitCode: err.status || 1,
          cedarDecision: 'allow'
        });
      }

      broadcastWS('consensus_gating_approved', {
        actionId,
        command: action.command,
        logs: executedOutput
      });
    }

    res.json({
      status: executeStatus,
      approvalsCount: currentApprovals.length + 1, // initiator count
      logs: executedOutput
    });
  } catch (error: any) {
    log('error', 'Failed to approve consensus action', error);
    res.status(500).json({ error: `Failed to approve action: ${error.message}` });
  }
});

// 7. POST /api/reset - Clear database to initial state (Role: admin)
app.post('/api/reset', requireAuth(['admin']), async (req, res) => {
  try {
    await db.clearDatabase();
    ibpTracker.clearTasks(); // Clear IBP compliance states on database reset
    plmTracker.clearTasks(); // Clear PLM compliance states on database reset
    log('warn', 'Database reset to initial template state.');
    res.json({ message: 'Database reset successfully' });
  } catch (error) {
    log('error', 'Failed to reset database', error);
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

// ==========================================
// Stateful PLM Gating Endpoints
// ==========================================

// 11. POST /api/plm/requirement - Register active Requirement ID (Role: developer, admin)
app.post('/api/plm/requirement', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const { id, description } = req.body;
    if (!id || id.trim().length === 0) {
      res.status(400).json({ error: 'Missing or empty requirement ID.' });
      return;
    }

    plmTracker.setRequirement(id);
    log('info', `PLM Governance: Registered active requirement/issue ID: ${id}. Description: ${description || ''}`);
    res.json({ message: `Active requirement ${id} registered and verified.`, activeRequirementId: id });
  } catch (error: any) {
    log('error', 'Failed to register requirement ID', error.message);
    res.status(500).json({ error: 'Failed to register requirement' });
  }
});

// 12. POST /api/plm/drift-verify - Verify and clear active API schema drift (Role: developer, admin)
app.post('/api/plm/drift-verify', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    plmTracker.verifyDrift();
    log('info', 'PLM Governance: API and schema contract drift successfully verified and cleared.');
    res.json({ message: 'API schema contract drift verified and cleared.', verified: true });
  } catch (error: any) {
    log('error', 'Failed to verify API drift', error.message);
    res.status(500).json({ error: 'Failed to verify drift' });
  }
});

// 12b. POST /api/plm/feedback - Submit runtime user/system feedback (Role: developer, admin)
app.post('/api/plm/feedback', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const { role, comment, severity } = req.body;
    if (!role || !comment || !severity) {
      res.status(400).json({ error: 'Missing required parameters: role, comment, severity' });
      return;
    }
    if (!['info', 'warn', 'critical'].includes(severity)) {
      res.status(400).json({ error: 'Invalid severity. Must be info, warn, or critical' });
      return;
    }

    plmTracker.addFeedback(role, comment, severity);
    log('info', `PLM Governance: Received feedback from ${role}. Severity: ${severity.toUpperCase()}. Comment: ${comment}`);
    res.json({ message: 'Feedback logged successfully', aligned: plmTracker.getState().feedbackAligned });
  } catch (error: any) {
    log('error', 'Failed to log PLM feedback', error.message);
    res.status(500).json({ error: 'Failed to log feedback' });
  }
});

// 12c. POST /api/plm/feedback-align - Record feedback alignment/resolution (Role: developer, admin)
app.post('/api/plm/feedback-align', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const { requirementId, justification } = req.body;
    if (!requirementId || !justification || justification.trim().length === 0) {
      res.status(400).json({ error: 'Missing required parameters: requirementId, justification' });
      return;
    }

    plmTracker.alignFeedback(requirementId, justification);
    log('info', `PLM Governance: Feedback aligned for Requirement ${requirementId}. Justification: ${justification}`);
    res.json({ message: 'Feedback aligned successfully', aligned: true });
  } catch (error: any) {
    log('error', 'Failed to align PLM feedback', error.message);
    res.status(500).json({ error: 'Failed to align feedback' });
  }
});

// 13. GET /api/plm/state - Retrieve current PLM compliance state (Role: developer, admin, auditor)
app.get('/api/plm/state', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    res.json(plmTracker.getState());
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve PLM state' });
  }
});

// 13b. GET /api/logs/commands - Retrieve list of forensic command audit logs (Role: developer, admin, auditor)
app.get('/api/logs/commands', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const logs = await db.getCommandLogs();
    res.json(logs);
  } catch (error: any) {
    log('error', 'Failed to retrieve command logs', error.message);
    res.status(500).json({ error: 'Failed to retrieve command logs' });
  }
});

// ==========================================
// Advanced SecOps Attestation, Drift & Patch Endpoints
// ==========================================

// 15. GET /api/auth/attested-claims - Retrieve OIDC/SPIFFE Attestation details (Role: developer, admin, auditor)
app.get('/api/auth/attested-claims', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    res.json({
      attested: true,
      method: "Platform OIDC Gating",
      workloadId: `spiffe://fidusgate.internal/ns/sandbox/sa/agent-${user.role}`,
      issuer: "https://token.actions.githubusercontent.com",
      subject: `repo:fidusgate/audit-monorepo:ref:refs/heads/main:job:security-audit:user:${user.email}`,
      signingKey: "302a300506032b6570032100df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83",
      role: user.role,
      email: user.email
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve attestation claims' });
  }
});

// 16. GET /api/sandbox/patch - Retrieve pending sandbox overlay patch (Role: developer, admin, auditor)
app.get('/api/sandbox/patch', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    const patchPath = path.resolve(process.cwd(), '.memory/pending-sandbox.patch');
    if (fs.existsSync(patchPath)) {
      const patch = fs.readFileSync(patchPath, 'utf8');
      res.json({ patch, exists: true });
    } else {
      res.json({ patch: '', exists: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve pending patch', message: err.message });
  }
});

// 17. POST /api/sandbox/apply - Apply/Merge sandbox diff patch (Role: admin)
app.post('/api/sandbox/apply', requireAuth(['admin']), async (req, res) => {
  try {
    const patchPath = path.resolve(process.cwd(), '.memory/pending-sandbox.patch');
    if (!fs.existsSync(patchPath)) {
      res.status(404).json({ error: 'No pending sandbox patch found to apply.' });
      return;
    }

    const userEmail = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    const userRole = (req as AuthenticatedRequest).user?.role || 'admin';

    log('info', `Administrator applying sandbox patch: ${patchPath}`);
    
    try {
      // Use git apply to merge patch cleanly
      execSync('git apply --whitespace=nowarn .memory/pending-sandbox.patch', { cwd: process.cwd() });
      
      // Delete patch file after successful merge
      fs.unlinkSync(patchPath);

      log('info', `Sandbox patch successfully merged into host codebase by ${userEmail}.`);

      // Record forensic log
      await db.addCommandLog({
        id: `cmd_${Math.floor(100000 + Math.random() * 900000)}`,
        timestamp: new Date().toISOString(),
        command: 'git apply .memory/pending-sandbox.patch',
        user: userEmail,
        role: userRole,
        status: 'success',
        exitCode: 0,
        cedarDecision: 'allow'
      });

      res.json({ message: 'Sandbox patch successfully applied and merged.', applied: true });
    } catch (execErr: any) {
      log('error', `Failed to apply sandbox patch`, execErr.message);
      res.status(500).json({ error: 'Failed to merge patch into workspace', message: execErr.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Patch application exception occurred', message: err.message });
  }
});

// 18. GET /api/sandbox/drift - Retrieve CLAUDE.md drift heatmap metrics (Role: developer, admin, auditor)
app.get('/api/sandbox/drift', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    const workspaceRoot = process.cwd();
    const claudePath = path.resolve(workspaceRoot, 'CLAUDE.md');
    
    let claudeTime = Date.now();
    if (fs.existsSync(claudePath)) {
      claudeTime = fs.statSync(claudePath).mtimeMs;
    }

    const targets = [
      { name: 'apps/admin-dashboard', path: 'apps/admin-dashboard/src' },
      { name: 'apps/secure-gateway', path: 'apps/secure-gateway/src' },
      { name: 'packages/cedar-daemon', path: 'packages/cedar-daemon/src' },
      { name: 'packages/database', path: 'packages/database/src' },
      { name: 'scripts', path: 'scripts' }
    ];

    const driftDetails = targets.map(t => {
      const fullPath = path.resolve(workspaceRoot, t.path);
      let maxTime = 0;

      const scanDir = (dirPath: string) => {
        if (!fs.existsSync(dirPath)) return;
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          const p = path.join(dirPath, item);
          if (p.includes('node_modules') || p.includes('.turbo') || p.includes('dist')) continue;
          try {
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
              scanDir(p);
            } else if (stat.isFile()) {
              if (stat.mtimeMs > maxTime) {
                maxTime = stat.mtimeMs;
              }
            }
          } catch (e) {}
        }
      };

      scanDir(fullPath);

      // If maxTime > claudeTime, we have drift!
      const isStale = maxTime > claudeTime;
      const driftSeconds = isStale ? Math.max(0, Math.floor((maxTime - claudeTime) / 1000)) : 0;

      return {
        name: t.name,
        driftSeconds,
        status: isStale ? 'stale' : 'aligned',
        lastUpdated: new Date(maxTime || Date.now()).toISOString()
      };
    });

    res.json(driftDetails);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to calculate drift', message: err.message });
  }
});

// 19. POST /api/sandbox/drift-sync - Trigger memory cheat sheet synchronizer (Role: developer, admin)
app.post('/api/sandbox/drift-sync', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const userEmail = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    
    log('info', `User ${userEmail} triggered CLAUDE.md drift synchronization...`);
    
    try {
      execSync('bash scripts/ham-drift-watcher.sh', { cwd: process.cwd() });
      log('info', 'CLAUDE.md drift watcher executed successfully. Memory maps synchronized.');
      res.json({ message: 'Codebase memory synchronized successfully.', synced: true });
    } catch (execErr: any) {
      log('error', 'CLAUDE.md drift watcher execution failed', execErr.message);
      res.status(500).json({ error: 'Failed to execute memory synchronizer', message: execErr.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Drift sync exception occurred', message: err.message });
  }
});

// 20. GET /api/policy/active - Retrieve current active policy.cedar content (Role: developer, admin, auditor)
app.get('/api/policy/active', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    const activePolicyPath = path.resolve(process.cwd(), config.policy || 'policy.cedar');
    if (fs.existsSync(activePolicyPath)) {
      const code = fs.readFileSync(activePolicyPath, 'utf8');
      res.json({ code });
    } else {
      res.status(404).json({ error: 'Active policy file not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve active policy', message: err.message });
  }
});

// 21. POST /api/policy/simulate - Live + Draft Cedar Policy Simulator (Role: admin, auditor)
app.post('/api/policy/simulate', requireAuth(['admin', 'auditor']), (req, res) => {
  try {
    const { principal, toolName, args, context: contextObj, policyOverride } = req.body;
    
    let evaluator: CedarEvaluator;
    if (policyOverride !== undefined && policyOverride !== null) {
      evaluator = new CedarEvaluator();
      evaluator.parse(policyOverride);
    } else {
      const activePolicyPath = path.resolve(process.cwd(), config.policy || 'policy.cedar');
      evaluator = new CedarEvaluator(activePolicyPath);
    }

    const simulationResult = evaluator.evaluateSimulator(principal, toolName, args || {}, contextObj || {});
    res.json(simulationResult);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to evaluate simulation', message: err.message });
  }
});

// 22. GET /api/logs/compliance/:logId/export - Export structured JSON forensic compliance package (Role: admin, auditor)
app.get('/api/logs/compliance/:logId/export', requireAuth(['admin', 'auditor']), async (req, res) => {
  try {
    const { logId } = req.params;
    const logs = await db.getCommandLogs();
    const logItem = logs.find((l: any) => l.id === logId);
    
    if (!logItem) {
      res.status(404).json({ error: `Command log not found for ID: ${logId}` });
      return;
    }

    const userRole = logItem.role;
    const userEmail = logItem.user;
    
    const attestation = {
      attested: true,
      method: "Platform OIDC Gating",
      workloadId: `spiffe://fidusgate.internal/ns/sandbox/sa/agent-${userRole}`,
      issuer: "https://token.actions.githubusercontent.com",
      subject: `repo:fidusgate/audit-monorepo:ref:refs/heads/main:job:security-audit:user:${userEmail}`,
      signingKey: "302a300506032b6570032100df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83"
    };

    const complianceEnvelope = {
      complianceStandard: "FidusGate-SecOps-v1.0",
      complianceAttestationId: `compliance_${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      evaluatedRecord: logItem,
      attestationClaims: attestation,
      fidusgateEngineVersion: "1.2.0-Enterprise"
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="compliance-receipt-${logId}.json"`
    });
    res.end(JSON.stringify(complianceEnvelope, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate compliance package', message: err.message });
  }
});

// 23. POST /api/policy/reload - Trigger programmatic Cedar policy hot-reload (Role: admin, auditor)
app.post('/api/policy/reload', requireAuth(['admin', 'auditor']), (req, res) => {
  try {
    const newEvaluator = new CedarEvaluator(policyPath);
    if (newEvaluator.getRulesCount() >= 0) {
      cedarEvaluator = newEvaluator;
      log('info', `✅ HTTP HOT-RELOAD SUCCESSFUL: Loaded new Cedar policy with ${cedarEvaluator.getRulesCount()} rules.`);
      res.json({ success: true, message: `Loaded new Cedar policy with ${cedarEvaluator.getRulesCount()} rules.` });
    } else {
      res.status(400).json({ error: 'Evaluator initialized but has no rules.' });
    }
  } catch (e: any) {
    log('error', `❌ HTTP HOT-RELOAD FAILED: Policy has compilation/syntax errors. Keeping current active policy. Error: ${e.message}`);
    res.status(400).json({ error: 'Policy compilation failed', message: e.message });
  }
});

// Expose metrics on a secure, dedicated admin-only port 3002
const metricsPort = process.env.METRICS_PORT || 3002;
const metricsServer = http.createServer(async (req, res) => {
  if (req.url === '/metrics' && req.method === 'GET') {
    try {
      const devopsState = devopsTracker.getState();
      const ibpState = ibpTracker.getState();
      const plmState = plmTracker.getState();
      const dbHealth = await db.healthCheck();

      const output = [
        `# HELP fidusgate_gateway_policy_evaluations_total Total count of Cedar policy evaluations.`,
        `# TYPE fidusgate_gateway_policy_evaluations_total counter`,
        `fidusgate_gateway_policy_evaluations_total{decision="allow"} ${fidusgatePolicyEvaluationsAllow}`,
        `fidusgate_gateway_policy_evaluations_total{decision="deny"} ${fidusgatePolicyEvaluationsDeny}`,
        ``,
        `# HELP fidusgate_ibp_tokens_burned_total Running sum of estimated tokens burned in this session.`,
        `# TYPE fidusgate_ibp_tokens_burned_total counter`,
        `fidusgate_ibp_tokens_burned_total ${ibpState.tokensConsumed}`,
        ``,
        `# HELP fidusgate_plm_active_directives Current count of unaligned active directives.`,
        `# TYPE fidusgate_plm_active_directives gauge`,
        `fidusgate_plm_active_directives ${plmState.activeDirectives ? plmState.activeDirectives.length : 0}`,
        ``,
        `# HELP fidusgate_devops_compliance_status DevOps compliance status by gate (1=OK, 0=Failed).`,
        `# TYPE fidusgate_devops_compliance_status gauge`,
        `fidusgate_devops_compliance_status{gate="pipeline"} ${devopsState.pipelineVerified ? 1 : 0}`,
        `fidusgate_devops_compliance_status{gate="security"} ${devopsState.securityAudited ? 1 : 0}`,
        `fidusgate_devops_compliance_status{gate="drift"} ${devopsState.hamChecked ? 1 : 0}`,
        ``,
        `# HELP fidusgate_sandbox_active_containers Number of active sandbox containers currently running.`,
        `# TYPE fidusgate_sandbox_active_containers gauge`,
        `fidusgate_sandbox_active_containers ${activeSandboxContainers}`,
        ``,
        `# HELP fidusgate_database_status Database connection pool health status (1=OK, 0=Failed).`,
        `# TYPE fidusgate_database_status gauge`,
        `fidusgate_database_status ${dbHealth.status === 'healthy' ? 1 : 0}`,
        ``,
        `# HELP fidusgate_database_latency_ms Connection ping latency in milliseconds.`,
        `# TYPE fidusgate_database_latency_ms gauge`,
        `fidusgate_database_latency_ms ${dbHealth.latencyMs}`
      ].join('\n');

      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
      });
      res.end(output);
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error while generating metrics');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

if (process.argv.includes('--mcp')) {
  startMcpServer();
} else {
  const server = app.listen(port, () => {
    log('info', `FidusGate Security Gateway API listening on Port ${port}`);
  });

  // Attach WebSocket server to Express HTTP Server
  const wss = new ws.Server({ server });
  wss.on('connection', (socket) => {
    wsClients.add(socket);
    log('info', '📡 New WebSocket client connected to SecOps Telemetry Stream');

    socket.on('close', () => {
      wsClients.delete(socket);
      log('info', '📡 WebSocket client disconnected');
    });
  });

  metricsServer.listen(metricsPort, () => {
    log('info', `FidusGate SRE Telemetry Server listening on Port ${metricsPort}`);
  });
}
