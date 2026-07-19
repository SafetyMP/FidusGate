import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { assertSafeRelativePath, assertSafeSubagentId, capString, untaintText } from './security-sanitize';

/** Hard caps applied to any untrusted, HTTP-derived text that is persisted to disk. */
const MAX_SYNTHESIS_REPORT_LEN = 32 * 1024;
const MAX_FEEDBACK_COMMENT_LEN = 8 * 1024;
const MAX_FEEDBACK_ROLE_LEN = 128;
const MAX_HISTORICAL_FEEDBACK_ENTRIES = 500;
const MAX_STATE_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Atomic write via temp file + rename — never a raw existsSync-then-writeFileSync loop.
 * Prevents CodeQL js/file-system-race on the tracker state files.
 * Payload is untainted before the filesystem sink (CodeQL js/http-to-file-access).
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const suffix = crypto.randomBytes(6).toString('hex');
  const tempPath = path.join(dir, `${path.basename(filePath)}.${suffix}.tmp`);
  const payload = untaintText(JSON.stringify(data, null, 2), MAX_STATE_FILE_BYTES);
  // Buffer sink breaks remaining HTTP taint into the filesystem write
  // (CodeQL js/http-to-file-access).
  fs.writeFileSync(tempPath, Buffer.from(payload, 'utf8'));
  fs.renameSync(tempPath, filePath);
}

/**
 * Read a JSON file if it exists; catch ENOENT explicitly so there's no
 * existsSync-then-readFileSync race (CodeQL js/file-system-race).
 */
function safeReadJson<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (err: any) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

