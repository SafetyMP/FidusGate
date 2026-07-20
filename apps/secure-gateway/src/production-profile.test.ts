process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import {
  assertProductionPrerequisites,
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

  await t.test('allows demo without prerequisites', () => {
    assert.doesNotThrow(() => assertProductionPrerequisites({ NODE_ENV: 'development' }));
  });

  await t.test('denies DISABLE_AUTH in production', () => {
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

  await t.test('fail-closed cedar daemon when configured in production', () => {
    assert.strictEqual(
      shouldFailClosedOnDaemonError({
        FIDUSGATE_RUNTIME: 'production',
        CEDAR_DAEMON_URL: 'http://localhost:50051/authorize',
      }),
      true
    );
    assert.strictEqual(
      shouldFailClosedOnDaemonError({ NODE_ENV: 'development', CEDAR_DAEMON_URL: 'http://localhost:50051/authorize' }),
      false
    );
  });
});
