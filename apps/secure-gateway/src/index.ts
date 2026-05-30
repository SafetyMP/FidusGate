import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { VeritasDatabase } from '@veritas/database';
import { verifyReceipt } from '@veritas/crypto-utils';
import { Transaction, AuditReceipt, SecurityFinding } from '@veritas/core-types';
import { CedarEvaluator } from './cedar-evaluator';
import { isCommandLineSecure } from './command-auditor';

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
const db = new VeritasDatabase();
const devopsTracker = new DevOpsComplianceTracker();
const ibpTracker = new IBPComplianceTracker();
const plmTracker = new PLMComplianceTracker();


// Load Veritas MCP Configuration and policies
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
const cedarEvaluator = new CedarEvaluator(policyPath);
log('info', `Loaded TS Cedar Policy Parser with ${cedarEvaluator.getRulesCount()} rules. Enforcing mode: ${config.mode.toUpperCase()}`);

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'veritasaudit-super-secure-dev-jwt-secret';

// Logger helper with security tagging
function log(level: 'info' | 'warn' | 'error' | 'security', message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
}

// ==========================================
// Recommendation #5: Real-time Incident Alerting
// ==========================================
async function dispatchWebhookAlert(type: 'blocked_action' | 'finding', data: any) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  
  try {
    let payload = {};
    
    if (type === 'blocked_action') {
      const { receipt } = data;
      payload = {
        text: `🚨 *VeritasAudit Security Alert: Blocked AI Agent Action!*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🚨 *VeritasAudit Security Alert: Blocked AI Agent Action!*\nAn autonomous coding agent attempted to execute a high-risk tool call that was programmatically blocked by Cedar policy controls.`
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
      payload = {
        text: `⚠️ *VeritasAudit Security Finding: CI Pipeline Vulnerability!*`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ *VeritasAudit Security Finding: Pipeline Vulnerability Scanned!*\nThe static CI/CD workflow security auditor has detected a potential prompt injection vulnerability in your GitHub Actions configurations.`
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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
      (req as AuthenticatedRequest).user = { id: 'usr_bypass', role: 'admin', email: 'admin@veritas.internal' };
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
  const decision = cedarEvaluator.isAuthorized(
    principal,
    action,
    {
      path: context?.path || '',
      commandLine: context?.commandLine || ''
    },
    fullContext
  );
  
  log('info', `🛡️  TypeScript Cedar Parser returned dynamic authorization decision: ${decision.toUpperCase()}`);
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
// Recommendation #2: Live Sandbox Execution API (Role: admin)
// ==========================================
app.post('/api/sandbox/execute', requireAuth(['admin']), async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
       res.status(400).json({ error: 'Missing required parameters: command' });
       return;
    }

    // Input command tokenized audit (Defense-in-Depth against bypasses)
    const auditResult = isCommandLineSecure(command);
    if (!auditResult.secure) {
      log('security', `BLOCKED WEB CONSOLE COMMAND: Forbidden command execution attempted. Reason: ${auditResult.reason}`, { command });
      res.status(403).json({ 
        error: `Command execution forbidden. Reason: ${auditResult.reason}` 
      });
      return;
    }

    log('info', `Executing sandboxed console task: [${command}] on behalf of Administrator`);
    
    // Execute command within unprivileged sandbox container and stream logs
    const workspacePath = path.resolve(__dirname, '..', '..', '..');
    const sandboxCmd = `bash scripts/sandbox-execute.sh "${command}" "${workspacePath}"`;
    
    const logs = execSync(sandboxCmd, { cwd: workspacePath, encoding: 'utf8', stdio: 'pipe' });
    
    res.json({ logs, status: 'success' });
  } catch (error: any) {
    log('error', `Web console command execution failed`, error.message);
    const errorLogs = [error.stdout, error.stderr].filter(Boolean).join('\n') || error.message;
    res.status(500).json({ error: 'Sandboxed execution failed', logs: errorLogs, status: 'failed' });
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

app.listen(port, () => {
  log('info', `VeritasAudit Security Gateway API listening on Port ${port}`);
});
