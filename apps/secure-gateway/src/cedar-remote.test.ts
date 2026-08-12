process.env.FIDUSGATE_TEST = 'true';
import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { boundedCommandLine, daemonFailureMustDeny } from './cedar-remote';
import { MAX_COMMAND_LINE_LENGTH } from './command-auditor';

test('daemonFailureMustDeny follows production + CEDAR_DAEMON_URL', () => {
  assert.equal(
    daemonFailureMustDeny({
      FIDUSGATE_RUNTIME: 'production',
      CEDAR_DAEMON_URL: 'http://localhost:50051/authorize',
    }),
    true
  );
  assert.equal(
    daemonFailureMustDeny({ NODE_ENV: 'development', CEDAR_DAEMON_URL: 'http://localhost:50051/authorize' }),
    false
  );
});

test('boundedCommandLine uses the command-auditor length cap', () => {
  const long = 'a'.repeat(MAX_COMMAND_LINE_LENGTH + 50);
  assert.equal(boundedCommandLine(long).length, MAX_COMMAND_LINE_LENGTH);
});

test('gateway and MCP call sites fail closed on daemon errors', () => {
  const indexSrc = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
  const mcpSrc = fs.readFileSync(path.resolve(__dirname, '../src/mcp-server.ts'), 'utf8');
  assert.match(indexSrc, /shouldFailClosedOnDaemonError\(/);
  assert.match(indexSrc, /daemonFailureMustDeny\(/);
  assert.match(mcpSrc, /queryCedarDaemon\(/);
  assert.match(mcpSrc, /daemonFailureMustDeny\(/);
});
