import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateKeyPair, type KeyPair } from '@fidusgate/crypto-utils';

export const CONSENSUS_ROLES = ['admin', 'developer', 'auditor'] as const;
export type ConsensusRole = (typeof CONSENSUS_ROLES)[number];

export interface ConsensusApprovalPayload {
  type: 'consensus:approval';
  actionId: string;
  command: string;
  role: ConsensusRole;
  issued_at: string;
}

export interface ConsensusRoleKeyStore {
  getPublicKey(role: ConsensusRole): string;
  getPrivateKey(role: ConsensusRole): string;
  publicKeys(): Record<ConsensusRole, string>;
}

export function isConsensusRole(value: unknown): value is ConsensusRole {
  return typeof value === 'string' && (CONSENSUS_ROLES as readonly string[]).includes(value);
}

export function toIsoTimestamp(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid consensus issued_at timestamp');
  }
  return parsed.toISOString();
}

export function buildConsensusApprovalPayload(
  actionId: string,
  command: string,
  role: ConsensusRole,
  issuedAt: string | Date,
): ConsensusApprovalPayload {
  return {
    type: 'consensus:approval',
    actionId,
    command,
    role,
    issued_at: toIsoTimestamp(issuedAt),
  };
}

function canonicalPayloadBytes(payload: ConsensusApprovalPayload): Buffer {
  // Fixed key order for stable signatures across runtimes.
  return Buffer.from(
    JSON.stringify({
      type: payload.type,
      actionId: payload.actionId,
      command: payload.command,
      role: payload.role,
      issued_at: payload.issued_at,
    }),
  );
}

export function signConsensusApproval(payload: ConsensusApprovalPayload, privateKeyHex: string): string {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  return crypto.sign(null, canonicalPayloadBytes(payload), privateKey).toString('hex');
}

export function verifyConsensusApproval(
  payload: ConsensusApprovalPayload,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  if (typeof signatureHex !== 'string' || !/^[0-9a-fA-F]+$/.test(signatureHex) || signatureHex.length < 64) {
    return false;
  }
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyHex, 'hex'),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, canonicalPayloadBytes(payload), publicKey, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export function verifyActionApprovals(
  action: {
    id: string;
    command: string;
    createdAt: string | Date;
    approvals: Array<{ role: string; signature: string }>;
  },
  keyStore: ConsensusRoleKeyStore,
): boolean {
  if (!Array.isArray(action.approvals) || action.approvals.length === 0) {
    return false;
  }
  for (const approval of action.approvals) {
    if (!isConsensusRole(approval.role)) {
      return false;
    }
    const payload = buildConsensusApprovalPayload(
      action.id,
      action.command,
      approval.role,
      action.createdAt,
    );
    if (!verifyConsensusApproval(payload, approval.signature, keyStore.getPublicKey(approval.role))) {
      return false;
    }
  }
  return true;
}

type RoleKeyFile = Record<ConsensusRole, KeyPair>;

function isKeyPair(value: unknown): value is KeyPair {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.publicKeyHex === 'string' && typeof v.privateKeyHex === 'string';
}

/**
 * Load or create real Ed25519 role keypairs for consensus attestation.
 * Replaces the previous hardcoded non-keypair hex placeholders.
 */
export function loadConsensusRoleKeyStore(dataDir: string): ConsensusRoleKeyStore {
  const keysPath = path.join(dataDir, 'consensus-role-keys.json');
  let keys: RoleKeyFile | null = null;

  try {
    const parsed = JSON.parse(fs.readFileSync(keysPath, 'utf8')) as Partial<RoleKeyFile>;
    if (
      isKeyPair(parsed.admin) &&
      isKeyPair(parsed.developer) &&
      isKeyPair(parsed.auditor)
    ) {
      keys = {
        admin: parsed.admin,
        developer: parsed.developer,
        auditor: parsed.auditor,
      };
    }
  } catch (err: any) {
    if (err && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      console.warn(`[consensus-attestation] Failed to read role keys: ${err.message}`);
    }
  }

  if (!keys) {
    keys = {
      admin: generateKeyPair(),
      developer: generateKeyPair(),
      auditor: generateKeyPair(),
    };
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tempPath = `${keysPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(keys, null, 2), { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(tempPath, keysPath);
    } catch (err: any) {
      console.warn(`[consensus-attestation] Failed to persist role keys: ${err?.message || err}`);
    }
  }

  const store = keys;
  return {
    getPublicKey(role: ConsensusRole): string {
      return store[role].publicKeyHex;
    },
    getPrivateKey(role: ConsensusRole): string {
      return store[role].privateKeyHex;
    },
    publicKeys(): Record<ConsensusRole, string> {
      return {
        admin: store.admin.publicKeyHex,
        developer: store.developer.publicKeyHex,
        auditor: store.auditor.publicKeyHex,
      };
    },
  };
}
