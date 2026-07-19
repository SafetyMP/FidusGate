import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Transaction, AuditReceipt, SecurityFinding } from '@fidusgate/core-types';

function calculateReceiptHash(payload: any): string {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export interface QuarantineRecord {
  principalId: string;
  quarantinedAt: string;
  reason: string;
  evidence: string[]; // commit SHAs, command log IDs, or violation descriptions
  status: 'active' | 'released' | 'escalated';
  releasedAt?: string | null;
  releasedBy?: string | null;
}

export interface InterviewLog {
  interviewId: string;
  principalId: string;
  questionBy: string;
  question: string;
  agentResponse: string;
  timestamp: string;
}

export interface BudgetExtensionRequest {
  id: string;
  createdAt: string;
  requestedAmount: number;
  reason: string;
  applicant: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer?: string | null;
  reviewedAt?: string | null;
}

export interface CommandLogEntry {
  id: string;
  timestamp: string;
  command: string;
  user: string;
  role: string;
  status: 'success' | 'failed';
  exitCode: number;
  cedarDecision: 'allow' | 'deny';
}

export interface FilesystemDriftEntry {
  id: string;
  timestamp: string;
  filePath: string;
  changeType: string;
  diff?: string | null;
  reconciled: boolean;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const TX_FILE = path.join(DATA_DIR, 'transactions.json');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const FINDINGS_FILE = path.join(DATA_DIR, 'findings.json');
const COMMAND_LOGS_FILE = path.join(DATA_DIR, 'command-logs.json');
const DRIFTS_FILE = path.join(DATA_DIR, 'drifts.json');
const BUDGET_EXTENSIONS_FILE = path.join(DATA_DIR, 'budget-extensions.json');
const QUARANTINE_FILE = path.join(DATA_DIR, 'quarantine-records.json');
const INTERVIEW_LOGS_FILE = path.join(DATA_DIR, 'interview-logs.json');

function sleepSync(ms: number) {
  try {
    const sab = new SharedArrayBuffer(4);
    const int32 = new Int32Array(sab);
    Atomics.wait(int32, 0, 0, ms);
  } catch (e) {
    const limit = Date.now() + ms;
    while (Date.now() < limit) {}
  }
}

function acquireLock(lockPath: string) {
  const start = Date.now();
  const timeout = 5000;
  while (true) {
    try {
      fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
      return;
    } catch (e: any) {
      if (e.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 10000) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch (err) {}

        if (Date.now() - start > timeout) {
          throw new Error(`Timeout acquiring lock on: ${lockPath}`);
        }
        sleepSync(50);
      } else {
        throw e;
      }
    }
  }
}

function releaseLock(lockPath: string) {
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch (e) {}
}

function writeJsonAtomic(filePath: string, data: any) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${Math.random().toString(36).substring(2)}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function lockAndModify(filePath: string, modifyFn: (currentData: any) => any, defaultValue: any = []) {
  const lockPath = `${filePath}.lock`;
  acquireLock(lockPath);
  try {
    let currentData = defaultValue;
    if (fs.existsSync(filePath)) {
      try {
        currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) {
        currentData = defaultValue;
      }
    }
    const updatedData = modifyFn(currentData);
    writeJsonAtomic(filePath, updatedData);
  } finally {
    releaseLock(lockPath);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireLockAsync(lockPath: string): Promise<void> {
  const start = Date.now();
  const timeout = 5000;
  while (true) {
    try {
      await fs.promises.writeFile(lockPath, process.pid.toString(), { flag: 'wx' });
      return;
    } catch (e: any) {
      if (e.code === 'EEXIST') {
        try {
          const stat = await fs.promises.stat(lockPath);
          if (Date.now() - stat.mtimeMs > 10000) {
            await fs.promises.unlink(lockPath);
            continue;
          }
        } catch (err) {}

        if (Date.now() - start > timeout) {
          throw new Error(`Timeout acquiring lock on: ${lockPath}`);
        }
        await sleep(50);
      } else {
        throw e;
      }
    }
  }
}

async function releaseLockAsync(lockPath: string): Promise<void> {
  try {
    const exists = await fs.promises.stat(lockPath).then(() => true).catch(() => false);
    if (exists) {
      await fs.promises.unlink(lockPath);
    }
  } catch (e) {}
}

async function writeJsonAtomicAsync(filePath: string, data: any): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${Math.random().toString(36).substring(2)}.tmp`);
  await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.promises.rename(tempPath, filePath);
}

async function lockAndModifyAsync(filePath: string, modifyFn: (currentData: any) => any, defaultValue: any = []): Promise<void> {
  const lockPath = `${filePath}.lock`;
  await acquireLockAsync(lockPath);
  try {
    let currentData = defaultValue;
    // Read directly and treat any read/parse error as "no state yet" — matches
    // legacy behavior and removes the prior stat-then-read TOCTOU race
    // (CodeQL js/file-system-race).
    try {
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      try {
        currentData = JSON.parse(fileContent);
      } catch {
        currentData = defaultValue;
      }
    } catch {
      currentData = defaultValue;
    }
    const updatedData = modifyFn(currentData);
    await writeJsonAtomicAsync(filePath, updatedData);
  } finally {
    await releaseLockAsync(lockPath);
  }
}

const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx_817293',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
    sender: 'Acme Corp Corporate Account',
    recipient: 'GlobalTech Solutions LLC',
    amount: 150000.00,
    currency: 'USD',
    status: 'completed',
    maskedPii: false
  },
  {
    id: 'tx_928174',
    timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString(), // 1.5 hours ago
    sender: 's***@a***.io',
    recipient: 'ModelAPI Inference Gateway',
    amount: 450.25,
    currency: 'USD',
    status: 'completed',
    maskedPii: true
  },
  {
    id: 'tx_039281',
    timestamp: new Date(Date.now() - 1800000).toISOString(), // 30 mins ago
    sender: 'Unknown Tor Node IP: 185.220.101.5',
    recipient: 'FidusGate Admin Wallet',
    amount: 50000.00,
    currency: 'EUR',
    status: 'flagged',
    maskedPii: false
  },
  {
    id: 'tx_129482',
    timestamp: new Date().toISOString(), // Just now
    sender: 'System Treasury Account',
    recipient: 'Cold Storage Ledger Vault',
    amount: 2000000.00,
    currency: 'USD',
    status: 'pending',
    maskedPii: false
  }
];

const INITIAL_RECEIPTS: AuditReceipt[] = [
  {
    payload: {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date(Date.now() - 3600000).toISOString(),
      issuer_id: 'sb:issuer:de073ae64e43',
      reason: 'Tier 1 low-risk file read auto-approved',
      claimed_issuer_tier: 1
    },
    signature: {
      alg: 'EdDSA',
      kid: 'sb:issuer:de073ae64e43',
      sig: 'df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83'
    }
  },
  {
    payload: {
      type: 'protectmcp:decision',
      tool_name: 'write_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date(Date.now() - 1800000).toISOString(),
      issuer_id: 'sb:issuer:de073ae64e43',
      reason: 'Tier 2 file modification in approved src/ directory allowed',
      claimed_issuer_tier: 2
    },
    signature: {
      alg: 'EdDSA',
      kid: 'sb:issuer:de073ae64e43',
      sig: 'ab0721da8eefc89de2212bb456c071d0eef823ac89fd4321cde08fa110fc3a7d'
    }
  },
  {
    payload: {
      type: 'protectmcp:decision',
      tool_name: 'execute_command',
      decision: 'deny',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date(Date.now() - 900000).toISOString(),
      issuer_id: 'sb:issuer:de073ae64e43',
      reason: 'Tier 3 command execution blocked: skill-creator requires explicit manual verification',
      claimed_issuer_tier: 3
    },
    signature: {
      alg: 'EdDSA',
      kid: 'sb:issuer:de073ae64e43',
      sig: '8839deff02c1abef23c10fc39de42b89f81d11ce0d2b93cfde09ab82eefcaefd'
    }
  }
];

export class FidusGateDatabase {
  private prisma: PrismaClient | null = null;
  private usePostgres = false;

  public getPrisma(): PrismaClient | null {
    return this.prisma;
  }

  constructor() {
    this.ensureInitialized();
    this.initPrisma();
  }

  private initPrisma() {
    if (process.env.DATABASE_URL) {
      try {
        this.prisma = new PrismaClient();
        this.usePostgres = true;
        console.error('📡 FidusGateDatabase: Relational PostgreSQL mode enabled via Prisma ORM.');
      } catch (e: any) {
        console.warn('⚠️  FidusGateDatabase: Failed to initialize Prisma client, falling back to JSON mock files:', e.message);
        this.usePostgres = false;
      }
    } else {
      console.error('💾 FidusGateDatabase: Running in zero-dependency local JSON file store mode.');
    }
  }

  private ensureInitialized() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const copyTemplateOrWriteDefault = (filePath: string, defaultContent: any) => {
      // Use O_CREAT|O_EXCL ('wx') so the seed write is atomic and races with
      // another process/thread trying to seed the same file cannot clobber it
      // (CodeQL js/file-system-race).
      const filename = path.basename(filePath);
      const templatePath = path.join(DATA_DIR, 'templates', filename);
      const payload = fs.existsSync(templatePath)
        ? (() => { try { return fs.readFileSync(templatePath); } catch { return null; } })()
        : null;
      const contents = payload ?? Buffer.from(JSON.stringify(defaultContent, null, 2), 'utf-8');
      try {
        fs.writeFileSync(filePath, contents, { flag: 'wx' });
      } catch (err: any) {
        if (err && err.code === 'EEXIST') return;
        throw err;
      }
    };
    
    copyTemplateOrWriteDefault(TX_FILE, INITIAL_TRANSACTIONS);
    copyTemplateOrWriteDefault(RECEIPTS_FILE, INITIAL_RECEIPTS);
    copyTemplateOrWriteDefault(FINDINGS_FILE, []);
    copyTemplateOrWriteDefault(COMMAND_LOGS_FILE, []);
    copyTemplateOrWriteDefault(DRIFTS_FILE, []);
    copyTemplateOrWriteDefault(BUDGET_EXTENSIONS_FILE, []);
    copyTemplateOrWriteDefault(QUARANTINE_FILE, []);
    copyTemplateOrWriteDefault(INTERVIEW_LOGS_FILE, []);

    const systemConfigFile = path.join(DATA_DIR, 'system-config.json');
    copyTemplateOrWriteDefault(systemConfigFile, { circuitBreakerActive: false, agentTokenBudget: 1000.0 });

    const testKeysFile = path.join(DATA_DIR, 'test-keys.json');
    copyTemplateOrWriteDefault(testKeysFile, {});

    const pendingActionsFile = path.join(DATA_DIR, 'pending-actions.json');
    copyTemplateOrWriteDefault(pendingActionsFile, []);
  }

  // ==========================================
  // Transactions Management
  // ==========================================
  private async getTransactionsJson(): Promise<Transaction[]> {
    try {
      const data = await fs.promises.readFile(TX_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return INITIAL_TRANSACTIONS;
    }
  }

  public async getTransactions(): Promise<Transaction[]> {
    if (this.usePostgres && this.prisma) {
      try {
        const txs = await this.prisma.transaction.findMany({
          orderBy: { timestamp: 'desc' }
        });
        return txs.map(t => ({
          id: t.id,
          timestamp: t.timestamp.toISOString(),
          sender: t.sender,
          recipient: t.recipient,
          amount: t.amount,
          currency: t.currency,
          status: t.status as any,
          maskedPii: t.maskedPii
        }));
      } catch (err: any) {
        console.warn('⚠️  Prisma Transaction query failed, falling back to JSON storage:', err.message);
      }
    }
    return await this.getTransactionsJson();
  }

  public async addTransaction(tx: Transaction): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.transaction.create({
          data: {
            id: tx.id,
            timestamp: new Date(tx.timestamp),
            sender: tx.sender,
            recipient: tx.recipient,
            amount: tx.amount,
            currency: tx.currency,
            status: tx.status,
            maskedPii: tx.maskedPii
          }
        });
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma Transaction insertion failed, falling back to JSON storage:', err.message);
      }
    }
    
    await lockAndModifyAsync(TX_FILE, (list: Transaction[]) => {
      list.unshift(tx);
      return list;
    });
  }

  // ==========================================
  // Signed Receipts Management
  // ==========================================
  private async getAuditReceiptsJson(): Promise<AuditReceipt[]> {
    try {
      const data = await fs.promises.readFile(RECEIPTS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return INITIAL_RECEIPTS;
    }
  }

  public async getAuditReceipts(): Promise<AuditReceipt[]> {
    if (this.usePostgres && this.prisma) {
      try {
        const receipts = await this.prisma.auditReceipt.findMany({
          orderBy: { issued_at: 'desc' }
        });
        return receipts.map(r => ({
          payload: {
            type: r.type,
            tool_name: r.tool_name,
            decision: r.decision as any,
            policy_digest: r.policy_digest,
            issued_at: r.issued_at.toISOString(),
            issuer_id: r.issuer_id,
            reason: r.reason || undefined,
            claimed_issuer_tier: r.claimed_issuer_tier || undefined,
            actualTokensInput: r.actualTokensInput ?? undefined,
            actualTokensOutput: r.actualTokensOutput ?? undefined,
            actualTokensCached: r.actualTokensCached ?? undefined,
            subagentId: r.subagentId ?? undefined,
            subagentMaxBudget: r.subagentMaxBudget ?? undefined
          },
          signature: {
            alg: r.signature_alg as any,
            kid: r.issuer_id,
            sig: r.signature_sig
          },
          receiptHash: r.receiptHash || undefined,
          previousReceiptHash: r.previousReceiptHash || undefined
        }));
      } catch (err: any) {
        console.warn('⚠️  Prisma Receipt query failed, falling back to JSON storage:', err.message);
      }
    }
    return await this.getAuditReceiptsJson();
  }

  public async addAuditReceipt(receipt: AuditReceipt): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        let previousHash = '';
        const lastReceipt = await this.prisma.auditReceipt.findFirst({
          orderBy: { issued_at: 'desc' }
        });
        if (lastReceipt) {
          previousHash = lastReceipt.receiptHash || '';
        }
        const hash = calculateReceiptHash({
          payload: receipt.payload,
          signature: receipt.signature,
          previousReceiptHash: previousHash
        });

        await this.prisma.auditReceipt.create({
          data: {
            id: `rc_${Math.floor(100000 + Math.random() * 900000)}`,
            type: receipt.payload.type,
            tool_name: receipt.payload.tool_name,
            decision: receipt.payload.decision,
            policy_digest: receipt.payload.policy_digest,
            issued_at: new Date(receipt.payload.issued_at),
            issuer_id: receipt.payload.issuer_id,
            reason: receipt.payload.reason || null,
            claimed_issuer_tier: receipt.payload.claimed_issuer_tier || null,
            signature_alg: receipt.signature.alg,
            signature_sig: receipt.signature.sig,
            receiptHash: hash,
            previousReceiptHash: previousHash,
            actualTokensInput: receipt.payload.actualTokensInput || null,
            actualTokensOutput: receipt.payload.actualTokensOutput || null,
            actualTokensCached: receipt.payload.actualTokensCached || null,
            subagentId: receipt.payload.subagentId || null,
            subagentMaxBudget: receipt.payload.subagentMaxBudget || null
          }
        });
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma Receipt insertion failed, falling back to JSON storage:', err.message);
      }
    }
    
    await lockAndModifyAsync(RECEIPTS_FILE, (list: AuditReceipt[]) => {
      let previousHash = '';
      if (list.length > 0) {
        previousHash = (list[0] as any).receiptHash || '';
      }
      const receiptToStore = {
        ...receipt,
        previousReceiptHash: previousHash
      };
      const hash = calculateReceiptHash({
        payload: receipt.payload,
        signature: receipt.signature,
        previousReceiptHash: previousHash
      });
      (receiptToStore as any).receiptHash = hash;
      list.unshift(receiptToStore);
      return list;
    });
  }

  // ==========================================
  // Security Findings Management
  // ==========================================
  private async getFindingsJson(): Promise<SecurityFinding[]> {
    try {
      const data = await fs.promises.readFile(FINDINGS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  public async getFindings(): Promise<SecurityFinding[]> {
    if (this.usePostgres && this.prisma) {
      try {
        const findings = await this.prisma.securityFinding.findMany();
        return findings.map(f => ({
          vector: f.vector,
          title: f.title,
          severity: f.severity as any,
          file: f.file,
          step: f.step,
          impact: f.impact,
          evidence: f.evidence,
          dataFlow: f.dataFlow,
          remediation: f.remediation,
          amplifiedBy: f.amplifiedBy
        }));
      } catch (err: any) {
        console.warn('⚠️  Prisma Findings query failed, falling back to JSON storage:', err.message);
      }
    }
    return await this.getFindingsJson();
  }

  public async setFindings(findings: SecurityFinding[]): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        // Transactions batch clear and insert
        await this.prisma.$transaction([
          this.prisma.securityFinding.deleteMany(),
          ...findings.map(f => this.prisma!.securityFinding.create({
            data: {
              vector: f.vector,
              title: f.title,
              severity: f.severity,
              file: f.file,
              step: f.step,
              impact: f.impact,
              evidence: f.evidence,
              dataFlow: f.dataFlow,
              remediation: f.remediation,
              amplifiedBy: f.amplifiedBy
            }
          }))
        ]);
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma Findings batch set failed, falling back to JSON storage:', err.message);
      }
    }
    
    await lockAndModifyAsync(FINDINGS_FILE, () => findings);
  }

  public async addFinding(finding: SecurityFinding): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.securityFinding.create({
          data: {
            vector: finding.vector,
            title: finding.title,
            severity: finding.severity,
            file: finding.file,
            step: finding.step,
            impact: finding.impact,
            evidence: finding.evidence,
            dataFlow: finding.dataFlow,
            remediation: finding.remediation,
            amplifiedBy: finding.amplifiedBy
          }
        });
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma Finding insertion failed, falling back to JSON storage:', err.message);
      }
    }
    
    await lockAndModifyAsync(FINDINGS_FILE, (list: SecurityFinding[]) => {
      list.push(finding);
      return list;
    });
  }

  // ==========================================
  // Command Audit Logs Management
  // ==========================================
  private getCommandLogsJson(): CommandLogEntry[] {
    this.ensureInitialized();
    try {
      const data = fs.readFileSync(COMMAND_LOGS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  public async getCommandLogs(): Promise<CommandLogEntry[]> {
    if (this.usePostgres && this.prisma) {
      try {
        const logs = await this.prisma.commandLog.findMany({
          orderBy: { timestamp: 'desc' }
        });
        return logs.map(l => ({
          id: l.id,
          timestamp: l.timestamp.toISOString(),
          command: l.command,
          user: l.user,
          role: l.role,
          status: l.status as any,
          exitCode: l.exitCode,
          cedarDecision: l.cedarDecision as any
        }));
      } catch (err: any) {
        console.warn('⚠️  Prisma CommandLog query failed, falling back to JSON storage:', err.message);
      }
    }
    return this.getCommandLogsJson();
  }

  public async addCommandLog(logEntry: CommandLogEntry): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.commandLog.create({
          data: {
            id: logEntry.id,
            timestamp: new Date(logEntry.timestamp),
            command: logEntry.command,
            user: logEntry.user,
            role: logEntry.role,
            status: logEntry.status,
            exitCode: logEntry.exitCode,
            cedarDecision: logEntry.cedarDecision
          }
        });
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma CommandLog insertion failed, falling back to JSON storage:', err.message);
      }
    }

    lockAndModify(COMMAND_LOGS_FILE, (list: CommandLogEntry[]) => {
      list.unshift(logEntry);
      return list;
    });
  }

  // ==========================================
  // Filesystem Drift Management
  // ==========================================
  private getDriftsJson(): FilesystemDriftEntry[] {
    this.ensureInitialized();
    try {
      const data = fs.readFileSync(DRIFTS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  public async getDrifts(): Promise<FilesystemDriftEntry[]> {
    if (this.usePostgres && this.prisma) {
      try {
        const drifts = await this.prisma.filesystemDrift.findMany({
          orderBy: { timestamp: 'desc' }
        });
        return drifts.map(d => ({
          id: d.id,
          timestamp: d.timestamp.toISOString(),
          filePath: d.filePath,
          changeType: d.changeType,
          diff: d.diff,
          reconciled: d.reconciled
        }));
      } catch (err: any) {
        console.warn('⚠️  Prisma FilesystemDrift query failed, falling back to JSON storage:', err.message);
      }
    }
    return this.getDriftsJson();
  }

  public async addDrift(drift: Omit<FilesystemDriftEntry, 'id' | 'timestamp' | 'reconciled'>): Promise<FilesystemDriftEntry> {
    const newEntry: FilesystemDriftEntry = {
      id: `drift_${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      filePath: drift.filePath,
      changeType: drift.changeType,
      diff: drift.diff || null,
      reconciled: false
    };

    if (this.usePostgres && this.prisma) {
      try {
        const d = await this.prisma.filesystemDrift.create({
          data: {
            id: newEntry.id,
            timestamp: new Date(newEntry.timestamp),
            filePath: newEntry.filePath,
            changeType: newEntry.changeType,
            diff: newEntry.diff,
            reconciled: false
          }
        });
        return {
          id: d.id,
          timestamp: d.timestamp.toISOString(),
          filePath: d.filePath,
          changeType: d.changeType,
          diff: d.diff,
          reconciled: d.reconciled
        };
      } catch (err: any) {
        console.warn('⚠️  Prisma FilesystemDrift insertion failed, falling back to JSON storage:', err.message);
      }
    }

    let returnedEntry: FilesystemDriftEntry | null = null;
    lockAndModify(DRIFTS_FILE, (list: FilesystemDriftEntry[]) => {
      returnedEntry = {
        id: `drift_${Math.floor(100000 + Math.random() * 900000)}`,
        timestamp: new Date().toISOString(),
        filePath: drift.filePath,
        changeType: drift.changeType,
        diff: drift.diff || null,
        reconciled: false
      };
      list.unshift(returnedEntry);
      return list;
    });
    return returnedEntry!;
  }

  public async reconcileDrifts(): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.filesystemDrift.updateMany({
          where: { reconciled: false },
          data: { reconciled: true }
        });
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma FilesystemDrift reconciliation update failed, falling back to JSON storage:', err.message);
      }
    }

    lockAndModify(DRIFTS_FILE, (list: FilesystemDriftEntry[]) => {
      return list.map(d => ({ ...d, reconciled: true }));
    });
  }

  // ==========================================
  // System Config / Circuit Breaker Management
  // ==========================================
  private getSystemConfigJson(): { circuitBreakerActive: boolean; agentTokenBudget: number } {
    const CONFIG_FILE = path.join(DATA_DIR, 'system-config.json');
    if (!fs.existsSync(CONFIG_FILE)) {
      writeJsonAtomic(CONFIG_FILE, { circuitBreakerActive: false, agentTokenBudget: 1000.0 });
    }
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return { circuitBreakerActive: false, agentTokenBudget: 1000.0 };
    }
  }

  public async getSystemConfig(): Promise<{ circuitBreakerActive: boolean; agentTokenBudget: number }> {
    if (this.usePostgres && this.prisma) {
      try {
        const config = await this.prisma.systemConfig.findFirst();
        if (config) {
          return {
            circuitBreakerActive: config.circuitBreakerActive,
            agentTokenBudget: config.agentTokenBudget
          };
        } else {
          const newConfig = await this.prisma.systemConfig.create({
            data: { id: 'active_config', circuitBreakerActive: false, agentTokenBudget: 1000.0 }
          });
          return {
            circuitBreakerActive: newConfig.circuitBreakerActive,
            agentTokenBudget: newConfig.agentTokenBudget
          };
        }
      } catch (err: any) {
        console.warn('⚠️  Prisma SystemConfig query failed, falling back to JSON storage:', err.message);
      }
    }
    return this.getSystemConfigJson();
  }

  public async updateSystemConfig(config: { circuitBreakerActive?: boolean; agentTokenBudget?: number }): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.systemConfig.upsert({
          where: { id: 'active_config' },
          update: {
            circuitBreakerActive: config.circuitBreakerActive !== undefined ? config.circuitBreakerActive : undefined,
            agentTokenBudget: config.agentTokenBudget !== undefined ? config.agentTokenBudget : undefined
          },
          create: {
            id: 'active_config',
            circuitBreakerActive: config.circuitBreakerActive || false,
            agentTokenBudget: config.agentTokenBudget || 1000.0
          }
        });
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma SystemConfig upsert failed, falling back to JSON storage:', err.message);
      }
    }

    const CONFIG_FILE = path.join(DATA_DIR, 'system-config.json');
    lockAndModify(CONFIG_FILE, (current: any) => {
      return {
        circuitBreakerActive: config.circuitBreakerActive !== undefined ? config.circuitBreakerActive : current.circuitBreakerActive,
        agentTokenBudget: config.agentTokenBudget !== undefined ? config.agentTokenBudget : current.agentTokenBudget
      };
    }, { circuitBreakerActive: false, agentTokenBudget: 1000.0 });
  }

  // ==========================================
  // Consensus Gating / Pending Actions Management
  // ==========================================
  private getPendingActionsJson(): any[] {
    const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
    if (!fs.existsSync(ACTIONS_FILE)) {
      writeJsonAtomic(ACTIONS_FILE, []);
    }
    try {
      const data = fs.readFileSync(ACTIONS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  public async getPendingActions(): Promise<any[]> {
    if (this.usePostgres && this.prisma) {
      try {
        return await this.prisma.pendingAction.findMany({
          include: { approvals: true },
          orderBy: { createdAt: 'desc' }
        });
      } catch (err: any) {
        console.warn('⚠️  Prisma PendingAction query failed, falling back to JSON storage:', err.message);
      }
    }
    return this.getPendingActionsJson();
  }

  public async createPendingAction(action: {
    id: string;
    command: string;
    initiator: string;
    role: string;
    requiredVotes?: number;
    expiresInSeconds?: number;
    aiRating?: string;
    aiReason?: string;
  }): Promise<any> {
    const expiresAt = new Date(Date.now() + (action.expiresInSeconds || 3600) * 1000).toISOString();
    const newEntry = {
      id: action.id,
      createdAt: new Date().toISOString(),
      expiresAt,
      command: action.command,
      initiator: action.initiator,
      role: action.role,
      requiredVotes: action.requiredVotes || 2,
      status: 'pending',
      aiRating: action.aiRating || 'safe',
      aiReason: action.aiReason || '',
      adminOverridden: false,
      approvals: []
    };

    if (this.usePostgres && this.prisma) {
      try {
        const created = await this.prisma.pendingAction.create({
          data: {
            id: newEntry.id,
            createdAt: new Date(newEntry.createdAt),
            expiresAt: new Date(newEntry.expiresAt),
            command: newEntry.command,
            initiator: newEntry.initiator,
            role: newEntry.role,
            requiredVotes: newEntry.requiredVotes,
            status: 'pending',
            aiRating: newEntry.aiRating,
            aiReason: newEntry.aiReason,
            adminOverridden: false
          },
          include: { approvals: true }
        });
        return created;
      } catch (err: any) {
        console.warn('⚠️  Prisma PendingAction creation failed, falling back to JSON storage:', err.message);
      }
    }

    const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
    lockAndModify(ACTIONS_FILE, (list: any[]) => {
      list.unshift(newEntry);
      return list;
    });
    return newEntry;
  }

  public async addConsensusApproval(approval: {
    actionId: string;
    approver: string;
    role: string;
    signature: string;
  }): Promise<any> {
    const newApproval = {
      id: `app_${Math.floor(100000 + Math.random() * 900000)}`,
      actionId: approval.actionId,
      timestamp: new Date().toISOString(),
      approver: approval.approver,
      role: approval.role,
      signature: approval.signature
    };

    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.consensusApproval.create({
          data: {
            id: newApproval.id,
            actionId: newApproval.actionId,
            timestamp: new Date(newApproval.timestamp),
            approver: newApproval.approver,
            role: newApproval.role,
            signature: newApproval.signature
          }
        });

        // Check if consensus is met
        const action = await this.prisma.pendingAction.findUnique({
          where: { id: approval.actionId },
          include: { approvals: true }
        });

        if (action && action.approvals.length >= action.requiredVotes && action.status === 'pending') {
          const updatedAction = await this.prisma.pendingAction.update({
            where: { id: approval.actionId },
            data: { status: 'approved' },
            include: { approvals: true }
          });
          return updatedAction;
        }
        return action;
      } catch (err: any) {
        console.warn('⚠️  Prisma ConsensusApproval insertion failed, falling back to JSON storage:', err.message);
      }
    }

    const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
    let returnedAction: any = null;
    lockAndModify(ACTIONS_FILE, (list: any[]) => {
      const action = list.find(a => a.id === approval.actionId);
      if (action) {
        // Prevent duplicate approval roles
        if (!action.approvals.some((app: any) => app.role === approval.role)) {
          action.approvals.push({
            id: newApproval.id,
            actionId: newApproval.actionId,
            timestamp: newApproval.timestamp,
            approver: newApproval.approver,
            role: newApproval.role,
            signature: newApproval.signature
          });
          if (action.approvals.length >= action.requiredVotes && action.status === 'pending') {
            action.status = 'approved';
          }
        }
        returnedAction = action;
      }
      return list;
    });
    return returnedAction;
  }

  public async expirePendingAction(actionId: string): Promise<any> {
    if (this.usePostgres && this.prisma) {
      try {
        const updated = await this.prisma.pendingAction.update({
          where: { id: actionId },
          data: { status: 'expired' },
          include: { approvals: true }
        });
        return updated;
      } catch (err: any) {
        console.warn('⚠️  Prisma PendingAction update to expired failed, falling back to JSON storage:', err.message);
      }
    }

    const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
    let returnedAction: any = null;
    lockAndModify(ACTIONS_FILE, (list: any[]) => {
      const action = list.find(a => a.id === actionId);
      if (action) {
        action.status = 'expired';
        returnedAction = action;
      }
      return list;
    });
    return returnedAction;
  }

  public async adminOverrideAction(actionId: string): Promise<any> {
    if (this.usePostgres && this.prisma) {
      try {
        const updated = await this.prisma.pendingAction.update({
          where: { id: actionId },
          data: { adminOverridden: true },
          include: { approvals: true }
        });
        return updated;
      } catch (err: any) {
        console.warn('⚠️  Prisma PendingAction admin override failed, falling back to JSON storage:', err.message);
      }
    }

    const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
    let returnedAction: any = null;
    lockAndModify(ACTIONS_FILE, (list: any[]) => {
      const action = list.find(a => a.id === actionId);
      if (action) {
        action.adminOverridden = true;
        returnedAction = action;
      }
      return list;
    });
    return returnedAction;
  }

  public async completeAction(actionId: string): Promise<any> {
    if (this.usePostgres && this.prisma) {
      try {
        const updated = await this.prisma.pendingAction.update({
          where: { id: actionId },
          data: { status: 'completed' },
          include: { approvals: true }
        });
        return updated;
      } catch (err: any) {
        console.warn('⚠️  Prisma PendingAction complete failed, falling back to JSON storage:', err.message);
      }
    }

    const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
    let returnedAction: any = null;
    lockAndModify(ACTIONS_FILE, (list: any[]) => {
      const action = list.find(a => a.id === actionId);
      if (action) {
        action.status = 'completed';
        returnedAction = action;
      }
      return list;
    });
    return returnedAction;
  }

  private getBudgetExtensionsJson(): BudgetExtensionRequest[] {
    this.ensureInitialized();
    if (!fs.existsSync(BUDGET_EXTENSIONS_FILE)) {
      writeJsonAtomic(BUDGET_EXTENSIONS_FILE, []);
    }
    try {
      const data = fs.readFileSync(BUDGET_EXTENSIONS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  public async getBudgetExtensionRequests(): Promise<BudgetExtensionRequest[]> {
    if (this.usePostgres && this.prisma) {
      try {
        const requests = await this.prisma.budgetExtensionRequest.findMany({
          orderBy: { createdAt: 'desc' }
        });
        return requests.map(r => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          requestedAmount: r.requestedAmount,
          reason: r.reason,
          applicant: r.applicant,
          status: r.status as any,
          reviewer: r.reviewer,
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null
        }));
      } catch (err: any) {
        console.warn('⚠️  Prisma BudgetExtensionRequest query failed, falling back to JSON storage:', err.message);
      }
    }
    return this.getBudgetExtensionsJson();
  }

  public async createBudgetExtensionRequest(id: string, requestedAmount: number, reason: string, applicant: string): Promise<BudgetExtensionRequest> {
    const newEntry: BudgetExtensionRequest = {
      id,
      createdAt: new Date().toISOString(),
      requestedAmount,
      reason,
      applicant,
      status: 'pending',
      reviewer: null,
      reviewedAt: null
    };

    if (this.usePostgres && this.prisma) {
      try {
        const created = await this.prisma.budgetExtensionRequest.create({
          data: {
            id: newEntry.id,
            createdAt: new Date(newEntry.createdAt),
            requestedAmount: newEntry.requestedAmount,
            reason: newEntry.reason,
            applicant: newEntry.applicant,
            status: newEntry.status,
            reviewer: null,
            reviewedAt: null
          }
        });
        return {
          id: created.id,
          createdAt: created.createdAt.toISOString(),
          requestedAmount: created.requestedAmount,
          reason: created.reason,
          applicant: created.applicant,
          status: created.status as any,
          reviewer: created.reviewer,
          reviewedAt: created.reviewedAt ? created.reviewedAt.toISOString() : null
        };
      } catch (err: any) {
        console.warn('⚠️  Prisma BudgetExtensionRequest creation failed, falling back to JSON storage:', err.message);
      }
    }

    lockAndModify(BUDGET_EXTENSIONS_FILE, (list: BudgetExtensionRequest[]) => {
      list.push(newEntry);
      return list;
    });
    return newEntry;
  }

  public async approveBudgetExtensionRequest(id: string, reviewer: string): Promise<BudgetExtensionRequest | null> {
    const reviewedAtStr = new Date().toISOString();
    if (this.usePostgres && this.prisma) {
      try {
        const updated = await this.prisma.budgetExtensionRequest.update({
          where: { id },
          data: {
            status: 'approved',
            reviewer,
            reviewedAt: new Date(reviewedAtStr)
          }
        });
        return {
          id: updated.id,
          createdAt: updated.createdAt.toISOString(),
          requestedAmount: updated.requestedAmount,
          reason: updated.reason,
          applicant: updated.applicant,
          status: updated.status as any,
          reviewer: updated.reviewer,
          reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null
        };
      } catch (err: any) {
        console.warn('⚠️  Prisma BudgetExtensionRequest approval failed, falling back to JSON storage:', err.message);
      }
    }

    let returnedReq: BudgetExtensionRequest | null = null;
    lockAndModify(BUDGET_EXTENSIONS_FILE, (list: BudgetExtensionRequest[]) => {
      const req = list.find(r => r.id === id);
      if (req) {
        req.status = 'approved';
        req.reviewer = reviewer;
        req.reviewedAt = reviewedAtStr;
        returnedReq = req;
      }
      return list;
    });
    return returnedReq;
  }

  public async rejectBudgetExtensionRequest(id: string, reviewer: string): Promise<BudgetExtensionRequest | null> {
    const reviewedAtStr = new Date().toISOString();
    if (this.usePostgres && this.prisma) {
      try {
        const updated = await this.prisma.budgetExtensionRequest.update({
          where: { id },
          data: {
            status: 'rejected',
            reviewer,
            reviewedAt: new Date(reviewedAtStr)
          }
        });
        return {
          id: updated.id,
          createdAt: updated.createdAt.toISOString(),
          requestedAmount: updated.requestedAmount,
          reason: updated.reason,
          applicant: updated.applicant,
          status: updated.status as any,
          reviewer: updated.reviewer,
          reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null
        };
      } catch (err: any) {
        console.warn('⚠️  Prisma BudgetExtensionRequest rejection failed, falling back to JSON storage:', err.message);
      }
    }

    let returnedReq: BudgetExtensionRequest | null = null;
    lockAndModify(BUDGET_EXTENSIONS_FILE, (list: BudgetExtensionRequest[]) => {
      const req = list.find(r => r.id === id);
      if (req) {
        req.status = 'rejected';
        req.reviewer = reviewer;
        req.reviewedAt = reviewedAtStr;
        returnedReq = req;
      }
      return list;
    });
    return returnedReq;
  }

  // ==========================================
  // Quarantine Management
  // ==========================================
  public async quarantinePrincipal(record: Omit<QuarantineRecord, 'status' | 'releasedAt' | 'releasedBy'>): Promise<QuarantineRecord> {
    const newRecord: QuarantineRecord = {
      ...record,
      status: 'active',
      releasedAt: null,
      releasedBy: null
    };
    lockAndModify(QUARANTINE_FILE, (list: QuarantineRecord[]) => {
      // Upsert — replace existing record for the same principal if present
      const idx = list.findIndex(r => r.principalId === record.principalId);
      if (idx >= 0) { list[idx] = newRecord; } else { list.unshift(newRecord); }
      return list;
    });
    return newRecord;
  }

  public async releaseQuarantine(principalId: string, releasedBy: string): Promise<QuarantineRecord | null> {
    const releasedAt = new Date().toISOString();
    let result: QuarantineRecord | null = null;
    lockAndModify(QUARANTINE_FILE, (list: QuarantineRecord[]) => {
      const record = list.find(r => r.principalId === principalId);
      if (record) {
        record.status = 'released';
        record.releasedAt = releasedAt;
        record.releasedBy = releasedBy;
        result = record;
      }
      return list;
    });
    return result;
  }

  public async getQuarantineRecord(principalId: string): Promise<QuarantineRecord | null> {
    this.ensureInitialized();
    try {
      const data = JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf-8')) as QuarantineRecord[];
      return data.find(r => r.principalId === principalId && r.status === 'active') || null;
    } catch { return null; }
  }

  public async getQuarantinedPrincipals(): Promise<QuarantineRecord[]> {
    this.ensureInitialized();
    try {
      return JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf-8')) as QuarantineRecord[];
    } catch { return []; }
  }

  // ==========================================
  // Interview Log Management
  // ==========================================
  public async addInterviewLog(entry: Omit<InterviewLog, 'interviewId' | 'timestamp'>): Promise<InterviewLog> {
    const newEntry: InterviewLog = {
      interviewId: `iv_${Math.random().toString(36).substring(2, 10)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    lockAndModify(INTERVIEW_LOGS_FILE, (list: InterviewLog[]) => { list.push(newEntry); return list; });
    return newEntry;
  }

  public async getInterviewLogs(principalId: string): Promise<InterviewLog[]> {
    this.ensureInitialized();
    try {
      const all = JSON.parse(fs.readFileSync(INTERVIEW_LOGS_FILE, 'utf-8')) as InterviewLog[];
      return all.filter(l => l.principalId === principalId);
    } catch { return []; }
  }

  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latencyMs: number; error?: string }> {
    if (!this.usePostgres || !this.prisma) {
      return { status: 'healthy', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        latencyMs: Date.now() - start
      };
    } catch (e: any) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: e.message
      };
    }
  }

  public async clearDatabase(): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.$transaction([
          this.prisma.systemConfig.deleteMany(),
          this.prisma.filesystemDrift.deleteMany(),
          this.prisma.consensusApproval.deleteMany(),
          this.prisma.pendingAction.deleteMany(),
          this.prisma.transaction.deleteMany(),
          this.prisma.auditReceipt.deleteMany(),
          this.prisma.securityFinding.deleteMany(),
          this.prisma.logEntry.deleteMany(),
          this.prisma.commandLog.deleteMany(),
          this.prisma.budgetExtensionRequest.deleteMany()
        ]);
      } catch (err: any) {
        console.warn('⚠️  Prisma Database clear failed, falling back to JSON storage:', err.message);
      }
    }
    
    this.ensureInitialized();
    writeJsonAtomic(TX_FILE, INITIAL_TRANSACTIONS);
    writeJsonAtomic(RECEIPTS_FILE, INITIAL_RECEIPTS);
    writeJsonAtomic(FINDINGS_FILE, []);
    writeJsonAtomic(COMMAND_LOGS_FILE, []);
    writeJsonAtomic(DRIFTS_FILE, []);
    const ACTIONS_FILE = path.join(DATA_DIR, 'pending-actions.json');
    writeJsonAtomic(ACTIONS_FILE, []);
    const CONFIG_FILE = path.join(DATA_DIR, 'system-config.json');
    writeJsonAtomic(CONFIG_FILE, { circuitBreakerActive: false, agentTokenBudget: 1000.0 });
    writeJsonAtomic(BUDGET_EXTENSIONS_FILE, []);
    writeJsonAtomic(QUARANTINE_FILE, []);
    writeJsonAtomic(INTERVIEW_LOGS_FILE, []);
  }
}
