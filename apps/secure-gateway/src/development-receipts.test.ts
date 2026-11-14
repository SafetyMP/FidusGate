import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuditReceipt } from '@fidusgate/core-types';
import {
  generateKeyPair,
  hashReceipt,
  verifyAuditChain,
  verifyReceipt,
} from '@fidusgate/crypto-utils';
import {
  createDevelopmentReceiptSeeds,
  isLegacyDevelopmentReceiptSeed,
} from './development-receipts';

const environmentNames = [
  'NODE_ENV',
  'FIDUSGATE_RUNTIME',
  'DATABASE_URL',
  'AWS_KMS_KEY_ID',
  'AWS_ACCESS_KEY_ID',
  'GCP_KMS_KEY_RING',
  'GCP_KMS_KEY_NAME',
  'VAULT_ADDR',
  'VAULT_TOKEN',
  'KMS_KEY_ID',
] as const;
function withDevelopmentEnvironment(run: () => void): void {
  const prior = environmentNames.map((name) => [name, process.env[name]] as const);
  try {
    for (const name of environmentNames) delete process.env[name];
    process.env.NODE_ENV = 'test';
    run();
  } finally {
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function legacySeed(): AuditReceipt[] {
  const rows = [
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
  return rows.map(([tool_name, decision, claimed_issuer_tier, reason, sig], index) => ({
    payload: {
      type: 'protectmcp:decision',
      tool_name,
      decision,
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date(Date.UTC(2026, 5, 5, 10, index)).toISOString(),
      issuer_id: 'sb:issuer:de073ae64e43',
      reason,
      claimed_issuer_tier,
    },
    signature: { alg: 'EdDSA', kid: 'sb:issuer:de073ae64e43', sig },
  }));
}

test('development examples have genuine signatures and a newest-first chain', () =>
  withDevelopmentEnvironment(() => {
    const keys = generateKeyPair();
    const receipts = createDevelopmentReceiptSeeds(keys, Date.UTC(2026, 10, 14));
    assert.equal(receipts.length, 3);
    assert.equal(verifyAuditChain(receipts), true);
    assert.equal(receipts.at(-1)?.previousReceiptHash, '');
    for (const receipt of receipts) {
      assert.equal(verifyReceipt(receipt, keys.publicKeyHex), true);
      assert.equal(receipt.payload.type, 'fidusgate:development-example');
      assert.match(receipt.payload.reason || '', /Development seed:.*No tool was executed/);
    }
    assert.ok(receipts[0].payload.issued_at > receipts[1].payload.issued_at);
    assert.ok(receipts[1].payload.issued_at > receipts[2].payload.issued_at);
  }));

test('payload, signature, link, and order mutations are rejected by unchanged verifiers', () =>
  withDevelopmentEnvironment(() => {
    const keys = generateKeyPair();
    const original = createDevelopmentReceiptSeeds(keys);
    const mutate = (change: (receipts: AuditReceipt[]) => void) => {
      const receipts = structuredClone(original);
      change(receipts);
      assert.equal(verifyAuditChain(receipts), false);
      return receipts;
    };
    const payload = mutate((receipts) => {
      receipts[0].payload.decision = 'allow';
    });
    assert.equal(verifyReceipt(payload[0], keys.publicKeyHex), false);
    const signature = mutate((receipts) => {
      receipts[0].signature.sig = '00'.repeat(64);
    });
    assert.equal(verifyReceipt(signature[0], keys.publicKeyHex), false);
    mutate((receipts) => {
      receipts[0].previousReceiptHash = '00'.repeat(32);
    });
    mutate((receipts) => receipts.reverse());
  }));

test('recomputing a chain hash cannot make a forged payload signature valid', () =>
  withDevelopmentEnvironment(() => {
    const keys = generateKeyPair();
    const receipts = createDevelopmentReceiptSeeds(keys);
    receipts[0].payload.decision = 'allow';
    const head = receipts[0];
    head.receiptHash = hashReceipt({
      payload: head.payload,
      signature: head.signature,
      previousReceiptHash: head.previousReceiptHash,
    });
    assert.equal(verifyAuditChain(receipts), true);
    assert.equal(verifyReceipt(head, keys.publicKeyHex), false);
  }));

test('seed generation rejects a mismatched trusted public key', () =>
  withDevelopmentEnvironment(() => {
    const signing = generateKeyPair();
    const different = generateKeyPair();
    assert.throws(
      () => createDevelopmentReceiptSeeds({ ...signing, publicKeyHex: different.publicKeyHex }),
      /did not pass signature and chain verification/,
    );
  }));

test('production and configured PostgreSQL cannot generate development seeds', () =>
  withDevelopmentEnvironment(() => {
    const keys = generateKeyPair();
    for (const [name, value] of [
      ['NODE_ENV', 'production'],
      ['FIDUSGATE_RUNTIME', 'production'],
      ['DATABASE_URL', 'postgresql://localhost/example'],
    ] as const) {
      process.env[name] = value;
      assert.throws(
        () => createDevelopmentReceiptSeeds(keys),
        /disabled for production and PostgreSQL/,
      );
      delete process.env[name];
    }
  }));

test('legacy matching permits valid generated timestamps but no altered or extra evidence', () => {
  assert.equal(isLegacyDevelopmentReceiptSeed(legacySeed()), true);
  const cases: unknown[] = [
    null,
    {},
    [],
    legacySeed().slice(1),
    [...legacySeed(), legacySeed()[0]],
    legacySeed().reverse(),
  ];
  const invalidDate = legacySeed();
  invalidDate[0].payload.issued_at = 'invalid';
  cases.push(invalidDate);
  const changedReason = legacySeed();
  changedReason[0].payload.reason = 'Changed by a user';
  cases.push(changedReason);
  const changedSig = legacySeed();
  changedSig[0].signature.sig = '00';
  cases.push(changedSig);
  const extra = legacySeed().map((receipt) => ({ ...receipt, receiptHash: 'unexpected' }));
  cases.push(extra);
  const addedPayload = legacySeed().map((receipt) => ({
    ...receipt,
    payload: { ...receipt.payload, args: { path: 'user.txt' } },
  }));
  cases.push(addedPayload);
  for (const value of cases) assert.equal(isLegacyDevelopmentReceiptSeed(value), false);
});
