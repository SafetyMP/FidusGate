import assert from 'node:assert';
import test from 'node:test';
import { FidusGateDatabase } from './index';

test('production persistence fails closed before JSON initialization', () => {
  const priorNodeEnv = process.env.NODE_ENV;
  const priorRuntime = process.env.FIDUSGATE_RUNTIME;
  const priorDatabaseUrl = process.env.DATABASE_URL;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.FIDUSGATE_RUNTIME;
    delete process.env.DATABASE_URL;

    assert.throws(() => new FidusGateDatabase(), /DATABASE_URL is required in production/);

    process.env.DATABASE_URL = 'file:///tmp/fidusgate.json';
    assert.throws(() => new FidusGateDatabase(), /postgres or postgresql scheme/);
  } finally {
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
    if (priorRuntime === undefined) delete process.env.FIDUSGATE_RUNTIME;
    else process.env.FIDUSGATE_RUNTIME = priorRuntime;
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
  }
});
