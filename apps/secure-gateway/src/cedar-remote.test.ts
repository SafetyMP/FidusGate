process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { boundedCommandLine, daemonFailureMustDeny, queryCedarDaemon } from './cedar-remote';
import { MAX_COMMAND_LINE_LENGTH } from './command-auditor';

test('daemonFailureMustDeny defaults true; TS fallback is explicit opt-in', () => {
  assert.equal(
    daemonFailureMustDeny({
      FIDUSGATE_RUNTIME: 'production',
      CEDAR_DAEMON_URL: 'http://localhost:50051/authorize',
    }),
    true
  );
  assert.equal(
    daemonFailureMustDeny({ NODE_ENV: 'development', CEDAR_DAEMON_URL: 'http://localhost:50051/authorize' }),
    true
  );
  assert.equal(
    daemonFailureMustDeny({ FIDUSGATE_ALLOW_TS_EVALUATOR_FALLBACK: 'true', NODE_ENV: 'development' }),
    false
  );
});

test('unsafe cedar daemon URL fails closed without localhost rewrite', async () => {
  const result = await queryCedarDaemon(
    { principal: 'p', action: 'a', context: {} },
    { CEDAR_DAEMON_URL: 'http://evil.example/authorize' },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /CEDAR_DAEMON_URL|Invalid/);
  }
});

test('boundedCommandLine uses the command-auditor length cap', () => {
  const long = 'a'.repeat(MAX_COMMAND_LINE_LENGTH + 50);
  assert.equal(boundedCommandLine(long).length, MAX_COMMAND_LINE_LENGTH);
});

test('gateway and MCP call sites share resolveCedarDecision', () => {
  const indexSrc = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
  const mcpSrc = fs.readFileSync(path.resolve(__dirname, '../src/mcp-server.ts'), 'utf8');
  assert.match(indexSrc, /resolveCedarDecision\(/);
  assert.match(mcpSrc, /resolveCedarDecision\(/);
});
