export interface Transaction {
  id: string;
  timestamp: string;
  sender: string;
  recipient: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'flagged';
  maskedPii?: boolean;
}

export interface AuditReceiptPayload {
  type: string;
  tool_name: string;
  decision: 'allow' | 'deny';
  policy_digest: string;
  issued_at: string;
  issuer_id: string;
  reason?: string;
  claimed_issuer_tier?: number;
  args?: Record<string, any>;
  actualTokensInput?: number;
  actualTokensOutput?: number;
  actualTokensCached?: number;
  subagentId?: string;
  subagentMaxBudget?: number;
}

export interface AttestationCertificate {
  sessionPublicKey: string;
  issuerId: string;
  expiresAt: string;
  attestationSignature: string; // Signature of sessionPublicKey+issuerId+expiresAt signed by root master key
}

export interface AuditReceiptSignature {
  alg: 'EdDSA';
  kid: string;
  sig: string;
  attestation?: AttestationCertificate;
}

export interface AuditReceipt {
  payload: AuditReceiptPayload;
  signature: AuditReceiptSignature;
  previousReceiptHash?: string;
  receiptHash?: string;
}

export interface SecurityFinding {
  vector: string;
  title: string;
  severity: 'High' | 'Medium' | 'Low' | 'Info';
  file: string;
  step: string;
  impact: string;
  evidence: string;
  dataFlow: string[];
  remediation: string;
  amplifiedBy?: string[];
}

export interface SecurityAuditReport {
  timestamp: string;
  workflowsScanned: number;
  instancesFound: number;
  findings: SecurityFinding[];
  summary: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'security';
  message: string;
  metadata?: Record<string, any>;
}
