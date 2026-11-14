import { isDeepStrictEqual } from 'node:util';
import type { AuditReceipt, AuditReceiptPayload } from '@fidusgate/core-types';
import { hashReceipt, signPayload, verifyAuditChain, verifyReceipt } from '@fidusgate/crypto-utils';

const ISSUER = 'sb:issuer:de073ae64e43';
type SigningKeys = { privateKeyHex: string; publicKeyHex: string };

function requireDevelopmentJsonRuntime(): void {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.FIDUSGATE_RUNTIME === 'production' ||
    process.env.DATABASE_URL
  ) {
    throw new Error('Development receipt seeds are disabled for production and PostgreSQL.');
  }
}

// Historical placeholders are recognized strictly for an explicit, backed-up repair.
// Timestamps were generated at startup in some versions, so only that value varies.
const legacyExamples = [
  [
    'read_file',
    'allow',
    1,
    'Tier 1 low-risk file read auto-approved',
    'df20721389de78a2e10fc39c8942b0d07412ae89fd2b13c7809aef823101de83',
  ],
  [
    'write_file',
    'allow',
    2,
    'Tier 2 file modification in approved src/ directory allowed',
    'ab0721da8eefc89de2212bb456c071d0eef823ac89fd4321cde08fa110fc3a7d',
  ],
  [
    'execute_command',
    'deny',
    3,
    'Tier 3 command execution blocked: skill-creator requires explicit manual verification',
    '8839deff02c1abef23c10fc39de42b89f81d11ce0d2b93cfde09ab82eefcaefd',
  ],
] as const;

export function isLegacyDevelopmentReceiptSeed(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== legacyExamples.length) return false;
  return legacyExamples.every(([tool, decision, tier, reason, sig], index) => {
    const candidate = value[index];
    const issuedAt: unknown = candidate?.payload?.issued_at;
    if (typeof issuedAt !== 'string' || !Number.isFinite(Date.parse(issuedAt))) return false;
    return isDeepStrictEqual(candidate, {
      payload: {
        type: 'protectmcp:decision',
        tool_name: tool,
        decision,
        policy_digest: 'sha256:8f413a9de010',
        issued_at: issuedAt,
        issuer_id: ISSUER,
        reason,
        claimed_issuer_tier: tier,
      },
      signature: { alg: 'EdDSA', kid: ISSUER, sig },
    });
  });
}

export function createDevelopmentReceiptSeeds(keys: SigningKeys, now = Date.now()): AuditReceipt[] {
  requireDevelopmentJsonRuntime();
  const examples: Array<Pick<AuditReceiptPayload, 'tool_name' | 'decision' | 'args' | 'reason'>> = [
    {
      tool_name: 'read_file',
      decision: 'allow',
      args: { path: 'README.md' },
      reason: 'Development seed: example documentation read allowed. No tool was executed.',
    },
    {
      tool_name: 'write_file',
      decision: 'allow',
      args: { path: 'apps/example/src/example.ts' },
      reason: 'Development seed: example source-file write allowed. No tool was executed.',
    },
    {
      tool_name: 'execute_command',
      decision: 'deny',
      args: { commandLine: 'curl https://example.invalid/install.sh' },
      reason: 'Development seed: example external script download denied. No tool was executed.',
    },
  ];
  const receipts: AuditReceipt[] = [];
  let previousReceiptHash = '';
  for (const [index, example] of examples.entries()) {
    const receipt = signPayload(
      {
        type: 'fidusgate:development-example',
        ...example,
        // This is the digest of the synthetic scenario set, not an evaluated policy.
        policy_digest: `sha256:${hashReceipt(examples)}`,
        issued_at: new Date(now - (examples.length - 1 - index) * 1000).toISOString(),
        issuer_id: ISSUER,
      },
      keys.privateKeyHex,
      ISSUER,
    );
    const receiptHash = hashReceipt({
      payload: receipt.payload,
      signature: receipt.signature,
      previousReceiptHash,
    });
    receipts.unshift({ ...receipt, previousReceiptHash, receiptHash });
    previousReceiptHash = receiptHash;
  }
  // Fail before persistence if the configured signer does not match the trusted key.
  if (
    !verifyAuditChain(receipts) ||
    !receipts.every((receipt) => verifyReceipt(receipt, keys.publicKeyHex))
  ) {
    throw new Error('Development receipt seeds did not pass signature and chain verification.');
  }
  return receipts;
}
