process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import {
  policyCodePassesSafetyChecks,
  verifyAuthorizePrincipalSignature,
} from './principal-signature';

test('unsigned and unknown principals fail closed (FO-004)', () => {
  assert.equal(
    verifyAuthorizePrincipalSignature('mcp-agent@fidusgate.internal', 'read_file', {}, 'deadbeef'),
    false,
  );
  assert.equal(verifyAuthorizePrincipalSignature('', 'read_file', {}, 'deadbeef'), false);
  assert.equal(
    verifyAuthorizePrincipalSignature('sb:issuer:pm-sme', 'read_file', { path: 'a.ts' }, undefined),
    false,
  );
  assert.equal(
    verifyAuthorizePrincipalSignature('sb:issuer:unknown-sme', 'read_file', {}, 'ab'),
    false,
  );
});

test('policy apply rejects String.contains fail-open (FO-006)', () => {
  const bad = `permit(principal, action == Action::"call_tool", resource);\nforbid(principal, action == Action::"call_tool", resource) when { resource.args.path.contains(".env") };`;
  const result = policyCodePassesSafetyChecks(bad);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /contains/);
  }
  const commented = `// resource.args.path.contains(".env")\npermit(principal, action == Action::"call_tool", resource);`;
  assert.equal(policyCodePassesSafetyChecks(commented).ok, true);
});
