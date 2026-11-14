import type { AuditReceipt, AuditReceiptPayload } from '@fidusgate/core-types';
import { fixtureDecisions, fixturePublicKeyHex } from './fixtures';

export type ScenarioId = 'read-file' | 'protected-write' | 'outbound-command' | 'unknown-tool';

export interface DemoScenario {
  id: ScenarioId;
  title: string;
  description: string;
  tool: string;
  resource: string;
  decision: 'allow' | 'deny';
}

export interface DemoDecision {
  id: string;
  timestamp: string;
  principal: string;
  agentName: string;
  tool: string;
  resource: string;
  decision: 'allow' | 'deny';
  reason: string;
  ruleId: string;
  ruleLabel: string;
  nextStep: string;
  scenarioId: ScenarioId;
  receipt: AuditReceipt;
  replay?: boolean;
}

export interface VerificationResult {
  status: 'valid' | 'invalid' | 'error' | 'unsupported';
  message: string;
  payload?: AuditReceiptPayload;
}

export const DEMO_PUBLIC_KEY_HEX = fixturePublicKeyHex;
export const DEMO_KEY_ID = 'fidusgate:public-demo-key:v1';
export const DEMO_LIMITATION =
  'Synthetic examples with a public demo key. Scenario results are recorded fixtures, not a Cedar evaluation. No tool is executed.';

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: 'read-file',
    title: 'Read project documentation',
    description: 'A documentation agent requests a read of README.md.',
    tool: 'read_file',
    resource: 'README.md',
    decision: 'allow',
  },
  {
    id: 'protected-write',
    title: 'Change a protected policy',
    description: 'A coding agent attempts to overwrite policy.cedar.',
    tool: 'write_file',
    resource: 'policy.cedar',
    decision: 'deny',
  },
  {
    id: 'outbound-command',
    title: 'Download an external script',
    description: 'A build agent requests a network download through the shell.',
    tool: 'execute_command',
    resource: 'curl https://example.invalid/install.sh',
    decision: 'deny',
  },
  {
    id: 'unknown-tool',
    title: 'Call an unrecognized tool',
    description: 'An agent requests a tool that has no matching allow rule.',
    tool: 'deploy_service',
    resource: 'production',
    decision: 'deny',
  },
];

export const DEMO_DECISIONS: readonly DemoDecision[] = fixtureDecisions;

let replaySequence = 0;

/** Replays a signed fixture. The signed timestamp is preserved; this creates no new receipt. */
export function simulateScenario(id: ScenarioId): DemoDecision {
  const example = DEMO_DECISIONS.find((decision) => decision.scenarioId === id);
  if (!example) throw new Error('Unknown demo scenario. No authorization was performed.');
  replaySequence += 1;
  return {
    ...example,
    id: `replay-${id}-${replaySequence}`,
    receipt: JSON.parse(JSON.stringify(example.receipt)) as AuditReceipt,
    replay: true,
  };
}

export function receiptJson(decision: DemoDecision): string {
  return JSON.stringify(decision.receipt, null, 2);
}

/** Changes the signed decision without re-signing, demonstrating an integrity failure. */
export function tamperReceipt(input: string): string {
  const receipt: unknown = JSON.parse(input);
  if (!isRecord(receipt) || !isRecord(receipt.payload)) {
    throw new Error('Paste a receipt with a payload before trying the tamper example.');
  }
  receipt.payload.decision = receipt.payload.decision === 'allow' ? 'deny' : 'allow';
  return JSON.stringify(receipt, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPayload(value: unknown): value is AuditReceiptPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === 'string' &&
    typeof value.tool_name === 'string' &&
    (value.decision === 'allow' || value.decision === 'deny') &&
    typeof value.policy_digest === 'string' &&
    typeof value.issued_at === 'string' &&
    typeof value.issuer_id === 'string'
  );
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verifies the same JSON.stringify(payload) bytes used by LocalKMSProvider.
 * Supports direct signatures from this public fixture key only, not gateway
 * issuer discovery, attestation chains, receipt-chain integrity or authorization.
 */
export async function verifyDemoReceipt(input: string): Promise<VerificationResult> {
  if (input.length > 262_144) {
    return { status: 'error', message: 'This demo accepts receipts up to 256 KB.' };
  }
  let receipt: unknown;
  try {
    receipt = JSON.parse(input);
  } catch {
    return { status: 'error', message: 'Enter a valid JSON receipt to check its signature.' };
  }
  if (!isRecord(receipt) || !isPayload(receipt.payload) || !isRecord(receipt.signature)) {
    return { status: 'invalid', message: 'Receipt must contain a decision payload and signature.' };
  }
  const { payload, signature } = receipt;
  if (
    signature.alg !== 'EdDSA' ||
    typeof signature.sig !== 'string' ||
    !/^[0-9a-f]{128}$/i.test(signature.sig)
  ) {
    return {
      status: 'invalid',
      message: 'Expected an EdDSA signature containing 128 hex characters.',
    };
  }
  if (signature.kid !== DEMO_KEY_ID || signature.attestation !== undefined) {
    return {
      status: 'unsupported',
      message:
        'This demo only checks its public fixture key and direct signatures. Verify other issuers or attestation chains with your configured gateway.',
    };
  }
  if (!globalThis.crypto?.subtle) {
    return {
      status: 'unsupported',
      message:
        'Browser cryptography is unavailable. Open the demo over HTTPS in a browser with Ed25519 support.',
    };
  }
  try {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      hexBytes(DEMO_PUBLIC_KEY_HEX),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const verified = await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      hexBytes(signature.sig),
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    return {
      status: verified ? 'valid' : 'invalid',
      message: verified
        ? 'Signature matches the public demo key. This checks payload integrity only; it does not prove a trusted issuer, authorization, or tool execution.'
        : 'Signature does not match this payload and demo key. The payload may have changed or the signature may be wrong.',
      payload,
    };
  } catch {
    return {
      status: 'unsupported',
      message:
        'This browser could not perform Ed25519 verification. No verification result is available.',
    };
  }
}
