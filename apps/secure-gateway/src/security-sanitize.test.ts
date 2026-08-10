import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertSafeRelativePath, resolveInsideWorkspace } from './security-sanitize';

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
