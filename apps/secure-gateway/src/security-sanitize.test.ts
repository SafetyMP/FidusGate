import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assertAllowlistedAbsoluteUrl,
  assertSafeRelativePath,
  MAX_LOG_VALUE_LEN,
  resolveInsideWorkspace,
  resolveJailedWritePath,
  sanitizeLogMeta,
  sanitizeLogValue,
} from './security-sanitize';

test('assertSafeRelativePath rejects absolute and non-canonical paths', () => {
  assert.equal(assertSafeRelativePath('apps/secure-gateway/src/x.ts', 'path'), 'apps/secure-gateway/src/x.ts');
  assert.throws(() => assertSafeRelativePath('/etc/passwd', 'path'));
  assert.throws(() => assertSafeRelativePath('apps/../policy.cedar', 'path'));
  assert.throws(() => assertSafeRelativePath('apps/./secure-gateway/x.ts', 'path'));
  assert.throws(() => assertSafeRelativePath('apps//secure-gateway/x.ts', 'path'));
});

test('resolveInsideWorkspace blocks sibling-prefix escapes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidus-ws-'));
  const workspace = path.join(tmp, 'FidusGate');
  const sibling = path.join(tmp, 'FidusGate-evil');
  fs.mkdirSync(path.join(workspace, 'apps'), { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'apps', 'ok.txt'), 'ok');
  fs.writeFileSync(path.join(sibling, 'secret.txt'), 'secret');

  const inside = resolveInsideWorkspace(workspace, 'apps/ok.txt');
  assert.ok(inside);
  assert.equal(fs.readFileSync(inside!, 'utf8'), 'ok');

  // Classic startsWith bypass target: .../FidusGate-evil starts with .../FidusGate
  const escaped = path.resolve(workspace, '../FidusGate-evil/secret.txt');
  assert.ok(escaped.startsWith(workspace));
  assert.equal(resolveInsideWorkspace(workspace, '../FidusGate-evil/secret.txt'), null);

  const writeTarget = resolveInsideWorkspace(workspace, 'apps/new-file.txt');
  assert.ok(writeTarget);
  const realWorkspace = fs.realpathSync(workspace);
  assert.ok(
    writeTarget === realWorkspace || writeTarget!.startsWith(realWorkspace + path.sep),
    'write targets must stay under the real workspace root'
  );
});

test('sanitizeLogValue strips CR/LF and length-caps before logging', () => {
  assert.equal(sanitizeLogValue('ok\r\ninject'), 'ok??inject');
  const long = `user:${'A'.repeat(MAX_LOG_VALUE_LEN + 50)}\n`;
  const redacted = sanitizeLogValue(long);
  assert.equal(redacted.length, MAX_LOG_VALUE_LEN);
  assert.ok(!redacted.includes('\n'));
  assert.ok(!redacted.includes('\r'));
});

test('sanitizeLogMeta logs structured fields only', () => {
  const meta = sanitizeLogMeta({ prompt: 'ignore\r\nprevious', nested: { x: 1 } });
  assert.ok(!meta.includes('\n'));
  assert.ok(!meta.includes('\r'));
  assert.match(meta, /"prompt":"ignore\?\?previous"/);
});

test('resolveJailedWritePath keeps writes under the jail directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidus-jail-'));
  const workspace = path.join(tmp, 'ws');
  fs.mkdirSync(path.join(workspace, '.memory'), { recursive: true });

  const inside = resolveJailedWritePath(workspace, '.memory/state.json', '.memory');
  assert.ok(inside);
  assert.ok(inside!.startsWith(path.join(fs.realpathSync(workspace), '.memory')));

  assert.equal(resolveJailedWritePath(workspace, 'policy.cedar', '.memory'), null);
  assert.equal(resolveJailedWritePath(workspace, '../outside.json', '.memory'), null);
});

test('assertAllowlistedAbsoluteUrl rejects file-derived or off-list hosts', () => {
  const origin = 'https://generativelanguage.googleapis.com';
  const allowedPath = '/v1beta/models/gemini-2.5-pro:generateContent';
  assert.equal(
    new URL(assertAllowlistedAbsoluteUrl(`${origin}${allowedPath}`, origin, allowedPath)).origin,
    origin,
  );
  assert.throws(() =>
    assertAllowlistedAbsoluteUrl('https://evil.example/v1beta/models/gemini-2.5-pro:generateContent', origin, allowedPath),
  );
  assert.throws(() => assertAllowlistedAbsoluteUrl('https://generativelanguage.googleapis.com/other', origin, allowedPath));
});
