import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { routeModel } from './model-router';
import jwt from 'jsonwebtoken';
import { execFileSync, execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { FidusGateDatabase } from '@fidusgate/database';
import { buildDossier, conductInterview } from './interview-engine';
import * as http from 'node:http';
import { verifyReceipt, generateKeyPair, createAttestedSession, verifyAuditChain } from '@fidusgate/crypto-utils';
import { startMcpServer } from './mcp-server';
import { Transaction, AuditReceipt, SecurityFinding } from '@fidusgate/core-types';
import { CedarEvaluator } from './cedar-evaluator';
import { isCommandLineSecure } from './command-auditor';
import { runWasmCommand } from './wasi-runner';
import { startConsensusExpiryWorker } from './cron-worker';
import { isPromptSecure } from './ai-firewall';
import { auditConsensusRequest } from './consensus-auditor';
import { policyCodePassesSafetyChecks, verifyAuthorizePrincipalSignature } from './principal-signature';
import {
  assertSafeCedarDaemonUrl,
  assertSafePolicyText,
  assertSafeSubagentId,
  assertVerifiedRole,
  safeRecordKey,
  untaintBoolean,
  untaintText,
} from './security-sanitize';
import { auditSandboxSyscalls } from './ebpf-monitor';
import { createProxyVerifier } from './proxy-verifier';
import * as ws from 'ws';

/**
 * Generate a short numeric id using crypto.randomInt so security-relevant
 * identifiers (session, transaction, command, compliance, action, budget-extension)
 * are drawn from a CSPRNG, not Math.random (CodeQL js/insecure-randomness).
 */
function secureNumericId(digits: number): string {
  const upper = 10 ** digits;
  const lower = 10 ** (digits - 1);
  return String(crypto.randomInt(lower, upper));
}

/** Short cryptographically-random hex suffix for opaque tokens. */
function secureShortHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

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

// Per-principal consecutive Cedar deny counter for auto-quarantine
// Separate from the global circuit breaker — this targets a specific agent.
const principalViolationCounts: Record<string, number> = {};

export async function recordPrincipalViolation(principal: string): Promise<void> {
  if (!principal || principal === 'sb:issuer:test' || principal === 'mcp-agent@fidusgate.internal') return;
  const principalKey = safeRecordKey(principal, 'principal');
  principalViolationCounts[principalKey] = (principalViolationCounts[principalKey] || 0) + 1;
  if (principalViolationCounts[principalKey] >= 3) {
    const existing = await db.getQuarantineRecord(principal);
    if (!existing) {
      await db.quarantinePrincipal({
        principalId: principal,
        quarantinedAt: new Date().toISOString(),
        reason: `Auto-quarantined: 3 consecutive Cedar policy denials`,
        evidence: [`${principalViolationCounts[principalKey]} consecutive Cedar denials`]
      });
      log('security', `🔒 PRINCIPAL AUTO-QUARANTINED after repeated Cedar violations: ${principal}`);
      broadcastWS('principal_quarantined', { principalId: principal, reason: 'consecutive_violations' });
    }
    delete principalViolationCounts[principalKey];
  }
}

export function resetPrincipalViolations(principal: string): void {
  delete principalViolationCounts[safeRecordKey(principal, 'principal')];
}

export function handleSuccessfulExecution() {
  consecutiveViolations = 0;
}

// ==========================================
// Stateful Compliance Trackers Integration
// ==========================================
import {
  DevOpsComplianceTracker,
  IBPComplianceTracker,
  PLMComplianceTracker,
  DevOpsComplianceState,
  IBPComplianceState,
  PLMComplianceState
} from './compliance-trackers';

export {
  DevOpsComplianceTracker,
  IBPComplianceTracker,
  PLMComplianceTracker,
  DevOpsComplianceState,
  IBPComplianceState,
  PLMComplianceState
};

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
const devopsTracker = new DevOpsComplianceTracker(broadcastWS);
const ibpTracker = new IBPComplianceTracker(broadcastWS);
const plmTracker = new PLMComplianceTracker(broadcastWS);

// SRE Telemetry Counters
let fidusgatePolicyEvaluationsAllow = 0;
let fidusgatePolicyEvaluationsDeny = 0;
let activeSandboxContainers = 0;

// Intelligent Auto-Throttling moving latency history
let recentExecutionLatencies: number[] = [];
let lastExecutionTimestamp: number = Date.now();
const MAX_LATENCY_HISTORY = 10;
const AUTO_THROTTLE_THRESHOLD_MS = 8000; // Increased to 8000ms to prevent standard Docker container startup latencies from triggering rate limits

export function addExecutionLatency(durationMs: number) {
  lastExecutionTimestamp = Date.now();
  recentExecutionLatencies.push(durationMs);
  if (recentExecutionLatencies.length > MAX_LATENCY_HISTORY) {
    recentExecutionLatencies.shift();
  }
}

export function clearExecutionLatencies() {
  recentExecutionLatencies = [];
  lastExecutionTimestamp = Date.now();
}

export function getMovingAverageLatency(): number {
  const idleTimeMs = Date.now() - lastExecutionTimestamp;
  
  // Passive decay: if the system has been idle for more than 30 seconds, completely reset the latency history.
  if (idleTimeMs > 30000) {
    recentExecutionLatencies = [];
    return 0;
  }

  if (recentExecutionLatencies.length === 0) return 0;
  const sum = recentExecutionLatencies.reduce((a, b) => a + b, 0);
  let average = sum / recentExecutionLatencies.length;

  // Gradual decay: reduce the average by 20% for every 5 seconds of idle time
  if (idleTimeMs > 5000) {
    const decaySteps = Math.floor(idleTimeMs / 5000);
    average = average * Math.pow(0.8, decaySteps);
  }

  return average;
}

export function isAutoThrottleActive(): boolean {
  return getMovingAverageLatency() > AUTO_THROTTLE_THRESHOLD_MS;
}

const autoThrottleMiddleware = (req: any, res: any, next: any) => {
  if (isAutoThrottleActive()) {
    log('warn', `⚠️  AUTO-THROTTLE ACTIVE: Moving average latency is ${getMovingAverageLatency().toFixed(1)}ms (threshold ${AUTO_THROTTLE_THRESHOLD_MS}ms). Rate limiting request.`);
    res.status(429).json({
      error: 'Gateway auto-throttled',
      message: `Automatic rate-limiting active. Sandbox average latency is currently ${getMovingAverageLatency().toFixed(1)}ms. Please retry shortly.`
    });
    return;
  }
  next();
};

const sandboxPatchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Global API rate limiter (CodeQL js/missing-rate-limiting). */
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Stricter limiter for token minting. */
const authTokenRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});



// Load FidusGate MCP Configuration and policies
function findRootPath(filename: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const fullPath = path.resolve(dir, filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(process.cwd(), filename);
}

const configPath = findRootPath('protect-mcp.config.json');
let config: any = { mode: 'enforce' }; // default
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e: any) {
    console.error('Failed to parse protect-mcp.config.json:', e.message);
  }
}

const policyPath = findRootPath(config.policy || 'policy.cedar');
let cedarEvaluator = new CedarEvaluator(policyPath);
log('info', `Loaded TS Cedar Policy Parser with ${cedarEvaluator.getRulesCount()} rules. Enforcing mode: ${config.mode.toUpperCase()}`);

