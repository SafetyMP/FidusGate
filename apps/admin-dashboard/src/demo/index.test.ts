import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_DECISIONS,
  DEMO_SCENARIOS,
  receiptJson,
  simulateScenario,
  tamperReceipt,
  verifyDemoReceipt,
  type ScenarioId,
} from './index';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synthetic decision scenarios', () => {
  it('starts with the denied protected-policy write and covers the intended outcomes', () => {
    expect(DEMO_DECISIONS).toHaveLength(12);
    expect(DEMO_DECISIONS[0]).toMatchObject({
      tool: 'write_file',
      resource: 'policy.cedar',
      decision: 'deny',
    });
    expect(DEMO_SCENARIOS.map((scenario) => simulateScenario(scenario.id).decision)).toEqual([
      'allow',
      'deny',
      'deny',
      'deny',
    ]);
  });

  it('keeps a replay distinct from new receipt issuance and isolates its payload', () => {
    const original = DEMO_DECISIONS[0];
    const replay = simulateScenario('protected-write');
    const second = simulateScenario('protected-write');
    expect(replay.id).not.toBe(second.id);
    expect(replay.replay).toBe(true);
    expect(replay.receipt).toEqual(original.receipt);
    expect(replay.timestamp).toBe(original.timestamp);
    replay.receipt.payload.decision = 'allow';
    expect(original.receipt.payload.decision).toBe('deny');
  });

  it('refuses unknown scenarios instead of manufacturing an allow', () => {
    expect(() => simulateScenario('not-a-scenario' as ScenarioId)).toThrow('Unknown demo scenario');
  });
});

describe('browser receipt verification', () => {
  it('cryptographically verifies every seeded receipt without treating validity as trust', async () => {
    for (const decision of DEMO_DECISIONS) {
      const result = await verifyDemoReceipt(receiptJson(decision));
      expect(result.status).toBe('valid');
      expect(result.message).toContain('does not prove a trusted issuer');
      expect(result.payload?.decision).toBe(decision.decision);
    }
  });

  it('rejects a changed payload with the original signature', async () => {
    const original = receiptJson(DEMO_DECISIONS[0]);
    const changed = tamperReceipt(original);
    expect((await verifyDemoReceipt(changed)).status).toBe('invalid');
    expect((await verifyDemoReceipt(original)).status).toBe('valid');
  });

  it('rejects an altered signature even when the payload is untouched', async () => {
    const receipt = JSON.parse(receiptJson(DEMO_DECISIONS[0]));
    receipt.signature.sig = '00'.repeat(64);
    expect((await verifyDemoReceipt(JSON.stringify(receipt))).status).toBe('invalid');
  });

  it('reports unsupported issuers and attestation chains instead of validating them', async () => {
    const receipt = JSON.parse(receiptJson(DEMO_DECISIONS[0]));
    receipt.signature.kid = 'production-issuer';
    expect((await verifyDemoReceipt(JSON.stringify(receipt))).status).toBe('unsupported');
    const attested = JSON.parse(receiptJson(DEMO_DECISIONS[0]));
    attested.signature.attestation = { expiresAt: '2099-01-01' };
    expect((await verifyDemoReceipt(JSON.stringify(attested))).status).toBe('unsupported');
  });

  it('reports malformed and oversized input without throwing', async () => {
    expect((await verifyDemoReceipt('not json')).status).toBe('error');
    expect((await verifyDemoReceipt('null')).status).toBe('invalid');
    expect((await verifyDemoReceipt('{"payload":{},"signature":{}}')).status).toBe('invalid');
    expect((await verifyDemoReceipt('x'.repeat(262_145))).status).toBe('error');
  });

  it('does not report a pass when browser cryptography is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    expect((await verifyDemoReceipt(receiptJson(DEMO_DECISIONS[0]))).status).toBe('unsupported');
  });

  it('does not report a pass when Ed25519 is unsupported', async () => {
    vi.stubGlobal('crypto', {
      subtle: { importKey: vi.fn().mockRejectedValue(new Error('Not supported')) },
    });
    expect((await verifyDemoReceipt(receiptJson(DEMO_DECISIONS[0]))).status).toBe('unsupported');
  });
});
