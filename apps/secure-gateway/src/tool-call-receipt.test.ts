process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import { buildToolCallReceiptPayload, toolCallPolicyDigest, toolResultContent } from './tool-call-receipt';

const ISSUED_AT = '2026-10-11T14:00:00.000Z';
const ISSUER_ID = 'sb:issuer:de073ae64e43';

test('allow tools/call receipt payload shape', () => {
  const payload = buildToolCallReceiptPayload({
    toolName: 'execute_command',
    decision: 'allow',
    reason: 'sandbox success',
    issuedAt: ISSUED_AT,
    policyDigest: toolCallPolicyDigest('cedar'),
    issuerId: ISSUER_ID,
  });

  assert.deepEqual(payload, {
    type: 'protectmcp:decision',
    tool_name: 'execute_command',
    decision: 'allow',
    policy_digest: 'cedar',
    issued_at: ISSUED_AT,
    issuer_id: ISSUER_ID,
    reason: 'sandbox success',
  });
});

test('deny tools/call receipt payload shape', () => {
  const payload = buildToolCallReceiptPayload({
    toolName: 'write_file',
    decision: 'deny',
    reason: '  command blocked  ',
    issuedAt: ISSUED_AT,
    policyDigest: toolCallPolicyDigest('cedar', 'forbid-write'),
    issuerId: ISSUER_ID,
  });

  assert.deepEqual(payload, {
    type: 'protectmcp:decision',
    tool_name: 'write_file',
    decision: 'deny',
    policy_digest: 'forbid-write',
    issued_at: ISSUED_AT,
    issuer_id: ISSUER_ID,
    reason: 'command blocked',
  });
  assert.equal(toolCallPolicyDigest('command-audit'), 'command-audit');
  assert.equal(toolCallPolicyDigest('cedar', '   '), 'cedar');
  assert.equal('reason' in buildToolCallReceiptPayload({
    toolName: 'execute_command',
    decision: 'deny',
    issuedAt: ISSUED_AT,
    policyDigest: toolCallPolicyDigest('command-audit'),
    issuerId: ISSUER_ID,
  }), false);
});

test('receipt is a second text block so tool output stays intact', () => {
  const logs = 'hello from sandbox';
  const content = toolResultContent(logs, 'abc123');
  assert.equal(content[0].text, logs);
  assert.equal(content[1].text, 'receipt abc123');
  assert.deepEqual(toolResultContent(logs, undefined), [{ type: 'text', text: logs }]);
});