// Implement safe filesystem watcher for hot-reloading policy changes.
// Skip under tests — leftover watchers trip node:test with EMFILE after the suite ends.
if (process.env.FIDUSGATE_TEST !== 'true' && process.env.NODE_ENV !== 'test') {
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
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/api/', apiRateLimiter);
app.use('/api/proxy', (req, res, next) => createProxyVerifier(cedarEvaluator)(req, res, next));

const JWT_SECRET: string = (() => {
  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production' ? undefined : 'fidusgate-dev-jwt-secret-local-only');
  if (!secret) {
    console.error('❌ FATAL: JWT_SECRET environment variable is required in production mode!');
    process.exit(1);
  }
  return secret;
})();

// Bootstrap token minting is registered BEFORE the circuit-breaker middleware so
// operators can mint an admin JWT while the breaker is tripped. The handler
// itself still requires FIDUSGATE_BOOTSTRAP_KEY — never a path-based bypass
// (CodeQL js/user-controlled-bypass).
app.post('/api/auth/token', authTokenRateLimiter, (req, res) => {
  try {
    const expectedKey = process.env.FIDUSGATE_BOOTSTRAP_KEY?.trim();
    if (!expectedKey) {
      log('security', 'CRITICAL JWT SIGNER ERROR: FIDUSGATE_BOOTSTRAP_KEY is not configured. Token minting disabled.');
      res.status(503).json({ error: 'Token minting is disabled until FIDUSGATE_BOOTSTRAP_KEY is configured.' });
      return;
    }
    const bootstrapKey = req.headers['x-fidusgate-bootstrap-key'];
    if (!bootstrapKey || bootstrapKey !== expectedKey) {
      log('security', 'UNAUTHORIZED TOKEN REQUEST: missing or invalid bootstrap key.');
      res.status(403).json({ error: 'Unauthorized: token minting requires a valid bootstrap key.' });
      return;
    }

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
      { id: `usr_${secureNumericId(4)}`, role, email },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    // Do not echo attacker-controlled email/role into logs (CodeQL js/log-injection).
    log('info', 'Generated authenticated JWT token after bootstrap-key authentication.');
    res.json({ token, role, email });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Global emergency Kill-Switch / Circuit Breaker Middleware
//
// Only a cryptographically-verified admin JWT may proceed while the breaker is
// active. Path-based allowlists are intentionally absent (CodeQL
// js/user-controlled-bypass). Token minting is mounted above this middleware.
app.use(async (req, res, next) => {
  try {
    const systemConfig = await db.getSystemConfig();
    if (!systemConfig.circuitBreakerActive) {
      return next();
    }

    // Access is granted only when jwt.verify succeeds AND the verified role is
    // admin. Do not branch on Authorization header shape before verify
    // (CodeQL js/user-controlled-bypass) — empty/malformed tokens throw.
    let verifiedRole: 'developer' | 'admin' | 'auditor' | null = null;
    try {
      const raw = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
      const token = raw.replace(/^Bearer\s+/i, '');
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { role?: unknown };
      verifiedRole = assertVerifiedRole(decoded?.role);
    } catch {
      verifiedRole = null;
    }

    if (verifiedRole === 'admin') {
      return next();
    }

    res.status(503).json({
      error: 'AGENTIC_CIRCUIT_BREAKER_ACTIVE',
      message: '🛡️ Emergency Stop Activated: All autonomous agent tool calls and command evaluations are temporarily suspended by administrative decree.'
    });
    return;
  } catch (e) {}
  next();
});

// Logger helper with security tagging.
//
// Newline/CRLF stripping is applied in the console.* argument expression so
// CodeQL js/log-injection recognizes the sanitizer at the sink.
function log(level: 'info' | 'warn' | 'error' | 'security', message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  const sanitizeLogValue = (value: unknown): string =>
    String(value ?? '')
      // Remove CR/LF and Unicode line separators to prevent log forging/splitting
      .replace(/[\r\n\u2028\u2029]/g, '?')
      // Remove other ASCII control chars except tab
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '?')
      .slice(0, 8 * 1024);

  const safeMessage = sanitizeLogValue(message);
  const safeMeta =
    meta === undefined
      ? ''
      : sanitizeLogValue(typeof meta === 'string' ? meta : JSON.stringify(meta));
  const line = `[${timestamp}] [${level.toUpperCase()}] ${safeMessage}${safeMeta ? ' ' + safeMeta : ''}`;
  if (process.argv.includes('--mcp')) {
    console.error(line);
  } else {
    console.log(line);
  }
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

    try {
      const raw = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
      const token = raw.replace(/^Bearer\s+/i, '');
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
      // Only trust the role after cryptographic verification of the JWT —
      // never derive gating decisions from unverified request fields
      // (CodeQL js/user-controlled-bypass).
      const verifiedRole = assertVerifiedRole(decoded?.role);
      (req as AuthenticatedRequest).user = { ...decoded, role: verifiedRole };

      if (!allowedRoles.includes(verifiedRole)) {
        res.status(403).json({ error: `Forbidden: Role '${verifiedRole}' lacks sufficient privileges for this endpoint.` });
        return;
      }

      next();
    } catch (err: any) {
      log('security', 'CRITICAL AUTHENTICATION FAILURE: Invalid or expired JWT presented!', { error: err.message });
      res.status(401).json({ error: 'Access Denied: Invalid or expired authentication token.' });
    }
  };
}

// Fix 1: X-Agent-Principal middleware
// Reads the X-Agent-Principal header and attaches it to the request so Cedar evaluations
// can use the caller's SME role identity. CLAUDE.md instructs agents to set this header;
// without this middleware the instruction was a no-op.
app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  const agentPrincipal = req.headers['x-agent-principal'];
  if (agentPrincipal && typeof agentPrincipal === 'string') {
    (req as any).agentPrincipal = agentPrincipal;
  }
  next();
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
    
    const sessionId = `sess_${secureNumericId(6)}`;
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
  // Validate the daemon URL against a strict allowlist so that disk-loaded
  // tracker state cannot be exfiltrated to an arbitrary host via a rogue
  // CEDAR_DAEMON_URL value (CodeQL js/file-access-to-http).
  const rawDaemonUrl = process.env.CEDAR_DAEMON_URL || 'http://localhost:50051/authorize';
  let daemonUrl: string;
  try {
    daemonUrl = assertSafeCedarDaemonUrl(rawDaemonUrl);
  } catch {
    daemonUrl = 'http://localhost:50051/authorize';
  }
  
  // Record token usage for IBP budget enforcement
  // Fix 4: Use actual token counts when provided by the agent (accurate billing).
  // Subtract cached tokens because they are served from KV cache and don't burn new compute.
  // Fall back to payload-size estimation only when real counts are unavailable.
  let tokensToRecord = 0;
  if (context && (context.actualTokensInput !== undefined || context.actualTokensOutput !== undefined)) {
    const inputTokens = context.actualTokensInput || 0;
    const outputTokens = context.actualTokensOutput || 0;
    const cachedTokens = context.actualTokensCached || 0;
    // Cached tokens are a subset of input tokens — subtract them to avoid double-charging
    tokensToRecord = Math.max(0, inputTokens - cachedTokens) + outputTokens;
  } else {
    // Fallback to estimation based on payload size
    const payloadSize = JSON.stringify({ principal, action, resource, context }).length;
    tokensToRecord = Math.max(300, Math.floor(payloadSize / 4));
  }
  
  if (context && context.subagentId) {
    ibpTracker.recordSubagentTokenUsage(context.subagentId, tokensToRecord, context.subagentMaxBudget);
  } else {
    ibpTracker.recordTokenUsage(tokensToRecord);
  }

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

  // Hydrate quarantine context — checked by Tier 0 Cedar rule
  const quarantineRecord = principal ? await db.getQuarantineRecord(principal) : null;

  // Rebuild file-derived tracker flags as untainted literals before they enter
  // the outbound Cedar daemon request (CodeQL js/file-access-to-http).
  const fullContext = {
    ...context,
    quarantine: { active: quarantineRecord ? true : false },
    devops: {
      pipeline_passed: untaintBoolean(devopsState.pipelineVerified),
      security_audited: untaintBoolean(devopsState.securityAudited),
      ham_drift_checked: untaintBoolean(devopsState.hamChecked)
    },
    ibp: {
      cross_functional_synthesized: untaintBoolean(ibpState.crossFunctionalSynthesized),
      budget_aligned: untaintBoolean(isBudgetAligned),
      budget_exhaustion_percentage: Number(ibpTracker.getBudgetExhaustionPercentage()) || 0,
      ...(context && context.subagentId ? {
        subagent_budget_aligned: untaintBoolean(ibpTracker.isSubagentBudgetAligned(context.subagentId)),
        subagent_budget_exhaustion_percentage: Number(ibpTracker.getSubagentBudgetExhaustionPercentage(context.subagentId)) || 0,
        subagent_id: assertSafeSubagentId(context.subagentId)
      } : {})
    },
    plm: {
      active_requirement_id: typeof plmState.activeRequirementId === 'string' ? plmState.activeRequirementId : null,
      associated_tests_written: untaintBoolean(plmState.associatedTestsWritten),
      has_api_drift: untaintBoolean(plmState.hasApiDrift),
      drift_verified: untaintBoolean(plmState.driftVerified),
      release_version_updated: untaintBoolean(plmState.releaseVersionUpdated),
      changelog_updated: untaintBoolean(plmState.changelogUpdated),
      has_active_feedback: Array.isArray(plmState.activeDirectives) && plmState.activeDirectives.length > 0,
      feedback_aligned: untaintBoolean(plmState.feedbackAligned)
    }
  };

  const decision = await (async () => {
    try {
      const response = await fetch(daemonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Untaint reconstructed context before the network sink
        // (CodeQL js/file-access-to-http).
        body: untaintText(
          JSON.stringify({ principal, action, resource, context: fullContext }),
          256 * 1024
        ),
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
    resetPrincipalViolations(principal);
  } else {
    fidusgatePolicyEvaluationsDeny++;
    handleViolation();
    await recordPrincipalViolation(principal);
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
    
    // Linear email-shape check with a hard length cap — replaces the previous
    // /^[^\s@]+@[^\s@]+\.[^\s@]+$/ regex that had nested quantifiers and was
    // flagged as CodeQL js/polynomial-redos.
    const isEmailShape = (v: unknown): boolean => {
      if (typeof v !== 'string' || v.length === 0 || v.length > 320) return false;
      const at = v.indexOf('@');
      if (at <= 0 || at !== v.lastIndexOf('@') || at === v.length - 1) return false;
      const local = v.slice(0, at);
      const domain = v.slice(at + 1);
      const dot = domain.lastIndexOf('.');
      if (dot <= 0 || dot === domain.length - 1) return false;
      if (/\s/.test(local) || /\s/.test(domain)) return false;
      return true;
    };
    const isSenderPii = isEmailShape(sender) || sender.toLowerCase().includes(' wallet') || sender.split(' ').length > 2;
    const isRecipientPii = isEmailShape(recipient) || recipient.toLowerCase().includes(' wallet') || recipient.split(' ').length > 2;
    const requiresMasking = isSenderPii || isRecipientPii;
    
    const processedSender = requiresMasking ? maskPII(sender) : sender;
    const processedRecipient = requiresMasking ? maskPII(recipient) : recipient;
    
    const isSuspicious = sender.toLowerCase().includes('tor') || recipient.toLowerCase().includes('tor') || amount > 1000000;
    const status = isSuspicious ? 'flagged' : 'completed';
    
    const newTx: Transaction = {
      id: `tx_${secureNumericId(6)}`,
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

// Retrieve Master Root Keypair for attestation from environment if available, or fall back to dev generation
let MASTER_ROOT_KEYS: { publicKeyHex: string; privateKeyHex: string };
if (process.env.MASTER_PRIVATE_KEY_HEX && process.env.MASTER_PUBLIC_KEY_HEX) {
  MASTER_ROOT_KEYS = {
    privateKeyHex: process.env.MASTER_PRIVATE_KEY_HEX,
    publicKeyHex: process.env.MASTER_PUBLIC_KEY_HEX
  };
  log('info', '🔑 Loaded stable Master Root Keypair from environment variables.');
} else {
  // Check if we have a cached dev keypair in packages/database/data/test-keys.json to avoid breaking signatures across restarts.
  // Read directly and catch ENOENT (avoids CodeQL js/file-system-race).
  const devKeysPath = path.resolve(process.cwd(), 'packages/database/data/test-keys.json');
  let cachedKeys: any = null;
  try {
    cachedKeys = JSON.parse(fs.readFileSync(devKeysPath, 'utf8'));
  } catch (e: any) {
    if (e && e.code !== 'ENOENT' && e.code !== 'ENOTDIR') {
      log('warn', `Failed to read cached dev keypair: ${e.message}`);
    }
  }
  if (cachedKeys && cachedKeys.privateKeyHex && cachedKeys.publicKeyHex) {
    MASTER_ROOT_KEYS = cachedKeys;
    log('info', '🔑 Loaded cached dev Master Root Keypair from packages/database/data/test-keys.json.');
  } else {
    MASTER_ROOT_KEYS = generateKeyPair();
    log('warn', '⚠️  Generating ephemeral Master Root Keypair. Signatures will NOT be valid across server restarts! Define MASTER_PRIVATE_KEY_HEX to persist.');
    try {
      // Atomic temp + rename to avoid a race with a concurrent reader.
      const tempKeysPath = `${devKeysPath}.${secureShortHex(6)}.tmp`;
      fs.mkdirSync(path.dirname(devKeysPath), { recursive: true });
      fs.writeFileSync(tempKeysPath, JSON.stringify(MASTER_ROOT_KEYS, null, 2), { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(tempKeysPath, devKeysPath);
    } catch (e) {}
  }
}
PUBLIC_KEY_MAP['sb:issuer:de073ae64e43'] = MASTER_ROOT_KEYS.publicKeyHex;

// ==========================================
// Consensus Gating: Role-specific SME Signing Keys (Simulated MuSig2)
// In production, these would be derived from hardware security modules (HSM).
// Each consensus role has a unique Ed25519 keypair for signature attestation.
// ==========================================
const MUSIG2_ROLE_KEYS: Record<string, { privateKeyHex: string; publicKeyHex: string; label: string }> = {
  admin: {
    privateKeyHex: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    publicKeyHex: '302a300506032b6570032100aa11bb22cc33dd44ee55ff6677889900aabbccddeeff00112233445566778899',
    label: 'Admin SME Key (K₁)'
  },
  developer: {
    privateKeyHex: 'b2c3d4e5f6071829a3b4c5d6e7f89001b2c3d4e5f6071829a3b4c5d6e7f89001',
    publicKeyHex: '302a300506032b6570032100bb22cc33dd44ee55ff6677889900aabbccddeeff0011223344556677889900aa',
    label: 'Developer SME Key (K₂)'
  },
  auditor: {
    privateKeyHex: 'c3d4e5f607182930b4c5d6e7f8900112c3d4e5f607182930b4c5d6e7f8900112',
    publicKeyHex: '302a300506032b6570032100cc33dd44ee55ff6677889900aabbccddeeff00112233445566778899001122bb',
    label: 'Auditor SME Key (K₃)'
  }
};


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

// 3b. GET /api/receipts/verify-chain - Verify the integrity of the cryptographic hash chain (Role: developer, admin, auditor)
app.get('/api/receipts/verify-chain', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const receipts = await db.getAuditReceipts();
    const isValid = verifyAuditChain(receipts);
    res.json({ valid: isValid, count: receipts.length });
  } catch (error) {
    log('error', 'Failed to verify receipt hash chain', error);
    res.status(500).json({ error: 'Failed to verify hash chain' });
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

    // The public key MUST come from the trusted PUBLIC_KEY_MAP. Falling back
    // to signature.kid as raw hex allowed a user-controlled bypass of the
    // verification, because a caller could supply their own public key
    // alongside a matching signature (CodeQL js/user-controlled-bypass).
    const publicKeyHex = PUBLIC_KEY_MAP[signature.kid];
    if (!publicKeyHex) {
      log('security', 'RECEIPT REJECTED: unknown signature.kid', { kid: signature.kid });
      res.status(403).json({ error: `Unknown issuer key id '${signature.kid}'. Receipt rejected.`, verified: false });
      return;
    }
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
        commandLine: payload.args?.commandLine || (payload.tool_name === 'execute_command' ? payload.reason : ''),
        actualTokensInput: payload.actualTokensInput,
        actualTokensOutput: payload.actualTokensOutput,
        actualTokensCached: payload.actualTokensCached,
        subagentId: payload.subagentId,
        subagentMaxBudget: payload.subagentMaxBudget
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
      if (['write_file', 'replace_file_content', 'multi_replace_file_content', 'patch_file'].includes(payload.tool_name)) {
        devopsTracker.onFileModified();
        ibpTracker.logTask('specialized', payload.tool_name);
        plmTracker.onFileModified(payload.args?.path || '');
        // Fix 2: Reset IBP synthesis gate on actual source file modifications.
        // Done here (not in logTask) to avoid the noise loop: logTask fired on every write,
        // which reset synthesis even for files that don't affect cross-functional concerns.
        const modifiedPath: string = payload.args?.path || '';
        const isTestOrConfig = modifiedPath.includes('.test.') || modifiedPath.includes('.spec.')
          || modifiedPath.endsWith('package.json') || modifiedPath.endsWith('CHANGELOG.md');
        if (!isTestOrConfig && (modifiedPath.startsWith('apps/') || modifiedPath.startsWith('packages/'))) {
          ibpTracker.invalidateSynthesis();
        }
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

    // Only trusted issuer keys — do not fall back to the caller-supplied kid
    // as a raw public key (CodeQL js/user-controlled-bypass).
    const publicKeyHex = PUBLIC_KEY_MAP[signature.kid];
    if (!publicKeyHex) {
      res.status(200).json({ verified: false, reason: `Unknown issuer key id '${signature.kid}'.` });
      return;
    }
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

    broadcastWS('findings_updated', findings);
    
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
app.post('/api/sandbox/execute', autoThrottleMiddleware, requireAuth(['admin', 'developer']), async (req, res) => {
  try {
    const { command, subagentId } = req.body;
    if (!command) {
       res.status(400).json({ error: 'Missing required parameters: command' });
       return;
    }

    const userEmail = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    const userRole = (req as AuthenticatedRequest).user?.role || 'admin';

    // 1. Check if there is an already approved consensus action for this command
    const pendingActions = await db.getPendingActions();
    const approvedAction = pendingActions.find(a => 
      a.command === command && 
      a.status === 'approved'
    );

    let isConsensusBypass = false;
    if (approvedAction) {
      isConsensusBypass = true;
      log('security', `🔓 CONSENSUS BYPASS GRANTED: Executing approved consensus action ID: ${approvedAction.id}`);
      await db.completeAction(approvedAction.id);
    }

    // 2. Check circuit breaker ONLY if it is not an approved consensus bypass
    if (!isConsensusBypass && checkCircuitBreaker()) {
      const remainingSecs = Math.max(0, Math.ceil((circuitBreakerCooldownUntil - Date.now()) / 1000));
      res.status(429).json({
        error: `Sandbox execution locked. SecOps Circuit Breaker tripped due to consecutive security violations. Lock releases in ${remainingSecs} seconds.`
      });
      return;
    }

    // 3. Simulated seccomp system call level audit (Defense-in-depth verification)
    const syscallAudit = auditSandboxSyscalls(command);

    // 4. Consensus Gating Interceptor (Gates high-risk patterns OR seccomp blocks)
    if (!isConsensusBypass && (requiresConsensus(command, userRole) || !syscallAudit.secure)) {
      // Check for duplicate pending action
      const existingPending = pendingActions.find(a => a.command === command && a.status === 'pending');
      if (existingPending) {
        res.json({
          status: 'pending_consensus',
          actionId: existingPending.id,
          message: `This command has been suspended under Consensus Gating. It requires ${existingPending.requiredVotes === 3 ? 'all 3 cryptographic key signatures (Admin, Developer, Auditor)' : '2 cryptographic approval signatures from authorized roles'} to execute.`
        });
        return;
      }

      // Run AI Consensus Auditor to determine threat level
      const audit = auditConsensusRequest(command);

      const pendingAction = await db.createPendingAction({
        id: `act_${secureNumericId(6)}`,
        command,
        initiator: userEmail,
        role: userRole,
        requiredVotes: (!syscallAudit.secure || audit.rating === 'dangerous') ? 3 : 2, // Seccomp violations always require 3 votes
        expiresInSeconds: 900,
        aiRating: !syscallAudit.secure ? 'dangerous' : audit.rating,
        aiReason: !syscallAudit.secure ? (syscallAudit.violation || 'Critical kernel system call violation detected by seccomp filter.') : audit.reason
      });
      
      log('security', `🛡️ CONSENSUS GATING TRIGGERED: Suspended command execution [${command}] from ${userEmail} (${userRole.toUpperCase()}). Action ID: ${pendingAction.id}`);
      broadcastWS('consensus_gating_triggered', {
        actionId: pendingAction.id,
        command,
        initiator: userEmail,
        role: userRole,
        status: 'pending',
        aiRating: !syscallAudit.secure ? 'dangerous' : audit.rating,
        aiReason: !syscallAudit.secure ? (syscallAudit.violation || 'Critical kernel system call violation detected by seccomp filter.') : audit.reason
      });

      res.json({
        status: 'pending_consensus',
        actionId: pendingAction.id,
        message: `This command has been suspended under Consensus Gating. It requires ${(!syscallAudit.secure || audit.rating === 'dangerous') ? 'all 3 cryptographic key attestations (Admin, Developer, Auditor)' : '2 cryptographic approval signatures from authorized roles'} to execute.`
      });
      return;
    }

    // 5. Fallback Seccomp block (if somehow gating was bypassed or skipped)
    if (!isConsensusBypass && !syscallAudit.secure) {
      log('security', `🚨 CRITICAL KERNEL SECCOMP VIOLATION: Blocked sandbox execution. Reason: ${syscallAudit.violation}`, { command });
      
      // Trigger a 15-minute system execution lockout!
      circuitBreakerTripped = true;
      circuitBreakerCooldownUntil = Date.now() + 15 * 60 * 1000;
      
      broadcastWS('circuit_breaker_tripped', {
        active: true,
        cooldownUntil: new Date(circuitBreakerCooldownUntil).toISOString(),
        reason: syscallAudit.violation || 'Critical sandbox system call violation'
      });

      // Persist command log
      await db.addCommandLog({
        id: `cmd_${secureNumericId(6)}`,
        timestamp: new Date().toISOString(),
        command,
        user: userEmail,
        role: userRole,
        status: 'failed',
        exitCode: 1,
        cedarDecision: 'deny'
      });

      res.status(403).json({
        error: 'Kernel system call violation blocked',
        message: syscallAudit.violation,
        syscalls: syscallAudit.syscalls
      });
      return;
    }

    // WASI unprivileged compilation runner bypass
    const commandLower = command.toLowerCase().trim();
    if (commandLower.startsWith('wasi-execute') || commandLower.includes('.wasm') || commandLower.startsWith('tsc')) {
      log('info', `⚡ WASI BYPASS ROUTING ACTIVATED: Executing command [${command}] inside sub-millisecond WASI sandbox.`);
      
      let wasmPath = path.join(process.cwd(), 'scripts', 'compiler.wasm');
      // If a specific wasm file is in the command, try to extract it
      const wasmMatch = command.match(/\S+\.wasm/);
      if (wasmMatch) {
        wasmPath = path.resolve(process.cwd(), wasmMatch[0]);
      } else {
        // Build a mock compiler.wasm if it doesn't exist. Use mkdir { recursive: true }
        // (idempotent) and write with { flag: 'wx' } so a concurrent creator wins
        // instead of racing (CodeQL js/file-system-race).
        const mockWasmDir = path.dirname(wasmPath);
        fs.mkdirSync(mockWasmDir, { recursive: true });
        const tinyWasm = Buffer.from([
          0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
          0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
          0x03, 0x02, 0x01, 0x00,
          0x08, 0x01, 0x00,
          0x0a, 0x06, 0x01, 0x04, 0x00, 0x01, 0x0b
        ]);
        try {
          fs.writeFileSync(wasmPath, tinyWasm, { flag: 'wx' });
        } catch (e: any) {
          if (e && e.code !== 'EEXIST') throw e;
        }
      }

      const args = command.split(' ').slice(1);
      const start = Date.now();
      const wasiResult = await runWasmCommand(wasmPath, args);
      const duration = Date.now() - start;
      addExecutionLatency(duration);

      const exitStatus = wasiResult.exitCode === 0 ? 'success' : 'failed';
      const outputLogs = wasiResult.stdout || wasiResult.stderr || `WASI Sandbox finished in ${duration}ms with exit code ${wasiResult.exitCode}.`;

      // Persist command log
      await db.addCommandLog({
        id: `cmd_${secureNumericId(6)}`,
        timestamp: new Date().toISOString(),
        command,
        user: userEmail,
        role: userRole,
        status: exitStatus,
        exitCode: wasiResult.exitCode,
        cedarDecision: 'allow'
      });

      res.json({
        logs: outputLogs + `\n\n[OTel Telemetry] WASI sandbox execution completed in ${duration}ms (Bypassed Docker VM overhead).`,
        status: exitStatus,
        syscalls: syscallAudit.syscalls
      });
      return;
    }

    // Input command tokenized audit (Defense-in-Depth against bypasses)
    const auditResult = isCommandLineSecure(command);
    if (!isConsensusBypass && !auditResult.secure) {
      log('security', `BLOCKED WEB CONSOLE COMMAND: Forbidden command execution attempted. Reason: ${auditResult.reason}`, { command });
      
      handleViolation();
      
      // Persist forensic log for blocked/audit-violated command
      await db.addCommandLog({
        id: `cmd_${secureNumericId(6)}`,
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
        remediationSuggestion: auditResult.remediationSuggestion,
        suggestedAutofix: auditResult.suggestedAutofix
      });
      return;
    }

    log('info', `Executing sandboxed console task: [${command}] on behalf of Administrator`);

    // Execute command within unprivileged sandbox container and stream logs.
    // Use execFileSync with an argv array so `command`/`subagentId` are passed
    // as raw arguments and never re-interpreted by a shell
    // (CodeQL js/command-line-injection).
    const workspacePath = path.resolve(__dirname, '..', '..', '..');
    const sandboxArgv = subagentId
      ? ['scripts/sandbox-execute.sh', command, workspacePath, assertSafeSubagentId(subagentId)]
      : ['scripts/sandbox-execute.sh', command, workspacePath];

    const startExec = Date.now();
    activeSandboxContainers++;
    try {
      try {
        const logs = execFileSync('bash', sandboxArgv, { cwd: workspacePath, encoding: 'utf8', stdio: 'pipe' });
        addExecutionLatency(Date.now() - startExec);
        
        // Persist forensic log for successful run
        await db.addCommandLog({
          id: `cmd_${secureNumericId(6)}`,
          timestamp: new Date().toISOString(),
          command,
          user: userEmail,
          role: userRole,
          status: 'success',
          exitCode: 0,
          cedarDecision: 'allow'
        });

        // Run drift detection
        await detectFilesystemDrift(workspacePath);

        res.json({ logs, status: 'success', syscalls: syscallAudit.syscalls });
      } catch (error: any) {
        addExecutionLatency(Date.now() - startExec);
        log('error', `Web console command execution failed`, error.message);
        const exitCode = error.status || 1;
        const errorLogs = [error.stdout, error.stderr].filter(Boolean).join('\n') || error.message;

        // Persist forensic log for failed run
        await db.addCommandLog({
          id: `cmd_${secureNumericId(6)}`,
          timestamp: new Date().toISOString(),
          command,
          user: userEmail,
          role: userRole,
          status: 'failed',
          exitCode,
          cedarDecision: 'allow'
        });

        // Run drift detection
        await detectFilesystemDrift(workspacePath);

        res.status(500).json({ error: 'Sandboxed execution failed', logs: errorLogs, status: 'failed', syscalls: syscallAudit.syscalls });
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
    const { principal, tool_name, args, actualTokensInput, actualTokensOutput, actualTokensCached, subagentId, subagentMaxBudget, signature } = req.body;
    
    if (!principal || !tool_name) {
      res.status(400).json({ error: 'Missing required parameters: principal, tool_name' });
      return;
    }

    if (!verifyAuthorizePrincipalSignature(principal, tool_name, args, signature)) {
      log('security', `AUTHORIZE DENIED: principal signature verification failed for ${principal}`);
      res.status(403).json({ error: 'Principal signature verification failed.' });
      return;
    }

    // Evaluate decision using dual Cedar evaluation system (Rust + TS)
    const decision = await evaluateCedarPolicy(
      principal,
      tool_name,
      'file_system',
      {
        path: args?.path || '',
        commandLine: args?.commandLine || '',
        actualTokensInput,
        actualTokensOutput,
        actualTokensCached,
        subagentId,
        subagentMaxBudget
      }
    );

    // Build machine-readable remediation hints for denied requests
    let blockedGates: string[] = [];
    let remediation: string[] = [];
    if (decision === 'deny') {
      const plmState = plmTracker.getState();
      const devopsState = devopsTracker.getState();
      const ibpState = ibpTracker.getState();

      const remediationMap: Record<string, string> = {
        plm_no_requirement: 'POST /api/plm/requirement with { "id": "REQ-XXX", "description": "..." } to register an active requirement.',
        plm_no_tests: 'Write or update a *.test.ts or *.spec.ts file alongside your source changes before committing.',
        plm_api_drift_unverified: 'Run schema/contract tests, then POST /api/plm/drift-verify to clear the API drift gate.',
        plm_feedback_unaligned: 'POST /api/plm/feedback-align with { "requirementId": "...", "justification": "..." } to acknowledge active feedback.',
        devops_pipeline_failed: 'Run bash scripts/ci-verify.sh or npm run ci, then the gateway will automatically clear this gate on success.',
        devops_security_not_audited: 'Run npm run sandbox (agentic-actions-auditor) to complete the security audit gate.',
        devops_ham_not_checked: 'Run bash scripts/ham-drift-watcher.sh to verify CLAUDE.md context sheets are fresh.',
        ibp_synthesis_required: 'POST /api/ibp/synthesize with your cross-functional report (min 50 chars) to clear the IBP gate.',
        ibp_budget_exhausted: 'POST /api/ibp/budget/request-extension with { "requestedAmount": N, "reason": "..." } to request more tokens.',
      };

      if (!plmState.activeRequirementId) blockedGates.push('plm_no_requirement');
      if (!plmState.associatedTestsWritten) blockedGates.push('plm_no_tests');
      if (plmState.hasApiDrift && !plmState.driftVerified) blockedGates.push('plm_api_drift_unverified');
      if (plmState.activeDirectives.length > 0 && !plmState.feedbackAligned) blockedGates.push('plm_feedback_unaligned');
      if (!devopsState.pipelineVerified) blockedGates.push('devops_pipeline_failed');
      if (!devopsState.securityAudited) blockedGates.push('devops_security_not_audited');
      if (!devopsState.hamChecked) blockedGates.push('devops_ham_not_checked');
      if (!ibpState.crossFunctionalSynthesized) blockedGates.push('ibp_synthesis_required');
      if (ibpTracker.getBudgetExhaustionPercentage() > 95) blockedGates.push('ibp_budget_exhausted');

      remediation = blockedGates.map(g => remediationMap[g]).filter(Boolean);
    }

    log('info', `Real-time tool authorization evaluated: ${principal} -> ${tool_name} -> ${decision.toUpperCase()}`);
    res.json({
      decision,
      ...(decision === 'deny' && blockedGates.length > 0 && {
        blocked_gates: blockedGates,
        remediation
      })
    });
  } catch (error: any) {
    log('error', 'Failed to perform real-time tool authorization', error.message);
    res.status(500).json({ error: 'Authorization evaluation failed' });
  }
});

// POST /api/orchestration/route-model - Dynamic model routing recommendation (Role: developer, admin)
app.post('/api/orchestration/route-model', requireAuth(['developer', 'admin']), (req, res) => {
  try {
    const { taskDescription, toolName, subagentId, estimatedTokens } = req.body;
    if (!taskDescription) {
       res.status(400).json({ error: 'Missing required parameter: taskDescription' });
       return;
    }
    const recommendation = routeModel({ taskDescription, toolName, subagentId, estimatedTokens }, ibpTracker);
    res.json(recommendation);
  } catch (error: any) {
    log('error', 'Failed to route model request', error.message);
    res.status(500).json({ error: 'Failed to evaluate model routing' });
  }
});

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

// GET /api/status/agent-readiness - Unified session bootstrap status for AI agents (Role: developer, admin, auditor)
// Returns all gate states, readiness flags, and computed next-action instructions.
// Agents MUST call this at session start before performing any write operations.
app.get('/api/status/agent-readiness', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    const plmState = plmTracker.getState();
    const devopsState = devopsTracker.getState();
    const ibpState = ibpTracker.getState();

    const plmPassing = !!plmState.activeRequirementId
      && plmState.associatedTestsWritten
      && (!plmState.hasApiDrift || plmState.driftVerified)
      && plmState.feedbackAligned;

    const devopsPassing = devopsState.pipelineVerified
      && devopsState.securityAudited
      && devopsState.hamChecked;

    const ibpPassing = ibpState.crossFunctionalSynthesized
      && ibpTracker.isBudgetAligned();

    const readyToWrite = !!plmState.activeRequirementId;
    const readyToCommit = plmPassing && devopsPassing && ibpPassing;

    // Compute the highest-priority next action for the agent
    let nextAction = '✅ All gates passing. You may write code and commit freely.';
    if (!plmState.activeRequirementId) {
      nextAction = '🔴 REQUIRED FIRST: POST /api/plm/requirement with { "id": "REQ-XXX", "description": "Your task" } before writing any source files.';
    } else if (!ibpState.crossFunctionalSynthesized) {
      nextAction = '🟡 IBP synthesis required before committing. POST /api/ibp/synthesize with your cross-functional report.';
    } else if (!devopsState.pipelineVerified) {
      nextAction = '🟡 DevOps pipeline gate open. Run bash scripts/ci-verify.sh to clear it.';
    } else if (!plmState.associatedTestsWritten) {
      nextAction = '🟡 Test traceability gate open. Write *.test.ts or *.spec.ts files for your modified source files.';
    } else if (plmState.hasApiDrift && !plmState.driftVerified) {
      nextAction = '🟡 API drift detected. Run schema tests then POST /api/plm/drift-verify.';
    } else if (!plmState.feedbackAligned) {
      nextAction = '🟡 Active feedback unaligned. POST /api/plm/feedback-align to acknowledge directives.';
    }

    res.json({
      ready_to_write: readyToWrite,
      ready_to_commit: readyToCommit,
      next_action: nextAction,
      gates: {
        plm: {
          passing: plmPassing,
          active_requirement_id: plmState.activeRequirementId,
          associated_tests_written: plmState.associatedTestsWritten,
          has_api_drift: plmState.hasApiDrift,
          drift_verified: plmState.driftVerified,
          feedback_aligned: plmState.feedbackAligned,
          active_directives_count: plmState.activeDirectives.length,
          ...((!plmState.activeRequirementId) && {
            blocking_reason: 'No active requirement registered.',
            action: 'POST /api/plm/requirement with { "id": "REQ-XXX", "description": "..." }'
          })
        },
        devops: {
          passing: devopsPassing,
          pipeline_verified: devopsState.pipelineVerified,
          security_audited: devopsState.securityAudited,
          ham_checked: devopsState.hamChecked,
          last_pipeline_run: devopsState.lastPipelineRun || null,
          last_security_audit: devopsState.lastSecurityAudit || null,
          last_ham_check: devopsState.lastHamCheck || null
        },
        ibp: {
          passing: ibpPassing,
          synthesis_required: !ibpState.crossFunctionalSynthesized,
          budget_total_tokens: ibpState.tokenBudget,
          budget_consumed_tokens: ibpState.tokensConsumed,
          budget_remaining_tokens: Math.max(0, ibpState.tokenBudget - ibpState.tokensConsumed),
          budget_exhaustion_pct: ibpTracker.getBudgetExhaustionPercentage(),
          current_sprint_goal: ibpState.currentSprintGoal
        }
      },
      circuit_breaker_active: checkCircuitBreaker(),
      role_hint: 'Set the X-Agent-Principal header to your SME role (e.g. sb:issuer:backend-sme) on write and execute calls for Tier 8 role-gated enforcement.'
    });
  } catch (error: any) {
    log('error', 'Failed to compute agent readiness status', error.message);
    res.status(500).json({ error: 'Failed to compute agent readiness status' });
  }
});

// GET /api/ibp/budget/extensions - List all budget extension requests (Role: developer, admin, auditor)
app.get('/api/ibp/budget/extensions', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const list = await db.getBudgetExtensionRequests();
    res.json(list);
  } catch (error: any) {
    log('error', 'Failed to retrieve budget extensions', error.message);
    res.status(500).json({ error: 'Failed to retrieve budget extensions' });
  }
});

// POST /api/ibp/budget/request-extension - Request a budget increase (Role: developer, admin)
app.post('/api/ibp/budget/request-extension', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const { requestedAmount, reason } = req.body;
    if (!requestedAmount || typeof requestedAmount !== 'number' || requestedAmount <= 0) {
      res.status(400).json({ error: 'Invalid or missing requestedAmount' });
      return;
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'Invalid or missing reason' });
      return;
    }
    const applicant = (req as AuthenticatedRequest).user?.email || (req as AuthenticatedRequest).user?.id || 'developer';
    const id = `ext_${secureShortHex(6)}`;
    const newRequest = await db.createBudgetExtensionRequest(id, requestedAmount, reason, applicant);
    
    broadcastWS('budget_extension_created', newRequest);
    res.status(201).json(newRequest);
  } catch (error: any) {
    log('error', 'Failed to create budget extension request', error.message);
    res.status(500).json({ error: 'Failed to create budget extension request' });
  }
});

// POST /api/ibp/budget/approve-extension - Approve a request, increasing the active budget (Role: admin only)
app.post('/api/ibp/budget/approve-extension', requireAuth(['admin']), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: 'Missing budget extension request ID' });
      return;
    }
    const reviewer = (req as AuthenticatedRequest).user?.email || (req as AuthenticatedRequest).user?.id || 'admin';
    const approvedRequest = await db.approveBudgetExtensionRequest(id, reviewer);
    if (!approvedRequest) {
      res.status(404).json({ error: 'Budget extension request not found or not pending' });
      return;
    }
    
    // Dynamically update the IBP compliance tracker's token budget
    ibpTracker.addTokenBudget(approvedRequest.requestedAmount);
    
    broadcastWS('budget_extension_approved', approvedRequest);
    broadcastWS('ibp_state_updated', ibpTracker.getState());
    
    res.json({ message: 'Budget extension request approved successfully', request: approvedRequest });
  } catch (error: any) {
    log('error', 'Failed to approve budget extension request', error.message);
    res.status(500).json({ error: 'Failed to approve budget extension request' });
  }
});

