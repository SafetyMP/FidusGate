import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Transaction, AuditReceipt, SecurityFinding } from '@veritas/core-types';

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

const DATA_DIR = path.join(__dirname, '..', 'data');
const TX_FILE = path.join(DATA_DIR, 'transactions.json');
const RECEIPTS_FILE = path.join(DATA_DIR, 'receipts.json');
const FINDINGS_FILE = path.join(DATA_DIR, 'findings.json');
const COMMAND_LOGS_FILE = path.join(DATA_DIR, 'command-logs.json');

// POSIX-compliant atomic file writer helper to prevent JSON database file corruption
function writeJsonAtomic(filePath: string, data: any) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${Math.random().toString(36).substring(2)}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
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
    recipient: 'SageHart Admin Wallet',
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

export class VeritasDatabase {
  private prisma: PrismaClient | null = null;
  private usePostgres = false;

  constructor() {
    this.ensureInitialized();
    this.initPrisma();
  }

  private initPrisma() {
    if (process.env.DATABASE_URL) {
      try {
        this.prisma = new PrismaClient();
        this.usePostgres = true;
        console.log('📡 VeritasDatabase: Relational PostgreSQL mode enabled via Prisma ORM.');
      } catch (e: any) {
        console.warn('⚠️  VeritasDatabase: Failed to initialize Prisma client, falling back to JSON mock files:', e.message);
        this.usePostgres = false;
      }
    } else {
      console.log('💾 VeritasDatabase: Running in zero-dependency local JSON file store mode.');
    }
  }

  private ensureInitialized() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(TX_FILE)) {
      writeJsonAtomic(TX_FILE, INITIAL_TRANSACTIONS);
    }
    
    if (!fs.existsSync(RECEIPTS_FILE)) {
      writeJsonAtomic(RECEIPTS_FILE, INITIAL_RECEIPTS);
    }
    
    if (!fs.existsSync(FINDINGS_FILE)) {
      writeJsonAtomic(FINDINGS_FILE, []);
    }

    if (!fs.existsSync(COMMAND_LOGS_FILE)) {
      writeJsonAtomic(COMMAND_LOGS_FILE, []);
    }
  }

  // ==========================================
  // Transactions Management
  // ==========================================
  private getTransactionsJson(): Transaction[] {
    this.ensureInitialized();
    try {
      const data = fs.readFileSync(TX_FILE, 'utf-8');
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
    return this.getTransactionsJson();
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
    
    const list = this.getTransactionsJson();
    list.unshift(tx);
    writeJsonAtomic(TX_FILE, list);
  }

  // ==========================================
  // Signed Receipts Management
  // ==========================================
  private getAuditReceiptsJson(): AuditReceipt[] {
    this.ensureInitialized();
    try {
      const data = fs.readFileSync(RECEIPTS_FILE, 'utf-8');
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
            claimed_issuer_tier: r.claimed_issuer_tier || undefined
          },
          signature: {
            alg: r.signature_alg as any,
            kid: r.issuer_id,
            sig: r.signature_sig
          }
        }));
      } catch (err: any) {
        console.warn('⚠️  Prisma Receipt query failed, falling back to JSON storage:', err.message);
      }
    }
    return this.getAuditReceiptsJson();
  }

  public async addAuditReceipt(receipt: AuditReceipt): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
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
            signature_sig: receipt.signature.sig
          }
        });
        return;
      } catch (err: any) {
        console.warn('⚠️  Prisma Receipt insertion failed, falling back to JSON storage:', err.message);
      }
    }
    
    const list = this.getAuditReceiptsJson();
    list.unshift(receipt);
    writeJsonAtomic(RECEIPTS_FILE, list);
  }

  // ==========================================
  // Security Findings Management
  // ==========================================
  private getFindingsJson(): SecurityFinding[] {
    this.ensureInitialized();
    try {
      const data = fs.readFileSync(FINDINGS_FILE, 'utf-8');
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
    return this.getFindingsJson();
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
    
    this.ensureInitialized();
    writeJsonAtomic(FINDINGS_FILE, findings);
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
    
    const list = this.getFindingsJson();
    list.push(finding);
    writeJsonAtomic(FINDINGS_FILE, list);
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
    return this.getCommandLogsJson();
  }

  public async addCommandLog(logEntry: CommandLogEntry): Promise<void> {
    const list = this.getCommandLogsJson();
    list.unshift(logEntry);
    writeJsonAtomic(COMMAND_LOGS_FILE, list);
  }

  public async clearDatabase(): Promise<void> {
    if (this.usePostgres && this.prisma) {
      try {
        await this.prisma.$transaction([
          this.prisma.transaction.deleteMany(),
          this.prisma.auditReceipt.deleteMany(),
          this.prisma.securityFinding.deleteMany(),
          this.prisma.logEntry.deleteMany()
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
  }
}
