import type { AuditReceiptPayload } from '@fidusgate/core-types';

export type ToolCallReceiptDecision = 'allow' | 'deny';

export type ToolCallPolicyEngine = 'command-audit' | 'cedar' | 'sensitive-file';

/** Short stable label of which engine decided. Does not hash policy or wasm bytes. */
export function toolCallPolicyDigest(
  engine: ToolCallPolicyEngine,
  matchingPolicyId?: string,
): string {
  const policyId = matchingPolicyId?.trim() ?? '';
  if (policyId.length > 0) {
    return policyId;
  }
  switch (engine) {
    case 'command-audit':
      return 'command-audit';
    case 'sensitive-file':
      return 'sensitive-file';
    case 'cedar':
      return 'cedar';
    default: {
      const unexpected: never = engine;
      return unexpected;
    }
  }
}

/** Keep tool output in the first text block. The receipt is a second block when present. */
export function toolResultContent(
  text: string,
  receiptRef: string | undefined,
): Array<{ type: 'text'; text: string }> {
  const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text }];
  if (receiptRef) {
    content.push({ type: 'text', text: `receipt ${receiptRef}` });
  }
  return content;
}

/** Pure payload for a tools/call audit receipt. No signing and no I/O. */
export function buildToolCallReceiptPayload(input: {
  toolName: string;
  decision: ToolCallReceiptDecision;
  reason?: string;
  issuedAt: string;
  policyDigest: string;
  issuerId: string;
}): AuditReceiptPayload {
  const payload: AuditReceiptPayload = {
    type: 'protectmcp:decision',
    tool_name: input.toolName,
    decision: input.decision,
    policy_digest: input.policyDigest,
    issued_at: input.issuedAt,
    issuer_id: input.issuerId,
  };
  const reason = input.reason?.trim();
  if (reason) {
    payload.reason = reason;
  }
  return payload;
}