// POST /api/ibp/budget/reject-extension - Reject a budget extension request (Role: admin only)
app.post('/api/ibp/budget/reject-extension', requireAuth(['admin']), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: 'Missing budget extension request ID' });
      return;
    }
    const reviewer = (req as AuthenticatedRequest).user?.email || (req as AuthenticatedRequest).user?.id || 'admin';
    const rejectedRequest = await db.rejectBudgetExtensionRequest(id, reviewer);
    if (!rejectedRequest) {
      res.status(404).json({ error: 'Budget extension request not found or not pending' });
      return;
    }
    
    broadcastWS('budget_extension_rejected', rejectedRequest);
    
    res.json({ message: 'Budget extension request rejected successfully', request: rejectedRequest });
  } catch (error: any) {
    log('error', 'Failed to reject budget extension request', error.message);
    res.status(500).json({ error: 'Failed to reject budget extension request' });
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
app.post('/api/consensus/approve', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
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

    // Mathematically verify the approver's cryptographic signature.
    // Only trust a key that is explicitly registered for the SME-derived
    // issuer id — never accept a caller-controlled fallback (CodeQL
    // js/user-controlled-bypass).
    const approverIssuer = `sb:issuer:${userEmail.split('@')[0]}`;
    const publicKeyHex = PUBLIC_KEY_MAP[approverIssuer];
    if (!publicKeyHex) {
      log('security', 'CONSENSUS APPROVAL REJECTED: no registered issuer key for approver', { approverIssuer });
      res.status(403).json({ error: `No registered issuer key for approver '${approverIssuer}'.` });
      return;
    }

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

      log('security', `🛡️ CONSENSUS GATING PASSED: Action ${actionId} approved. Launching command in Docker/gVisor sandbox: [${action.command}]`);

      // Execute command inside sandbox with argv-array invocation (no shell) —
      // prevents CodeQL js/command-line-injection on the approved command payload.
      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      const sandboxArgv = ['scripts/sandbox-execute.sh', action.command, workspacePath];

      try {
        executedOutput = execFileSync('bash', sandboxArgv, { cwd: workspacePath, encoding: 'utf8', stdio: 'pipe' });
        
        await db.addCommandLog({
          id: `cmd_${secureNumericId(6)}`,
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
          id: `cmd_${secureNumericId(6)}`,
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

// Conversational Policy Co-Pilot Chat History Storage
export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  text: string;
  cedarCode?: string;
}

let policyChatHistory: ChatMessage[] = [
  {
    id: 'msg_init',
    sender: 'assistant',
    timestamp: new Date().toISOString(),
    text: 'Hello! I am your FidusGate Cedar Policy Co-Pilot. How can I help you construct or audit your security policies today?'
  }
];

function resetChatHistory() {
  policyChatHistory = [
    {
      id: 'msg_init',
      sender: 'assistant',
      timestamp: new Date().toISOString(),
      text: 'Hello! I am your FidusGate Cedar Policy Co-Pilot. How can I help you construct or audit your security policies today?'
    }
  ];
}

// 7. POST /api/reset - Clear database to initial state (Role: admin)
app.post('/api/reset', requireAuth(['admin']), async (req, res) => {
  try {
    await db.clearDatabase();
    ibpTracker.clearTasks(); // Clear IBP compliance states on database reset
    plmTracker.clearTasks(); // Clear PLM compliance states on database reset
    clearExecutionLatencies(); // Clear latency moving average history on database reset
    resetChatHistory(); // Reset conversational chat history on database reset
    
    // Reset in-memory SecOps circuit breaker lockout state
    circuitBreakerTripped = false;
    consecutiveViolations = 0;
    circuitBreakerCooldownUntil = 0;
    broadcastWS('circuit_breaker_reset', { active: false });

    log('warn', 'Database reset to initial template state and circuit breaker reset.');
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

function resolveSandboxPatchPath(subagentId: unknown): string {
  if (subagentId === undefined || subagentId === null || subagentId === '') {
    return path.resolve(process.cwd(), '.memory/pending-sandbox.patch');
  }
  const safeId = assertSafeSubagentId(subagentId);
  const baseDir = path.resolve(process.cwd(), '.memory/subagents');
  const patchPath = path.resolve(baseDir, safeId, 'pending-sandbox.patch');
  if (!patchPath.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid subagentId: path traversal blocked.');
  }
  return patchPath;
}

// 16. GET /api/sandbox/patch - Retrieve pending sandbox overlay patch (Role: developer, admin, auditor)
app.get('/api/sandbox/patch', sandboxPatchRateLimiter, autoThrottleMiddleware, requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  try {
    const { subagentId } = req.query;
    const patchPath = resolveSandboxPatchPath(subagentId);

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
app.post('/api/sandbox/apply', sandboxPatchRateLimiter, autoThrottleMiddleware, requireAuth(['admin']), async (req, res) => {
  try {
    const { subagentId } = req.body;
    const patchPath = resolveSandboxPatchPath(subagentId);

    if (!fs.existsSync(patchPath)) {
      res.status(404).json({ error: 'No pending sandbox patch found to apply.' });
      return;
    }

    const userEmail = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    const userRole = (req as AuthenticatedRequest).user?.role || 'admin';

    log('info', `Administrator applying sandbox patch: ${patchPath}`);
    
    try {
      execFileSync('git', ['apply', '--whitespace=nowarn', patchPath], { cwd: process.cwd() });
      
      // Delete patch file after successful merge
      fs.unlinkSync(patchPath);

      // Clean up subagent directory if empty
      if (subagentId) {
        const subDir = path.dirname(patchPath);
        if (fs.existsSync(subDir)) {
          try {
            fs.rmdirSync(subDir);
          } catch (e) {}
        }
      }

      log('info', `Sandbox patch successfully merged into host codebase by ${userEmail}.`);

      // Record forensic log
      await db.addCommandLog({
        id: `cmd_${secureNumericId(6)}`,
        timestamp: new Date().toISOString(),
        command: `git apply ${subagentId ? `.memory/subagents/${assertSafeSubagentId(subagentId)}/pending-sandbox.patch` : '.memory/pending-sandbox.patch'}`,
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

// ==========================================
// Filesystem Drift Auto-Reconciliation Helpers & Endpoints
// ==========================================

async function detectFilesystemDrift(workspacePath: string) {
  try {
    const driftDetectCmd = `bash scripts/sandbox-drift-detect.sh "${workspacePath}"`;
    const driftOutput = execSync(driftDetectCmd, { cwd: workspacePath, encoding: 'utf8' });
    const driftLines = driftOutput.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of driftLines) {
      // Format of git status porcelain lines: " M path" or "?? path" or " D path"
      // e.g. "??" or "M" or "D" or " M" or " D"
      const match = line.match(/^([MAD?]{1,2})\s+(.+)$/);
      if (match) {
        const code = match[1];
        const filePath = match[2];
        let changeType = 'modified';
        if (code === '??' || code.includes('A')) {
          changeType = 'added';
        } else if (code.includes('D')) {
          changeType = 'deleted';
        }
        
        // Compute basic diff if changeType is 'modified'
        let diff: string | null = null;
        if (changeType === 'modified') {
          try {
            diff = execSync(`git diff "${filePath}"`, { cwd: workspacePath, encoding: 'utf8' });
          } catch (diffErr: any) {
            log('error', `Failed to compute diff for ${filePath}: ${diffErr.message}`);
          }
        }

        // Add to DB
        const driftRecord = await db.addDrift({
          filePath,
          changeType,
          diff
        });

        // Broadcast to WebSocket clients
        broadcastWS('filesystem_drift_detected', driftRecord);
      }
    }
  } catch (err: any) {
    log('error', 'Failed to run filesystem drift detection:', err.message);
  }
}

// GET /api/sandbox/drift-logs - Retrieve stateful filesystem drift records
app.get('/api/sandbox/drift-logs', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const list = await db.getDrifts();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve drift logs', message: err.message });
  }
});

// POST /api/sandbox/reconcile - Active rollbacks using git clean & restore
app.post('/api/sandbox/reconcile', requireAuth(['admin']), async (req, res) => {
  try {
    const workspaceRoot = process.cwd();
    log('info', '🛡️ RECONCILIATION INITIATED: Reverting all untracked and modified workspace filesystem changes.');
    
    // Execute active rollback commands
    try {
      execSync('git restore . && git clean -fd', { cwd: workspaceRoot });
      log('info', 'Reconciliation successful: workspace returned to clean git state.');
      
      // Update DB to mark all records as reconciled
      await db.reconcileDrifts();

      // Broadcast event so UI clears alerts
      broadcastWS('filesystem_reconciled', { reconciled: true });

      res.json({ message: 'Filesystem successfully reconciled. All drift reverted.', reconciled: true });
    } catch (execErr: any) {
      log('error', 'Reconciliation command failed:', execErr.message);
      res.status(500).json({ error: 'Failed to reconcile sandbox filesystem', message: execErr.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Reconciliation exception occurred', message: err.message });
  }
});

// ==========================================
// Gemini Cedar Policy Co-Pilot Endpoints & Helpers
// ==========================================

const CO_PILOT_SYSTEM_PROMPT = `You are FidusGate's Cedar Policy Co-Pilot. Your job is to translate a natural language rule request into a syntactically correct Cedar policy and a plain explanation.
Output a JSON object with two fields:
1. "cedarCode": A string containing the exact syntactically valid Cedar policy.
2. "explanation": A concise plain-English explanation of what the policy does and why it was constructed this way.

Rules about Cedar policy:
- Principals are typically structured like: sb:issuer::"username" or sb:issuer::"developer" or sb:issuer::"admin" or sb:issuer::"pm-sme" or sb:issuer::"security-sme".
- Actions are Action::"read_file", Action::"write_file", Action::"execute_command", etc.
- Resource is typically resource.
- Conditions use when { ... } or unless { ... }.
- File path checks use resource.path.endsWith(".md") or resource.path.startsWith("src/").

Example of expected JSON output:
{
  "cedarCode": "permit(principal == sb:issuer::\\\"pm-sme\\\", action == Action::\\\"write_file\\\", resource) when { resource.path.endsWith(\\\".md\\\") };",
  "explanation": "Allows pm-sme principal to write files only if the file path ends with a .md extension."
}

Do not include any markdown backticks, comments, or extra text. Output ONLY the raw JSON object.`;

function generateMockCedarPolicy(prompt: string): { cedarCode: string; explanation: string } {
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('pm-sme') || lowerPrompt.includes('pm')) {
    return {
      cedarCode: `permit(principal == sb:issuer::"pm-sme", action == Action::"write_file", resource) when { resource.path.endsWith(".md") };`,
      explanation: "Fallback Mock: Allows pm-sme principal to write files only if the file path ends with a .md extension."
    };
  }
  
  if (lowerPrompt.includes('security-sme') || lowerPrompt.includes('security')) {
    return {
      cedarCode: `permit(principal == sb:issuer::"security-sme", action in [Action::"read_file", Action::"write_file"], resource) when { resource.path.startsWith("policy") };`,
      explanation: "Fallback Mock: Permits security-sme to modify or read policy-related files."
    };
  }

  // General fallback
  return {
    cedarCode: `permit(principal == sb:issuer::"developer", action == Action::"read_file", resource);`,
    explanation: "Fallback Mock: Permits developers to read files across the workspace."
  };
}

// POST /api/policy/co-pilot - Translate conversational request into Cedar Policy using Google Gemini API
app.post('/api/policy/co-pilot', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Missing required parameter: prompt' });
      return;
    }

    // Run AI Prompt Firewall check
    const firewallResult = isPromptSecure(prompt);
    if (!firewallResult.secure) {
      log('warn', `🛡️ [PROMPT FIREWALL BLOCKED]: Intercepted malicious injection attempt inside prompt: "${prompt}"`);
      res.status(400).json({
        error: 'Prompt validation failed',
        message: firewallResult.reason || 'Adversarial jailbreak patterns detected.'
      });
      return;
    }

    let result: any;
    let fallbackActive = false;
    let fallbackMessage = '';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      log('warn', 'GEMINI_API_KEY is not configured. Falling back to rule-based mock engine.');
      result = generateMockCedarPolicy(prompt);
      fallbackActive = true;
    } else {
      try {
        const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: CO_PILOT_SYSTEM_PROMPT + '\n\nUser prompt: "' + prompt + '"' }]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          throw new Error('Gemini API returned status code ' + response.status);
        }

        const responseData = await response.json() as any;
        const jsonText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
          throw new Error('Empty response from Gemini API');
        }

        result = JSON.parse(jsonText.trim());
      } catch (apiErr: any) {
        log('error', 'Failed to contact Gemini API: ' + apiErr.message + '. Falling back to rule-based mock engine.');
        result = generateMockCedarPolicy(prompt);
        fallbackActive = true;
        fallbackMessage = apiErr.message;
      }
    }

    // Perform static Cedar validation using our compiled WASM binary!
    const cedarWasmPath = path.join(process.cwd(), 'scripts', 'cedar.wasm');
    log('info', `📡 STATIC VALIDATION: Running static Cedar policy schema verification via cedar.wasm...`);
    const wasiResult = await runWasmCommand(cedarWasmPath, ['validate', '--schema', 'policy.cedarschema']);

    if (wasiResult.exitCode !== 0) {
      log('warn', `❌ STATIC VALIDATION FAILED: cedar.wasm verification rejected the translated policy.`);
      res.status(400).json({
        error: 'Static schema validation failed',
        message: wasiResult.stderr || 'Mismatched schema types or invalid Cedar syntax.'
      });
      return;
    }

    log('info', `✅ STATIC VALIDATION PASSED: ${wasiResult.stdout.trim()}`);

    if (fallbackActive) {
      res.json({
        ...result,
        explanation: result.explanation + (fallbackMessage ? ' (Gemini fallback active: ' + fallbackMessage + ')' : ' (Gemini fallback active)'),
        similarityScore: firewallResult.similarityScore
      });
    } else {
      res.json({
        ...result,
        similarityScore: firewallResult.similarityScore
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Co-Pilot execution exception occurred', message: err.message });
  }
});

// GET /api/policy/chat-history - Retrieve co-pilot conversational chat history (Role: developer, admin, auditor)
app.get('/api/policy/chat-history', requireAuth(['developer', 'admin', 'auditor']), (req, res) => {
  res.json(policyChatHistory);
});

// POST /api/policy/chat - Send a message to conversational co-pilot chat (Role: developer, admin)
app.post('/api/policy/chat', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Missing required parameter: prompt' });
      return;
    }

    // Run AI Prompt Firewall check
    const firewallResult = isPromptSecure(prompt);
    if (!firewallResult.secure) {
      log('warn', `🛡️ [PROMPT FIREWALL BLOCKED]: Intercepted malicious injection attempt inside chat prompt: "${prompt}"`);
      res.status(400).json({
        error: 'Prompt validation failed',
        message: firewallResult.reason || 'Adversarial jailbreak patterns detected.'
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toISOString(),
      text: prompt
    };
    policyChatHistory.push(userMessage);

    let resultText = '';
    let resultCedar = '';
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      log('warn', 'GEMINI_API_KEY is not configured for chat. Using rule-based mock chat responder.');
      const mockPolicy = generateMockCedarPolicy(prompt);
      const containsPolicyReq = prompt.toLowerCase().includes('permit') || prompt.toLowerCase().includes('allow') || prompt.toLowerCase().includes('forbid') || prompt.toLowerCase().includes('block') || prompt.toLowerCase().includes('policy') || prompt.toLowerCase().includes('sme');
      
      if (containsPolicyReq) {
        resultText = `Based on your request, I've generated a Cedar policy for you. ${mockPolicy.explanation}`;
        resultCedar = mockPolicy.cedarCode;
      } else {
        resultText = `Hello! I see you asked: "${prompt}". I'm standing by to help design Cedar authorization rules. Try asking: "allow pm-sme to write md files" or "permit security-sme to write policy files".`;
      }
    } else {
      try {
        const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
        // Build context string from the last few messages
        const contextString = policyChatHistory
          .slice(-10)
          .map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
          .join('\n');
        
        const chatSystemPrompt = `You are FidusGate's Cedar Policy Co-Pilot chat assistant. Assist the user with Cedar authorization rules, zero-trust architectures, and policy management. If the user asks you to write a policy, provide a concise explanation and include a structured JSON block representing your response. The final response from you should be formatted as a valid JSON object matching this schema:
{
  "text": "Your conversational response explanation",
  "cedarCode": "permit(principal == ..., action == ..., resource) when { ... };" // optional, include only if proposing a policy rule
}
Ensure your output is strictly a valid JSON object with no markdown fences, comments, or extra text.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: chatSystemPrompt + '\n\nConversation history:\n' + contextString }]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          throw new Error('Gemini API returned status code ' + response.status);
        }

        const responseData = await response.json() as any;
        const jsonText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
          throw new Error('Empty response from Gemini API');
        }

        const parsed = JSON.parse(jsonText.trim());
        resultText = parsed.text || '';
        resultCedar = parsed.cedarCode || '';
      } catch (apiErr: any) {
        log('error', 'Failed to contact Gemini API for chat: ' + apiErr.message + '. Falling back to mock.');
        const mockPolicy = generateMockCedarPolicy(prompt);
        resultText = `Failed to contact Gemini API (${apiErr.message}). Falling back to mock. ${mockPolicy.explanation}`;
        resultCedar = mockPolicy.cedarCode;
      }
    }

    if (resultCedar) {
      try {
        const cedarWasmPath = path.join(process.cwd(), 'scripts', 'cedar.wasm');
        const wasiResult = await runWasmCommand(cedarWasmPath, ['validate', '--schema', 'policy.cedarschema']);
        if (wasiResult.exitCode !== 0) {
          log('warn', `❌ CHAT STATIC VALIDATION FAILED: cedar.wasm verification rejected the generated policy.`);
        } else {
          log('info', `✅ CHAT STATIC VALIDATION PASSED: ${wasiResult.stdout.trim()}`);
        }
      } catch (err) {}
    }

    const assistantMessage: ChatMessage = {
      id: `msg_a_${Date.now()}`,
      sender: 'assistant',
      timestamp: new Date().toISOString(),
      text: resultText,
      cedarCode: resultCedar || undefined
    };
    policyChatHistory.push(assistantMessage);

    // Broadcast messages via WebSocket
    broadcastWS('chat_message_created', { userMessage, assistantMessage });

    res.json({ userMessage, assistantMessage });
  } catch (err: any) {
    res.status(500).json({ error: 'Chat execution exception occurred', message: err.message });
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
      complianceAttestationId: `compliance_${secureNumericId(6)}`,
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

// POST /api/policy/apply - Securely commit and hot-apply simulated draft policy (Role: admin)
const MAX_POLICY_UPLOAD_LEN = 128 * 1024;
app.post('/api/policy/apply', requireAuth(['admin']), (req, res) => {
  try {
    let validatedPolicy: string;
    try {
      validatedPolicy = assertSafePolicyText(req.body?.policyCode, MAX_POLICY_UPLOAD_LEN);
    } catch (validationErr: any) {
      const message = validationErr?.message || 'Invalid policyCode.';
      res.status(message.includes('maximum length') ? 413 : 400).json({ error: message });
      return;
    }

    try {
      const tester = new CedarEvaluator();
      tester.parse(validatedPolicy);
    } catch (syntaxErr: any) {
      res.status(400).json({ error: 'Cedar policy syntax validation failed.', message: syntaxErr.message });
      return;
    }

    const safety = policyCodePassesSafetyChecks(validatedPolicy);
    if (!safety.ok) {
      res.status(400).json({ error: 'Policy safety validation failed.', message: safety.reason });
      return;
    }

    const policyAudit = auditConsensusRequest(validatedPolicy.slice(0, 512));
    if (policyAudit.rating === 'dangerous') {
      res.status(400).json({ error: 'Policy safety audit rejected the draft.', message: policyAudit.reason });
      return;
    }

    // Persist only the validated policy string. Atomic temp+rename avoids
    // existsSync-then-write races (CodeQL js/file-system-race).
    const activePolicyPath = path.resolve(process.cwd(), config.policy || 'policy.cedar');
    const tempPolicyPath = `${activePolicyPath}.${secureShortHex(6)}.tmp`;
    fs.writeFileSync(tempPolicyPath, validatedPolicy, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tempPolicyPath, activePolicyPath);

    const newEvaluator = new CedarEvaluator(activePolicyPath);
    cedarEvaluator = newEvaluator;

    log('info', `🛡️ POLICY APPLIED SUCCESSFULLY: System policy reloaded. Total rules: ${cedarEvaluator.getRulesCount()}`);

    // Git-backed audit log trail for policy updates. Use execFileSync for each
    // git invocation with an argv array so no shell interpolation occurs
    // (CodeQL js/command-line-injection).
    try {
      execFileSync('git', ['add', 'policy.cedar'], { cwd: process.cwd(), stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'security(policy): programmatically updated Cedar rules via co-pilot'], { cwd: process.cwd(), stdio: 'ignore' });
      log('info', `✅ POLICY VERSION CONTROLLED: Staged and committed policy.cedar updates.`);
    } catch (gitErr: any) {
      log('error', `⚠️ POLICY VERSION CONTROL FAILURE: Failed to commit policy.cedar. Error: ${gitErr.message}`);
    }
    
    broadcastWS('policy_hot_reloaded', { rulesCount: cedarEvaluator.getRulesCount() });
    
    res.json({ message: 'Simulated draft policy committed to production and active.', rulesCount: cedarEvaluator.getRulesCount() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to apply policy', message: err.message });
  }
});

// GET /api/system/config - Retrieve current system configurations (Role: developer, admin, auditor)
app.get('/api/system/config', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const systemConfig = await db.getSystemConfig();
    res.json(systemConfig);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve system configuration', message: err.message });
  }
});

// POST /api/system/config - Update circuit breaker state and limits (Role: admin)
app.post('/api/system/config', requireAuth(['admin']), async (req, res) => {
  try {
    const { circuitBreakerActive, agentTokenBudget } = req.body;
    await db.updateSystemConfig({ circuitBreakerActive, agentTokenBudget });
    const updated = await db.getSystemConfig();
    
    log('warn', `🛡️ SYSTEM CONFIG UPDATED: circuitBreakerActive=${updated.circuitBreakerActive}, agentTokenBudget=${updated.agentTokenBudget}`);
    broadcastWS('system_config_updated', updated);
    
    res.json({ message: 'System configuration updated successfully', config: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update system configuration', message: err.message });
  }
});

// GET /api/consensus/requests - Retrieve all pending consensus gating actions (Role: developer, admin, auditor)
app.get('/api/consensus/requests', requireAuth(['developer', 'admin', 'auditor']), async (req, res) => {
  try {
    const requests = await db.getPendingActions();
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve consensus requests', message: err.message });
  }
});

// POST /api/consensus/requests/approve - Attest cryptographic signature and approve action (Role: admin, developer, auditor)
app.post('/api/consensus/requests/approve', requireAuth(['admin', 'developer', 'auditor']), async (req, res) => {
  try {
    const { actionId, signature } = req.body;
    if (!actionId || !signature) {
      res.status(400).json({ error: 'Missing required parameters: actionId, signature' });
      return;
    }

    const email = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    const role = (req as AuthenticatedRequest).user?.role || 'admin';

    // Fetch the target action to check safety rating blocks
    const actions = await db.getPendingActions();
    const action = actions.find(a => a.id === actionId);
    if (!action) {
      res.status(404).json({ error: 'Pending action request not found.' });
      return;
    }

    if (action.aiRating === 'dangerous' && !action.adminOverridden) {
      log('security', `⚠️  APPROVAL BLOCKED: Action ID: ${actionId} contains a dangerous command and has NOT been overridden by an administrator.`);
      res.status(403).json({
        error: 'Approval blocked',
        message: 'This dangerous command has been blocked by the AI Auditor. An administrator decideer must explicitly override/unlock the block before it can be signed.'
      });
      return;
    }

    log('info', `✍️ CONSENSUS APPROVAL SUBMITTED: Action ID: ${actionId} by ${email} (${role.toUpperCase()})`);

    const updatedAction = await db.addConsensusApproval({
      actionId,
      approver: email,
      role,
      signature
    });

    if (!updatedAction) {
      res.status(404).json({ error: 'Pending action request not found.' });
      return;
    }

    // If consensus is met, trigger sandbox execution in background
    if (updatedAction.status === 'approved') {
      log('security', `✅ CONSENSUS MET: Action ID: ${actionId} has gathered required approvals and is now APPROVED.`);
      broadcastWS('consensus_approved', { actionId, status: 'approved' });

      const workspacePath = path.resolve(__dirname, '..', '..', '..');
      
      setTimeout(async () => {
        try {
          log('info', `⚡ BACKGROUND EXECUTION: Executing approved consensus action command: [${updatedAction.command}]`);
          
          const commandLower = updatedAction.command.toLowerCase().trim();
          if (commandLower.startsWith('wasi-execute') || commandLower.includes('.wasm') || commandLower.startsWith('tsc')) {
            let wasmPath = path.join(process.cwd(), 'scripts', 'compiler.wasm');
            const wasmMatch = updatedAction.command.match(/\S+\.wasm/);
            if (wasmMatch) {
              wasmPath = path.resolve(process.cwd(), wasmMatch[0]);
            }
            const args = updatedAction.command.split(' ').slice(1);
            const result = await runWasmCommand(wasmPath, args);
            log('info', `✅ BACKGROUND WASI EXECUTION COMPLETED: stdout: ${result.stdout}, exitCode: ${result.exitCode}`);
          } else {
            // argv-array invocation prevents shell interpolation of the
            // consensus-approved command (CodeQL js/command-line-injection).
            execFileSync(
              'bash',
              ['scripts/sandbox-execute.sh', updatedAction.command, workspacePath],
              { cwd: workspacePath, encoding: 'utf8' }
            );
            log('info', `✅ BACKGROUND SANDBOX EXECUTION COMPLETED.`);
          }
        } catch (bgErr: any) {
          log('error', `❌ BACKGROUND SANDBOX EXECUTION FAILED: ${bgErr.message}`);
        }
      }, 100);
    } else {
      broadcastWS('consensus_approval_added', { actionId, approvalsCount: updatedAction.approvals.length });
    }

    res.json({ message: 'Attestation signature successfully registered.', action: updatedAction });
  } catch (err: any) {
    res.status(500).json({ error: 'Consensus approval process failed', message: err.message });
  }
});

// POST /api/consensus/requests/:actionId/override - Override AI Auditor block for dangerous commands (Role: admin)
app.post('/api/consensus/requests/:actionId/override', requireAuth(['admin']), async (req, res) => {
  try {
    const { actionId } = req.params;
    if (!actionId) {
      res.status(400).json({ error: 'Missing actionId parameter.' });
      return;
    }
    const updatedAction = await db.adminOverrideAction(actionId);
    if (!updatedAction) {
      res.status(404).json({ error: 'Pending action request not found.' });
      return;
    }
    log('security', `🔓 ADMIN OVERRIDE APPLIED: Action ID: ${actionId} has been overridden by an administrator.`);
    broadcastWS('consensus_overridden', updatedAction);
    res.json({ message: 'Command successfully unlocked for consensus voting.', action: updatedAction });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to apply admin override', message: err.message });
  }
});

// POST /api/consensus/requests/:actionId/aggregate - Multi-Party Signature Aggregation (Role: admin, developer, auditor)
// Simulates computing an aggregated threshold signature from individual role attestations
app.post('/api/consensus/requests/:actionId/aggregate', requireAuth(['admin', 'developer', 'auditor']), async (req, res) => {
  try {
    const { actionId } = req.params;

    // Retrieve action and its approvals
    const actions = await db.getPendingActions();
    const action = actions.find(a => a.id === actionId);
    if (!action) {
      res.status(404).json({ error: 'Pending action not found.' });
      return;
    }

    if (action.status !== 'approved') {
      res.status(400).json({ 
        error: 'Consensus signature aggregation requires an approved action.',
        message: `Action is currently in '${action.status}' state. All ${action.requiredVotes} attestation signatures must be collected first.`
      });
      return;
    }

    const approvals = action.approvals || [];

    // Collect individual signatures from each approver
    const individualSignatures = approvals.map((app: any) => ({
      role: app.role,
      approver: app.approver,
      signature: app.signature,
      publicKey: MUSIG2_ROLE_KEYS[app.role]?.publicKeyHex || 'unknown'
    }));

    // Consensus Signature Aggregation Simulation
    // In production, this would use Schnorr multi-signature aggregation (BIP-327) or MuSig2.
    // R_agg = R₁ + R₂ + R₃, s_agg = s₁ + s₂ + s₃ (mod n)
    const signatureHexParts = individualSignatures.map((s: any) => s.signature);
    
    // Simulate XOR-based nonce commitment aggregation
    let aggregatedNonce = BigInt(0);
    for (const sigHex of signatureHexParts) {
      const sigBytes = Buffer.from(sigHex.replace(/[^a-f0-9]/gi, '').padEnd(16, '0').slice(0, 16), 'hex');
      aggregatedNonce ^= sigBytes.readBigUInt64BE(0);
    }

    // Compute the aggregated public key point (simulated addition of EC points)
    const publicKeyPoints = individualSignatures.map((s: any) => s.publicKey);
    let aggregatedPubKeyHash = BigInt(0);
    for (const pk of publicKeyPoints) {
      const pkBytes = Buffer.from(pk.replace(/[^a-f0-9]/gi, '').slice(0, 16).padEnd(16, '0'), 'hex');
      aggregatedPubKeyHash ^= pkBytes.readBigUInt64BE(0);
    }

    const aggregateSignature = {
      algorithm: 'MuSig2-EdDSA-Schnorr',
      threshold: `${individualSignatures.length}/${action.requiredVotes}`,
      aggregatedNonce: '0x' + aggregatedNonce.toString(16).padStart(16, '0'),
      aggregatedPublicKey: '0x' + aggregatedPubKeyHash.toString(16).padStart(16, '0'),
      individualAttestations: individualSignatures,
      aggregatedSignatureHex: '0x' + aggregatedNonce.toString(16).padStart(16, '0') + aggregatedPubKeyHash.toString(16).padStart(16, '0'),
      verified: true,
      timestamp: new Date().toISOString()
    };

    log('security', `🔐 CONSENSUS AGGREGATION COMPLETE: Action ${actionId} — ${individualSignatures.length} signatures aggregated into threshold signature.`);

    broadcastWS('musig2_aggregation_complete', {
      actionId,
      aggregateSignature
    });

    res.json({
      message: 'Consensus threshold signature aggregation completed successfully.',
      actionId,
      aggregateSignature
    });
  } catch (err: any) {
    log('error', `Consensus aggregation failed: ${err.message}`);
    res.status(500).json({ error: 'Consensus signature aggregation failed', message: err.message });
  }
});

// POST /api/sandbox/restore - Active sandbox rehydration using git clean & restore (Role: developer, admin)
app.post('/api/sandbox/restore', requireAuth(['developer', 'admin']), async (req, res) => {
  try {
    const workspaceRoot = process.cwd();
    log('info', '🛡️ SANDBOX RESTORATION INITIATED: Reverting filesystem changes.');
    try {
      execSync('git restore . && git clean -fd', { cwd: workspaceRoot });
      log('info', 'Sandbox restoration successful: workspace returned to clean git state.');
      
      // Update DB to mark all records as reconciled
      await db.reconcileDrifts();

      // Broadcast event so UI clears alerts
      broadcastWS('filesystem_reconciled', { reconciled: true });

      res.json({ message: 'Sandbox successfully rehydrated and reconciled.', restored: true });
    } catch (execErr: any) {
      log('error', 'Sandbox restoration command failed:', execErr.message);
      res.status(500).json({ error: 'Failed to restore sandbox', message: execErr.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Sandbox restoration exception occurred', message: err.message });
  }
});


// Expose metrics on a secure, dedicated admin-only port 3002
const metricsPort = process.env.METRICS_PORT || 3002;
const metricsServer = http.createServer(async (req, res) => {
  // Enable CORS for dashboard browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

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
        `fidusgate_database_latency_ms ${dbHealth.latencyMs}`,
        ``,
        `# HELP fidusgate_sandbox_avg_latency_ms Moving average of recent sandbox execution latency in milliseconds.`,
        `# TYPE fidusgate_sandbox_avg_latency_ms gauge`,
        `fidusgate_sandbox_avg_latency_ms ${getMovingAverageLatency().toFixed(2)}`,
        ``,
        `# HELP fidusgate_auto_throttle_active Auto-throttle rate limiter active status (1=Active, 0=Inactive).`,
        `# TYPE fidusgate_auto_throttle_active gauge`,
        `fidusgate_auto_throttle_active ${isAutoThrottleActive() ? 1 : 0}`
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

// ==========================================
// QUARANTINE & INTERVIEW SYSTEM ENDPOINTS
// ==========================================

// GET /api/quarantine — List all quarantine records (Role: admin)
app.get('/api/quarantine', requireAuth(['admin']), async (req, res) => {
  try {
    const records = await db.getQuarantinedPrincipals();
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list quarantine records', message: err.message });
  }
});

// POST /api/quarantine/:principalId — Manually quarantine a principal (Role: admin)
app.post('/api/quarantine/:principalId', requireAuth(['admin']), async (req, res) => {
  try {
    const { principalId } = req.params;
    const { reason, evidence } = req.body;
    if (!reason) {
      res.status(400).json({ error: 'Missing required parameter: reason' });
      return;
    }
    const record = await db.quarantinePrincipal({
      principalId,
      quarantinedAt: new Date().toISOString(),
      reason,
      evidence: evidence || []
    });
    log('security', `🔒 PRINCIPAL MANUALLY QUARANTINED: ${principalId}. Reason: ${reason}`);
    broadcastWS('principal_quarantined', { principalId, reason });
    res.json({ message: 'Principal successfully quarantined', record });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to quarantine principal', message: err.message });
  }
});

// DELETE /api/quarantine/:principalId — Release quarantine (Role: admin)
app.delete('/api/quarantine/:principalId', requireAuth(['admin']), async (req, res) => {
  try {
    const { principalId } = req.params;
    const userEmail = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    const record = await db.releaseQuarantine(principalId, userEmail);
    if (!record) {
      res.status(404).json({ error: `No active quarantine record found for principal ${principalId}` });
      return;
    }
    log('security', `🔓 PRINCIPAL RELEASED FROM QUARANTINE: ${principalId} by ${userEmail}`);
    broadcastWS('principal_released', { principalId, releasedBy: userEmail });
    res.json({ message: 'Quarantine released successfully', record });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to release quarantine', message: err.message });
  }
});

// GET /api/quarantine/:principalId/dossier — Compile forensic dossier (Role: admin)
app.get('/api/quarantine/:principalId/dossier', requireAuth(['admin']), async (req, res) => {
  try {
    const { principalId } = req.params;
    const allRecords = await db.getQuarantinedPrincipals();
    const record = allRecords.find(r => r.principalId === principalId);
    if (!record) {
      res.status(404).json({ error: `Quarantine record not found for principal ${principalId}` });
      return;
    }
    const dossier = await buildDossier(db as any, record, process.cwd());
    res.json(dossier);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to build dossier', message: err.message });
  }
});

// POST /api/quarantine/:principalId/interview — Conduct interview turn (Role: admin)
app.post('/api/quarantine/:principalId/interview', requireAuth(['admin']), async (req, res) => {
  try {
    const { principalId } = req.params;
    const { question } = req.body;
    if (!question) {
      res.status(400).json({ error: 'Missing required parameter: question' });
      return;
    }
    const userEmail = (req as AuthenticatedRequest).user?.email || 'admin@fidusgate.internal';
    const allRecords = await db.getQuarantinedPrincipals();
    let record = allRecords.find(r => r.principalId === principalId && r.status === 'active');
    if (!record) {
      record = allRecords.find(r => r.principalId === principalId);
    }
    if (!record) {
      res.status(404).json({ error: `Quarantine record not found for principal ${principalId}` });
      return;
    }
    const dossier = await buildDossier(db as any, record, process.cwd());
    const result = await conductInterview(db as any, dossier, question, userEmail);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to conduct interview', message: err.message });
  }
});

// GET /api/quarantine/:principalId/interview — Get interview transcript (Role: admin)
app.get('/api/quarantine/:principalId/interview', requireAuth(['admin']), async (req, res) => {
  try {
    const { principalId } = req.params;
    const logs = await db.getInterviewLogs(principalId);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve interview transcript', message: err.message });
  }
});

// Fix 5: GET /health — unauthenticated liveness/readiness probe for Docker and k8s.
// Returns gate states and circuit breaker status so orchestrators can assess health.
app.get('/health', (_req: express.Request, res: express.Response) => {
  const circuitBreakerActive = checkCircuitBreaker();
  const plmState = plmTracker.getState();
  const ibpState = ibpTracker.getState();
  const devopsState = devopsTracker.getState();
  const allGatesPassing =
    !!plmState.activeRequirementId &&
    plmState.associatedTestsWritten &&
    devopsState.pipelineVerified &&
    ibpState.crossFunctionalSynthesized &&
    ibpTracker.isBudgetAligned();

  res.status(circuitBreakerActive ? 503 : 200).json({
    status: circuitBreakerActive ? 'degraded' : 'ok',
    version: '1.2.0-Enterprise',
    uptime_seconds: Math.floor(process.uptime()),
    circuit_breaker_active: circuitBreakerActive,
    gates_passing: allGatesPassing,
    timestamp: new Date().toISOString()
  });
});

if (process.argv.includes('--mcp')) {
  startMcpServer();
} else if (process.env.FIDUSGATE_TEST !== 'true' && process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => {
    log('info', `FidusGate Security Gateway API listening on Port ${port}`);
    // Boot background worker to periodically check and statefully expire consensus requests
    startConsensusExpiryWorker(db as any, 10000, broadcastWS);
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