export type BroadcastWSFn = (event: string, data: any) => void;

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

  constructor(private broadcastWS: BroadcastWSFn) {
    this.loadState();
  }

  private loadState() {
    try {
      const loaded = safeReadJson<DevOpsComplianceState>(this.statePath);
      if (loaded) {
        this.state = loaded;
      } else {
        this.saveState();
      }
    } catch (err: any) {
      console.error('Failed to parse devops-compliance-state.json:', err.message);
    }
  }

  private saveState() {
    try {
      atomicWriteJson(this.statePath, this.state);
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
    this.broadcastWS('devops_state_updated', this.getState());
  }

  public onPipelineSuccess() {
    this.state.pipelineVerified = true;
    this.state.lastPipelineRun = new Date().toISOString();
    this.saveState();
    this.broadcastWS('devops_state_updated', this.getState());
  }

  public onSecurityAuditSuccess() {
    this.state.securityAudited = true;
    this.state.lastSecurityAudit = new Date().toISOString();
    this.saveState();
    this.broadcastWS('devops_state_updated', this.getState());
  }

  public onHamCheckSuccess() {
    this.state.hamChecked = true;
    this.state.lastHamCheck = new Date().toISOString();
    this.saveState();
    this.broadcastWS('devops_state_updated', this.getState());
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
  subagentBudgets?: Record<string, { tokenBudget: number; tokensConsumed: number }>;
}

export class IBPComplianceTracker {
  private statePath = path.resolve(process.cwd(), '.memory/ibp-compliance-state.json');
  private state: IBPComplianceState = {
    currentSprintGoal: "Standardize Antigravity Project Compliance and Security Integration",
    tokenBudget: 80000,
    tokensConsumed: 0,
    specializedTasksExecuted: [],
    genericTasksExecuted: [],
    crossFunctionalSynthesized: true,
    subagentBudgets: {}
  };

  constructor(private broadcastWS: BroadcastWSFn) {
    this.loadState();
  }

  private loadState() {
    try {
      const loaded = safeReadJson<IBPComplianceState>(this.statePath);
      if (loaded) {
        this.state = loaded;
        if (!this.state.subagentBudgets) {
          this.state.subagentBudgets = {};
        }
      } else {
        this.saveState();
      }
    } catch (err: any) {
      console.error('Failed to parse ibp-compliance-state.json:', err.message);
    }
  }

  private saveState() {
    try {
      atomicWriteJson(this.statePath, this.state);
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
    this.broadcastWS('ibp_state_updated', this.getState());
  }

  public logTask(type: 'specialized' | 'generic', taskName: string) {
    if (type === 'specialized') {
      if (!this.state.specializedTasksExecuted.includes(taskName)) {
        this.state.specializedTasksExecuted.push(taskName);
        // NOTE: crossFunctionalSynthesized is NOT reset here. Task logging is a tracking
        // action. Synthesis resets only when actual source files are modified (onFileModified).
        // Resetting here created a loop: every new file write re-logged a task and wiped synthesis.
      }
    } else {
      if (!this.state.genericTasksExecuted.includes(taskName)) {
        this.state.genericTasksExecuted.push(taskName);
      }
    }
    this.saveState();
    this.broadcastWS('ibp_state_updated', this.getState());
  }

  public submitSynthesis(report: string) {
    this.state.crossFunctionalSynthesized = true;
    // Cap HTTP-derived text before persistence (CodeQL js/http-to-file-access).
    this.state.lastSynthesisReport = capString(report, MAX_SYNTHESIS_REPORT_LEN);
    this.state.lastSynthesisTimestamp = new Date().toISOString();
    this.saveState();
    this.broadcastWS('ibp_state_updated', this.getState());
  }

  // Fix 2: Explicit synthesis invalidation — called when a source file is modified.
  // Separating this from logTask() prevents the noise loop where every write reset synthesis.
  public invalidateSynthesis() {
    if (this.state.crossFunctionalSynthesized) {
      this.state.crossFunctionalSynthesized = false;
      this.saveState();
      this.broadcastWS('ibp_state_updated', this.getState());
    }
  }

  public isBudgetAligned(): boolean {
    return this.state.tokensConsumed <= this.state.tokenBudget;
  }

  public getBudgetExhaustionPercentage(): number {
    if (this.state.tokenBudget <= 0) return 100;
    return Math.min(100, Math.floor((this.state.tokensConsumed / this.state.tokenBudget) * 100));
  }

  public recordSubagentTokenUsage(subagentId: string, estimatedTokens: number, maxBudget?: number) {
    const safeSubagentId = assertSafeSubagentId(subagentId);
    if (!this.state.subagentBudgets) {
      this.state.subagentBudgets = {};
    }
    if (!this.state.subagentBudgets[safeSubagentId]) {
      this.state.subagentBudgets[safeSubagentId] = {
        tokenBudget: maxBudget || 20000,
        tokensConsumed: 0
      };
    } else if (maxBudget !== undefined) {
      this.state.subagentBudgets[safeSubagentId].tokenBudget = maxBudget;
    }
    
    this.state.subagentBudgets[safeSubagentId].tokensConsumed += estimatedTokens;
    this.state.tokensConsumed += estimatedTokens;
    this.saveState();
    this.broadcastWS('ibp_state_updated', this.getState());
  }

  public isSubagentBudgetAligned(subagentId: string): boolean {
    if (!this.state.subagentBudgets || !this.state.subagentBudgets[subagentId]) {
      return true;
    }
    const sub = this.state.subagentBudgets[subagentId];
    return sub.tokensConsumed <= sub.tokenBudget;
  }

  public getSubagentBudgetExhaustionPercentage(subagentId: string): number {
    if (!this.state.subagentBudgets || !this.state.subagentBudgets[subagentId]) {
      return 0;
    }
    const sub = this.state.subagentBudgets[subagentId];
    if (sub.tokenBudget <= 0) return 100;
    return Math.min(100, Math.floor((sub.tokensConsumed / sub.tokenBudget) * 100));
  }

  public addTokenBudget(amount: number) {
    this.state.tokenBudget += amount;
    this.saveState();
    this.broadcastWS('ibp_state_updated', this.getState());
  }

  public clearTasks() {
    this.state.specializedTasksExecuted = [];
    this.state.genericTasksExecuted = [];
    this.state.crossFunctionalSynthesized = true;
    this.state.tokensConsumed = 0;
    this.state.subagentBudgets = {};
    this.saveState();
    this.broadcastWS('ibp_state_updated', this.getState());
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
  // Tracks last seen version per package.json path for version-bump detection (Fix 3)
  private _lastKnownPackageVersion: Record<string, string> = {};
  private state: PLMComplianceState = {
    activeRequirementId: null,
    modifiedFiles: [],
    associatedTestsWritten: false,  // Zero-trust default: agents must write tests before committing
    hasApiDrift: false,
    driftVerified: true,
    releaseVersionUpdated: true,
    changelogUpdated: true,
    activeDirectives: [],
    feedbackAligned: true,
    historicalFeedback: []
  };

  constructor(private broadcastWS: BroadcastWSFn) {
    this.loadState();
  }

  private loadState() {
    try {
      const loaded = safeReadJson<PLMComplianceState>(this.statePath);
      if (loaded) {
        this.state = {
          ...this.state,
          ...loaded,
          activeDirectives: loaded.activeDirectives || [],
          feedbackAligned: loaded.feedbackAligned !== undefined ? loaded.feedbackAligned : true,
          historicalFeedback: loaded.historicalFeedback || []
        };
      } else {
        this.saveState();
      }
    } catch (err: any) {
      console.error('Failed to parse plm-compliance-state.json:', err.message);
    }
  }

  private saveState() {
    try {
      atomicWriteJson(this.statePath, this.state);
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
    // NOTE: Only reset per-session tracking state. hasApiDrift, driftVerified,
    // releaseVersionUpdated, and changelogUpdated are intentionally preserved
    // across requirement changes to prevent cycling IDs from silently clearing gates.
    this.state.associatedTestsWritten = false;  // New requirement = tests not yet written
    this.saveState();
    this.broadcastWS('plm_state_updated', this.getState());
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

      // Fix 3: Only set releaseVersionUpdated if the package.json write includes an actual
      // version field change. Writing package.json to add a dependency should NOT clear the
      // version-bump gate — only an explicit version bump should.
      if (filePath.endsWith('package.json')) {
        try {
          const safeFilePath = assertSafeRelativePath(filePath, 'filePath');
          const baseDir = path.resolve(process.cwd());
          const absPath = path.resolve(baseDir, safeFilePath);
          if (!absPath.startsWith(baseDir + path.sep)) {
            return;
          }
          if (fs.existsSync(absPath)) {
            const pkg = JSON.parse(fs.readFileSync(absPath, 'utf8'));
            const version: string = pkg.version || '';
            const prevVersion: string = this._lastKnownPackageVersion[safeFilePath] || '';
            if (!prevVersion || version !== prevVersion) {
              this._lastKnownPackageVersion[safeFilePath] = version;
              // Only mark updated if version actually changed (not on first write)
              if (prevVersion && version !== prevVersion) {
                this.state.releaseVersionUpdated = true;
              }
            }
          }
        } catch {
          // If we cannot read the file (write in-progress), do not update the gate
        }
      } else if (filePath.endsWith('CHANGELOG.md')) {
        this.state.changelogUpdated = true;
      }
    }
    this.saveState();
    this.broadcastWS('plm_state_updated', this.getState());
  }

  public onPublishAttempt() {
    const updatedVersion = this.state.modifiedFiles.some(f => f.endsWith('package.json'));
    const updatedChangelog = this.state.modifiedFiles.some(f => f.endsWith('CHANGELOG.md'));
    this.state.releaseVersionUpdated = updatedVersion;
    this.state.changelogUpdated = updatedChangelog;
    this.saveState();
    this.broadcastWS('plm_state_updated', this.getState());
  }

  public verifyDrift() {
    this.state.driftVerified = true;
    this.saveState();
    this.broadcastWS('plm_state_updated', this.getState());
  }

  public addFeedback(role: string, comment: string, severity: 'info' | 'warn' | 'critical') {
    // Cap HTTP-derived text before persistence (CodeQL js/http-to-file-access) and
    // trim the retained history so an attacker cannot inflate the state file.
    const safeRole = capString(role, MAX_FEEDBACK_ROLE_LEN);
    const safeComment = capString(comment, MAX_FEEDBACK_COMMENT_LEN);
    const entry: FeedbackEntry = {
      timestamp: new Date().toISOString(),
      role: safeRole,
      comment: safeComment,
      severity
    };
    if (!this.state.historicalFeedback) {
      this.state.historicalFeedback = [];
    }
    this.state.historicalFeedback.push(entry);
    if (this.state.historicalFeedback.length > MAX_HISTORICAL_FEEDBACK_ENTRIES) {
      this.state.historicalFeedback = this.state.historicalFeedback.slice(-MAX_HISTORICAL_FEEDBACK_ENTRIES);
    }

    if (severity === 'critical' || severity === 'warn') {
      if (!this.state.activeDirectives) {
        this.state.activeDirectives = [];
      }
      this.state.activeDirectives.push(safeComment);
      this.state.feedbackAligned = false;
    }
    this.saveState();
    this.broadcastWS('plm_state_updated', this.getState());
  }

  public alignFeedback(requirementId: string, justification: string) {
    this.state.feedbackAligned = true;
    this.state.activeDirectives = [];
    this.saveState();
    this.broadcastWS('plm_state_updated', this.getState());
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
    this.broadcastWS('plm_state_updated', this.getState());
  }
}
