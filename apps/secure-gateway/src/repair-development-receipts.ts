import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FidusGateDatabase } from '@fidusgate/database';
import {
  createDevelopmentReceiptSeeds,
  isLegacyDevelopmentReceiptSeed,
} from './development-receipts';

// Explicit offline maintenance command. Stop the gateway first. It never adds a
// verification exception or rewrites anything except the exact legacy seed set.
export function repairDevelopmentReceiptSeeds(): string {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.FIDUSGATE_RUNTIME === 'production' ||
    process.env.DATABASE_URL
  ) {
    throw new Error('Receipt seed repair is restricted to the development JSON store.');
  }
  let keys: unknown;
  if (process.env.MASTER_PRIVATE_KEY_HEX || process.env.MASTER_PUBLIC_KEY_HEX) {
    keys = {
      privateKeyHex: process.env.MASTER_PRIVATE_KEY_HEX,
      publicKeyHex: process.env.MASTER_PUBLIC_KEY_HEX,
    };
  } else {
    // Same configured/cached key selection as gateway startup; never rotate keys.
    keys = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/database/data/test-keys.json'), 'utf8'),
    );
  }
  if (
    !keys ||
    typeof keys !== 'object' ||
    !('privateKeyHex' in keys) ||
    !('publicKeyHex' in keys) ||
    typeof keys.privateKeyHex !== 'string' ||
    typeof keys.publicKeyHex !== 'string'
  ) {
    throw new Error('A complete existing gateway signing keypair is required.');
  }
  const signingKeys = { privateKeyHex: keys.privateKeyHex, publicKeyHex: keys.publicKeyHex };
  return new FidusGateDatabase().repairLegacyDevelopmentReceipts(
    isLegacyDevelopmentReceiptSeed,
    () => createDevelopmentReceiptSeeds(signingKeys),
  );
}

if (require.main === module) {
  try {
    const backup = repairDevelopmentReceiptSeeds();
    console.log(
      `Replaced only the legacy development seed receipts. Original bytes backed up at ${backup}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Receipt seed repair failed.');
    process.exitCode = 1;
  }
}
