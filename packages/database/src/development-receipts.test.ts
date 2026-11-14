import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import type { AuditReceipt } from '@fidusgate/core-types';
import type { FidusGateDatabase } from './index';

const localRequire = createRequire(__filename);
const environmentNames = [
  'NODE_ENV',
  'FIDUSGATE_RUNTIME',
  'DATABASE_URL',
  'FIDUSGATE_ALLOW_JSON_FALLBACK',
] as const;

type Store = {
  db: FidusGateDatabase;
  newDatabase: () => FidusGateDatabase;
  file: string;
  dataDir: string;
};
async function withStore(
  initial: string | undefined,
  run: (store: Store) => Promise<void> | void,
): Promise<void> {
  const prior = environmentNames.map((name) => [name, process.env[name]] as const);
  const root = mkdtempSync(path.join(tmpdir(), 'fidusgate-receipt-store-test-'));
  const modulePath = path.join(root, 'dist', 'index.js');
  const dataDir = path.join(root, 'data');
  const file = path.join(dataDir, 'receipts.json');
  try {
    for (const name of environmentNames) delete process.env[name];
    process.env.NODE_ENV = 'test';
    mkdirSync(path.dirname(modulePath), { recursive: true });
    copyFileSync(path.join(__dirname, 'index.js'), modulePath);
    // Only dependencies are shared; the loaded module's data dir is disposable.
    symlinkSync(
      path.resolve(__dirname, '../../../node_modules'),
      path.join(root, 'node_modules'),
      'dir',
    );
    if (initial !== undefined) {
      mkdirSync(dataDir);
      writeFileSync(file, initial);
    }
    const isolated = localRequire(modulePath) as typeof import('./index');
    const newDatabase = () => new isolated.FidusGateDatabase();
    await run({ db: newDatabase(), newDatabase, file, dataDir });
  } finally {
    delete localRequire.cache[modulePath];
    rmSync(root, { recursive: true, force: true });
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function signedExample(tool = 'read_file') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const payload: AuditReceipt['payload'] = {
    type: 'fidusgate:development-example',
    tool_name: tool,
    decision: 'allow',
    policy_digest: 'test-scenario-digest',
    issued_at: '2026-11-14T12:00:00.000Z',
    issuer_id: 'test:issuer',
    reason: 'Synthetic persistence fixture; no tool ran.',
  };
  const signature: AuditReceipt['signature'] = {
    alg: 'EdDSA',
    kid: 'test:issuer',
    sig: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('hex'),
  };
  const previousReceiptHash = '';
  const receiptHash = createHash('sha256')
    .update(JSON.stringify({ payload, signature, previousReceiptHash }))
    .digest('hex');
  return {
    receipt: { payload, signature, previousReceiptHash, receiptHash } satisfies AuditReceipt,
    publicKey,
  };
}

test('fresh receipt file is seeded once; restart preserves its exact signed bytes', async () =>
  withStore(undefined, async ({ db, newDatabase, file }) => {
    const { receipt, publicKey } = signedExample();
    let calls = 0;
    db.initializeDevelopmentReceipts(() => {
      calls++;
      return [receipt];
    });
    const original = readFileSync(file);
    db.initializeDevelopmentReceipts(() => {
      throw new Error('Must not reseed');
    });
    newDatabase().initializeDevelopmentReceipts(() => {
      throw new Error('Must not reseed on restart');
    });
    assert.equal(calls, 1);
    assert.deepEqual(readFileSync(file), original);
    const saved = await db.getAuditReceipts();
    assert.deepEqual(saved, [receipt]);
    assert.equal(
      verify(
        null,
        Buffer.from(JSON.stringify(saved[0].payload)),
        publicKey,
        Buffer.from(saved[0].signature.sig, 'hex'),
      ),
      true,
    );
  }));

test('pre-existing empty and nonempty receipt logs remain byte-identical', async () => {
  for (const original of ['[  ]\n', `${JSON.stringify([signedExample().receipt], null, 4)}\n`]) {
    await withStore(original, ({ db, file }) => {
      db.initializeDevelopmentReceipts(() => {
        throw new Error('Must not seed existing logs');
      });
      assert.equal(readFileSync(file, 'utf8'), original);
    });
  }
});

test('initialization preserves an append made after construction', async () =>
  withStore(undefined, async ({ db, file }) => {
    const { receipt } = signedExample();
    await db.addAuditReceipt(receipt);
    const original = readFileSync(file);
    db.initializeDevelopmentReceipts(() => {
      throw new Error('Must not overwrite concurrent record');
    });
    assert.deepEqual(readFileSync(file), original);
  }));

test('append links to the seed head without changing its payload or signature', async () =>
  withStore(undefined, async ({ db }) => {
    const seed = signedExample().receipt;
    db.initializeDevelopmentReceipts(() => [seed]);
    const added = signedExample('list_directory').receipt;
    await db.addAuditReceipt(added);
    const saved = await db.getAuditReceipts();
    assert.equal(saved.length, 2);
    assert.deepEqual(saved[1], seed);
    assert.deepEqual(saved[0].payload, added.payload);
    assert.deepEqual(saved[0].signature, added.signature);
    assert.equal(saved[0].previousReceiptHash, seed.receiptHash);
    assert.equal(
      saved[0].receiptHash,
      createHash('sha256')
        .update(
          JSON.stringify({
            payload: added.payload,
            signature: added.signature,
            previousReceiptHash: seed.receiptHash,
          }),
        )
        .digest('hex'),
    );
  }));

test('explicit legacy repair preserves original bytes in a backup and leaves other stores alone', async () => {
  const legacy = [{ legacyPlaceholder: 'fixture recognized by the caller' }];
  const original = `${JSON.stringify(legacy, null, 4)}\n`;
  await withStore(original, async ({ db, file, dataDir }) => {
    const transactionFile = path.join(dataDir, 'transactions.json');
    const priorTransactions = readFileSync(transactionFile);
    const replacement = signedExample().receipt;
    const backup = db.repairLegacyDevelopmentReceipts(
      (value) => isDeepStrictEqual(value, legacy),
      () => [replacement],
    );
    assert.equal(readFileSync(backup, 'utf8'), original);
    assert.deepEqual(await db.getAuditReceipts(), [replacement]);
    assert.deepEqual(readFileSync(transactionFile), priorTransactions);
    assert.equal(existsSync(`${file}.lock`), false);
    assert.throws(
      () =>
        db.repairLegacyDevelopmentReceipts(
          (value) => isDeepStrictEqual(value, legacy),
          () => [],
        ),
      /not the exact legacy seed/,
    );
  });
});

test('refused or malformed repair preserves bytes and does not call the signer or create a backup', async () => {
  for (const original of ['{bad json', '[{"user":"record"}]', '[]', '{}']) {
    await withStore(original, ({ db, file, dataDir }) => {
      assert.throws(() =>
        db.repairLegacyDevelopmentReceipts(
          () => false,
          () => {
            throw new Error('Signer must not run');
          },
        ),
      );
      assert.equal(readFileSync(file, 'utf8'), original);
      assert.equal(
        readdirSync(dataDir).some((name) => name.includes('.bak')),
        false,
      );
      assert.equal(existsSync(`${file}.lock`), false);
    });
  }
});

test('signing failure leaves the old log untouched and releases the lock', async () =>
  withStore('[{"legacy":true}]', ({ db, file, dataDir }) => {
    const prior = readFileSync(file);
    assert.throws(
      () =>
        db.repairLegacyDevelopmentReceipts(
          () => true,
          () => {
            throw new Error('Signing unavailable');
          },
        ),
      /Signing unavailable/,
    );
    assert.deepEqual(readFileSync(file), prior);
    assert.equal(
      readdirSync(dataDir).some((name) => name.includes('.bak')),
      false,
    );
    assert.equal(existsSync(`${file}.lock`), false);
  }));

test('corrupt or missing receipt files surface errors rather than replacement evidence', async () =>
  withStore(undefined, async ({ db, file }) => {
    for (const bad of ['{invalid', '{}']) {
      writeFileSync(file, bad);
      await assert.rejects(db.getAuditReceipts());
      assert.equal(readFileSync(file, 'utf8'), bad);
    }
    unlinkSync(file);
    await assert.rejects(db.getAuditReceipts());
    assert.equal(existsSync(file), false);
  }));

test('explicit reset stores supplied signed seeds', async () =>
  withStore(undefined, async ({ db }) => {
    const { receipt, publicKey } = signedExample();
    await db.clearDatabase([receipt]);
    const saved = await db.getAuditReceipts();
    assert.deepEqual(saved, [receipt]);
    assert.equal(
      verify(
        null,
        Buffer.from(JSON.stringify(saved[0].payload)),
        publicKey,
        Buffer.from(saved[0].signature.sig, 'hex'),
      ),
      true,
    );
  }));

test('development initialization, repair, and seeded reset reject production and PostgreSQL', async () =>
  withStore(undefined, async ({ db, file }) => {
    const before = readFileSync(file);
    for (const [name, value] of [
      ['NODE_ENV', 'production'],
      ['FIDUSGATE_RUNTIME', 'production'],
      ['DATABASE_URL', 'postgresql://localhost/example'],
    ] as const) {
      process.env[name] = value;
      assert.throws(() => db.initializeDevelopmentReceipts(() => [signedExample().receipt]));
      assert.throws(() =>
        db.repairLegacyDevelopmentReceipts(
          () => true,
          () => [signedExample().receipt],
        ),
      );
      await assert.rejects(db.clearDatabase([signedExample().receipt]));
      assert.deepEqual(readFileSync(file), before);
      delete process.env[name];
    }
  }));

test('a second database instance can initialize the newly-created receipt store only once', async () =>
  withStore(undefined, async ({ db, newDatabase }) => {
    const second = newDatabase();
    const receipt = signedExample().receipt;
    second.initializeDevelopmentReceipts(() => [receipt]);
    db.initializeDevelopmentReceipts(() => {
      throw new Error('Creation ownership already consumed');
    });
    assert.deepEqual(await db.getAuditReceipts(), [receipt]);
  }));

test('a replaced empty file is preserved instead of treating it as newly created', async () =>
  withStore(undefined, ({ db, file }) => {
    const replacement = `${file}.replacement`;
    writeFileSync(replacement, '[  ]\n');
    renameSync(replacement, file);
    db.initializeDevelopmentReceipts(() => {
      throw new Error('Must not seed a replaced file');
    });
    assert.equal(readFileSync(file, 'utf8'), '[  ]\n');
  }));
