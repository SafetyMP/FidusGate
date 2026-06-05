import * as path from 'node:path';
import * as fs from 'node:fs';

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

  constructor(private broadcastWS: BroadcastWSFn) {
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
    this.broadcastWS('ibp_state_updated', this.getState());
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
    this.broadcastWS('ibp_state_updated', this.getState());
  }

  public submitSynthesis(report: string) {
    this.state.crossFunctionalSynthesized = true;
    this.state.lastSynthesisReport = report;
    this.state.lastSynthesisTimestamp = new Date().toISOString();
    this.saveState();
    this.broadcastWS('ibp_state_updated', this.getState());
  }

  public isBudgetAligned(): boolean {
    return this.state.tokensConsumed <= this.state.tokenBudget;
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

  constructor(private broadcastWS: BroadcastWSFn) {
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

      if (filePath.endsWith('package.json')) {
        this.state.releaseVersionUpdated = true;
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
