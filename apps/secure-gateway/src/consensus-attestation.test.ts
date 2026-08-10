import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildConsensusApprovalPayload,
  loadConsensusRoleKeyStore,
  signConsensusApproval,
  verifyActionApprovals,
  verifyConsensusApproval,
} from './consensus-attestation';

test('consensus attestation sign/verify round-trip and reject forgeries', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidus-consensus-'));
  const keyStore = loadConsensusRoleKeyStore(tmp);

  const payload = buildConsensusApprovalPayload(
    'act_123456',
    'bash scripts/sandbox-execute.sh "npm run test" "."',
    'developer',
    '2026-08-10T00:00:00.000Z',
  );

  const signature = signConsensusApproval(payload, keyStore.getPrivateKey('developer'));
  assert.equal(
    verifyConsensusApproval(payload, signature, keyStore.getPublicKey('developer')),
    true,
    'valid role signature must verify',
  );

  assert.equal(
    verifyConsensusApproval(payload, 'sig_attest_forged', keyStore.getPublicKey('developer')),
    false,
    'dashboard-style mock signatures must be rejected',
  );

  assert.equal(
    verifyConsensusApproval(payload, signature, keyStore.getPublicKey('admin')),
    false,
    'signature must not verify under a different role key',
  );

  const tampered = { ...payload, command: 'rm -rf /' };
  assert.equal(
    verifyConsensusApproval(tampered, signature, keyStore.getPublicKey('developer')),
    false,
    'signature must bind command contents',
  );
});

test('verifyActionApprovals requires every stored approval to be valid', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidus-consensus-'));
  const keyStore = loadConsensusRoleKeyStore(tmp);
  const createdAt = '2026-08-10T00:00:00.000Z';

  const developerPayload = buildConsensusApprovalPayload(
    'act_999',
    'echo hello',
    'developer',
    createdAt,
  );
  const adminPayload = buildConsensusApprovalPayload('act_999', 'echo hello', 'admin', createdAt);

  const action = {
    id: 'act_999',
    command: 'echo hello',
    createdAt,
    approvals: [
      {
        role: 'developer',
        signature: signConsensusApproval(developerPayload, keyStore.getPrivateKey('developer')),
      },
      {
        role: 'admin',
        signature: signConsensusApproval(adminPayload, keyStore.getPrivateKey('admin')),
      },
    ],
  };

  assert.equal(verifyActionApprovals(action, keyStore), true);

  action.approvals[1].signature = '00'.repeat(64);
  assert.equal(verifyActionApprovals(action, keyStore), false);
});
