process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import {
  allowTsEvaluatorFallback,
  assertProductionPrerequisites,
  isExplicitDemoRuntime,
  isProductionRuntime,
  ProductionPrerequisiteError,
  shouldFailClosedOnDaemonError,
} from './production-profile';

test('production-profile', async (t) => {
  await t.test('detects production markers', () => {
    assert.strictEqual(isProductionRuntime({ FIDUSGATE_RUNTIME: 'production' }), true);
    assert.strictEqual(isProductionRuntime({ NODE_ENV: 'production' }), true);
    assert.strictEqual(isProductionRuntime({ NODE_ENV: 'development' }), false);
  });

  await t.test('DISABLE_AUTH requires explicit demo runtime', () => {
    assert.strictEqual(isExplicitDemoRuntime({ FIDUSGATE_RUNTIME: 'demo' }), true);
    assert.strictEqual(isExplicitDemoRuntime({ NODE_ENV: 'development' }), false);
    assert.strictEqual(
      isExplicitDemoRuntime({ FIDUSGATE_RUNTIME: 'demo', NODE_ENV: 'production' }),
      false
    );
  });

  await t.test('unset defaults deny TS fallback and host/auth bypass flags', () => {
    assert.strictEqual(allowTsEvaluatorFallback({}), false);
    assert.strictEqual(shouldFailClosedOnDaemonError({}), true);
    assert.strictEqual(allowTsEvaluatorFallback({ FIDUSGATE_ALLOW_TS_EVALUATOR_FALLBACK: 'true' }), true);
    assert.strictEqual(
      allowTsEvaluatorFallback({
        FIDUSGATE_ALLOW_TS_EVALUATOR_FALLBACK: 'true',
        NODE_ENV: 'production',
      }),
      false
    );
  });

  await t.test('allows demo without prerequisites', () => {
    assert.doesNotThrow(() => assertProductionPrerequisites({ NODE_ENV: 'development' }));
    assert.doesNotThrow(() => assertProductionPrerequisites({ FIDUSGATE_RUNTIME: 'demo' }));
    assert.throws(
      () =>
        assertProductionPrerequisites({
          FIDUSGATE_RUNTIME: 'production',
          DISABLE_AUTH: 'true',
          DATABASE_URL: 'postgres://x',
          OIDC_ISSUER: 'https://issuer.example',
          OIDC_AUDIENCE: 'fidusgate',
          KMS_PROVIDER: 'local-test-double',
        }),
      ProductionPrerequisiteError
    );
  });

  await t.test('requires OIDC in production', () => {
    assert.throws(
      () =>
        assertProductionPrerequisites({
          FIDUSGATE_RUNTIME: 'production',
          DATABASE_URL: 'postgres://x',
          KMS_PROVIDER: 'aws',
        }),
      /OIDC_ISSUER/
    );
  });

  await t.test('requires CEDAR_DAEMON_TOKEN when daemon URL is set in production', () => {
    assert.throws(
      () =>
        assertProductionPrerequisites({
          FIDUSGATE_RUNTIME: 'production',
          DATABASE_URL: 'postgres://x',
          OIDC_ISSUER: 'https://issuer.example',
          OIDC_AUDIENCE: 'fidusgate',
          KMS_PROVIDER: 'aws',
          CEDAR_DAEMON_URL: 'http://localhost:50051/authorize',
        }),
      /CEDAR_DAEMON_TOKEN/
    );
    assert.doesNotThrow(() =>
      assertProductionPrerequisites({
        FIDUSGATE_RUNTIME: 'production',
        DATABASE_URL: 'postgres://x',
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'fidusgate',
        KMS_PROVIDER: 'aws',
        CEDAR_DAEMON_URL: 'http://localhost:50051/authorize',
        CEDAR_DAEMON_TOKEN: 'test-daemon-token-not-for-production',
      })
    );
  });

  await t.test('forbids TS evaluator fallback flag in production', () => {
    assert.throws(
      () =>
        assertProductionPrerequisites({
          FIDUSGATE_RUNTIME: 'production',
          DATABASE_URL: 'postgres://x',
          OIDC_ISSUER: 'https://issuer.example',
          OIDC_AUDIENCE: 'fidusgate',
          KMS_PROVIDER: 'aws',
          FIDUSGATE_ALLOW_TS_EVALUATOR_FALLBACK: 'true',
        }),
      /FIDUSGATE_ALLOW_TS_EVALUATOR_FALLBACK/
    );
  });
});
