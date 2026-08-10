import assert from 'node:assert';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assertProductionAuthConfiguration,
  resolveJwtSecret,
  verifyLegacyBearerAuthorization,
} from './production-auth';

test('production markers fail closed for demo authentication', (t) => {
  const productionOidc = {
    NODE_ENV: 'production',
    FIDUSGATE_OIDC_ISSUER: 'https://issuer.example.test',
    FIDUSGATE_OIDC_AUDIENCE: 'fidusgate-mcp',
    FIDUSGATE_JWKS_URL: 'https://issuer.example.test/jwks',
  };

  t.test('rejects DISABLE_AUTH under either production marker', () => {
    assert.throws(
      () =>
        assertProductionAuthConfiguration({
          ...productionOidc,
          FIDUSGATE_RUNTIME: 'production',
          DISABLE_AUTH: 'true',
        }),
      /DISABLE_AUTH=true/
    );
  });

  t.test('rejects HS256 bootstrap configuration', () => {
    assert.throws(
      () => assertProductionAuthConfiguration({ ...productionOidc, JWT_SECRET: 'legacy-secret' }),
      /legacy HS256 verifier/
    );
    assert.throws(
      () => assertProductionAuthConfiguration({ ...productionOidc, FIDUSGATE_BOOTSTRAP_KEY: 'bootstrap' }),
      /legacy token minter/
    );
  });

  t.test('rejects incomplete OIDC/JWKS configuration', () => {
    assert.throws(
      () => assertProductionAuthConfiguration({ NODE_ENV: 'production' }),
      /missing required OIDC\/JWKS configuration/
    );
  });
});

test('resolveJwtSecret never returns the well-known hardcoded default', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidus-jwt-'));
  assert.throws(
    () => resolveJwtSecret({ JWT_SECRET: 'fidusgate-dev-jwt-secret-local-only' }, { dataDir: tmp }),
    /well-known insecure default/
  );
  assert.throws(
    () => resolveJwtSecret({ JWT_SECRET: 'short' }, { dataDir: tmp }),
    /at least 32 characters/
  );

  const generated = resolveJwtSecret({}, { dataDir: tmp });
  assert.ok(generated.length >= 32);
  assert.notEqual(generated, 'fidusgate-dev-jwt-secret-local-only');
  const again = resolveJwtSecret({}, { dataDir: tmp });
  assert.equal(again, generated, 'per-checkout secret should be stable across restarts');

  const explicit = 'a'.repeat(32);
  assert.equal(resolveJwtSecret({ JWT_SECRET: explicit }, { dataDir: tmp }), explicit);
});

test('MCP and WebSocket legacy bearer checks deny unauthenticated and wrong-audience callers', () => {
  const secret = 'test-secret-with-enough-length-32b';
  const common = {
    algorithm: 'HS256' as const,
    expiresIn: 300,
    subject: 'usr_test',
  };
  const mcpToken = jwt.sign(
    { email: 'developer@example.test', role: 'developer' },
    secret,
    { ...common, audience: 'fidusgate-mcp' }
  );
  const wrongAudience = jwt.sign(
    { email: 'developer@example.test', role: 'developer' },
    secret,
    { ...common, audience: 'another-service' }
  );

  assert.throws(
    () => verifyLegacyBearerAuthorization(undefined, secret, 'fidusgate-mcp'),
    /Missing bearer authorization/
  );
  assert.throws(
    () => verifyLegacyBearerAuthorization(`Bearer ${wrongAudience}`, secret, 'fidusgate-mcp'),
    /jwt audience invalid/
  );
  assert.deepStrictEqual(
    verifyLegacyBearerAuthorization(`Bearer ${mcpToken}`, secret, 'fidusgate-mcp'),
    { id: 'usr_test', role: 'developer', email: 'developer@example.test' }
  );
});
