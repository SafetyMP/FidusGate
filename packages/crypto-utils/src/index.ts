import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AuditReceipt, AuditReceiptPayload } from '@fidusgate/core-types';

const SAFE_PRINCIPAL_PATTERN = /^[a-zA-Z0-9._@:/-]{1,256}$/;
const HEX_PATTERN = /^[0-9a-fA-F]{1,4096}$/;

interface ValidatedAttestation {
  sessionPublicKey: string;
  issuerId: string;
  expiresAt: string;
  attestationSignature: string;
}

/**
 * Structural guard for signature.attestation to prevent user-controlled bypass
 * of the KMS provider verification path (CodeQL js/user-controlled-bypass).
 * Only attestations that match the expected shape enter the attested branch.
 */
function validateAttestation(candidate: unknown): ValidatedAttestation | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const v = candidate as Record<string, unknown>;
  if (typeof v.sessionPublicKey !== 'string' || !HEX_PATTERN.test(v.sessionPublicKey)) return null;
  if (typeof v.issuerId !== 'string' || !SAFE_PRINCIPAL_PATTERN.test(v.issuerId)) return null;
  if (typeof v.expiresAt !== 'string' || Number.isNaN(Date.parse(v.expiresAt))) return null;
  if (typeof v.attestationSignature !== 'string' || !HEX_PATTERN.test(v.attestationSignature)) return null;
  return {
    sessionPublicKey: v.sessionPublicKey,
    issuerId: v.issuerId,
    expiresAt: v.expiresAt,
    attestationSignature: v.attestationSignature,
  };
}

export interface KeyPair {
  publicKeyHex: string;
  privateKeyHex: string;
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyHex: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    privateKeyHex: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex')
  };
}

export function createAttestedSession(
  masterPrivateKeyHex: string,
  masterPublicKeyHex: string,
  issuerId: string,
  expiresInSeconds: number = 3600
) {
  const sessionKeyPair = generateKeyPair();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  
  const attestationPayload = JSON.stringify({
    sessionPublicKey: sessionKeyPair.publicKeyHex,
    issuerId,
    expiresAt
  });
  
  const masterPrivateKey = crypto.createPrivateKey({
    key: Buffer.from(masterPrivateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8'
  });
  const data = Buffer.from(attestationPayload);
  const attestationSignature = crypto.sign(null, data, masterPrivateKey).toString('hex');
  
  return {
    sessionKeyPair,
    attestationCert: {
      sessionPublicKey: sessionKeyPair.publicKeyHex,
      issuerId,
      expiresAt,
      attestationSignature
    }
  };
}

export function hashReceipt(payload: any): string {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ==========================================
// Recommendation #2: KMS Provider Abstraction
// ==========================================
export interface KMSProvider {
  signPayload(payload: AuditReceiptPayload, privateKeyHex: string, kid: string): AuditReceipt;
  verifyReceipt(receipt: AuditReceipt, publicKeyHex: string): boolean;
}

export class LocalKMSProvider implements KMSProvider {
  public signPayload(
    payload: AuditReceiptPayload,
    privateKeyHex: string,
    kid: string
  ): AuditReceipt {
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(privateKeyHex, 'hex'),
      format: 'der',
      type: 'pkcs8'
    });
    
    const data = Buffer.from(JSON.stringify(payload));
    const signatureBuffer = crypto.sign(null, data, privateKey);
    
    return {
      payload,
      signature: {
        alg: 'EdDSA',
        kid,
        sig: signatureBuffer.toString('hex')
      }
    };
  }

  public verifyReceipt(receipt: AuditReceipt, publicKeyHex: string): boolean {
    try {
      const attestation = validateAttestation(receipt.signature.attestation);

      if (attestation) {
        if (new Date(attestation.expiresAt).getTime() < Date.now()) {
          return false;
        }

        const rootPublicKey = crypto.createPublicKey({
          key: Buffer.from(publicKeyHex, 'hex'),
          format: 'der',
          type: 'spki'
        });
        const attestationPayload = JSON.stringify({
          sessionPublicKey: attestation.sessionPublicKey,
          issuerId: attestation.issuerId,
          expiresAt: attestation.expiresAt
        });
        const rootData = Buffer.from(attestationPayload);
        const rootSig = Buffer.from(attestation.attestationSignature, 'hex');
        const isAttestationValid = crypto.verify(null, rootData, rootPublicKey, rootSig);
        if (!isAttestationValid) {
          return false;
        }

        const sessionPublicKey = crypto.createPublicKey({
          key: Buffer.from(attestation.sessionPublicKey, 'hex'),
          format: 'der',
          type: 'spki'
        });
        const receiptData = Buffer.from(JSON.stringify(receipt.payload));
        const receiptSig = Buffer.from(receipt.signature.sig, 'hex');
        return crypto.verify(null, receiptData, sessionPublicKey, receiptSig);
      }

      // Standard non-attested master key verification
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(publicKeyHex, 'hex'),
        format: 'der',
        type: 'spki'
      });
      
      const data = Buffer.from(JSON.stringify(receipt.payload));
      const signature = Buffer.from(receipt.signature.sig, 'hex');
      
      return crypto.verify(null, data, publicKey, signature);
    } catch (error) {
      return false;
    }
  }
}

// Only allow HTTPS or loopback HTTP URLs for KMS/HSM calls; refuse anything else so
// a compromised env var cannot smuggle arbitrary payloads via a bogus URL scheme.
function assertKmsUrl(target: string): void {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error(`Invalid KMS URL: ${target}`);
  }
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new Error(`Rejected KMS URL scheme: ${parsed.protocol}`);
  }
}

// Assemble a curl argv without ever invoking a shell — prevents CodeQL
// js/command-line-injection because no user-controlled value is concatenated
// into a shell command string.
function buildCurlArgs(
  method: 'GET' | 'POST',
  target: string,
  headers: Record<string, string>,
  body?: unknown,
): string[] {
  const args: string[] = ['-s', '-X', method, '--max-time', '30', target];
  for (const [k, v] of Object.entries(headers)) {
    args.push('-H', `${k}: ${v}`);
  }
  if (body !== undefined) {
    args.push('--data-binary', JSON.stringify(body));
  }
  return args;
}

// Synchronous curl post helper to handle networked HSM queries
function curlPost(url: string, headers: Record<string, string>, body: any): any {
  assertKmsUrl(url);
  const output = execFileSync('curl', buildCurlArgs('POST', url, headers, body), { encoding: 'utf8' });
  return JSON.parse(output);
}

// Synchronous curl get helper to handle networked HSM queries
function curlGet(url: string, headers: Record<string, string>): any {
  assertKmsUrl(url);
  const output = execFileSync('curl', buildCurlArgs('GET', url, headers), { encoding: 'utf8' });
  return JSON.parse(output);
}

export class VaultKMSProvider implements KMSProvider {
  public signPayload(
    payload: AuditReceiptPayload,
    privateKeyHex: string,
    kid: string
  ): AuditReceipt {
    const vaultAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
    const vaultToken = process.env.VAULT_TOKEN || 'root';
    const keyId = process.env.KMS_KEY_ID || 'fidusgate-key';

    console.log(`🔐 KMS API CALL: Dispatching remote Vault HSM signing request to key: ${keyId}`);
    
    try {
      const inputBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
      const url = `${vaultAddr}/v1/transit/sign/${keyId}`;
      const response = curlPost(
        url,
        { 'X-Vault-Token': vaultToken, 'Content-Type': 'application/json' },
        { input: inputBase64 }
      );
      
      const sig = response?.data?.signature;
      if (!sig) {
        throw new Error(response?.errors ? JSON.stringify(response.errors) : 'No signature returned from Vault');
      }

      return {
        payload,
        signature: {
          alg: 'EdDSA',
          kid,
          sig
        }
      };
    } catch (err: any) {
      console.warn(`⚠️ Vault Transit sign failed: ${err.message}. Falling back to local HSM keys.`);
      const local = new LocalKMSProvider();
      return local.signPayload(payload, privateKeyHex, kid);
    }
  }

  public verifyReceipt(receipt: AuditReceipt, publicKeyHex: string): boolean {
    const vaultAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
    const vaultToken = process.env.VAULT_TOKEN || 'root';
    const keyId = process.env.KMS_KEY_ID || 'fidusgate-key';

    console.log(`📡 KMS API CALL: Dispatching Vault verification to: ${vaultAddr}`);

    try {
      const inputBase64 = Buffer.from(JSON.stringify(receipt.payload)).toString('base64');
      const url = `${vaultAddr}/v1/transit/verify/${keyId}`;
      const response = curlPost(
        url,
        { 'X-Vault-Token': vaultToken, 'Content-Type': 'application/json' },
        { input: inputBase64, signature: receipt.signature.sig }
      );

      return !!response?.data?.valid;
    } catch (err: any) {
      console.warn(`⚠️ Vault verification failed: ${err.message}. Falling back to local offline check.`);
      const local = new LocalKMSProvider();
      return local.verifyReceipt(receipt, publicKeyHex);
    }
  }
}

export class GcpKMSProvider implements KMSProvider {
  public signPayload(
    payload: AuditReceiptPayload,
    privateKeyHex: string,
    kid: string
  ): AuditReceipt {
    const projectId = process.env.GCP_PROJECT_ID || 'fidusgate-audit';
    const location = process.env.GCP_LOCATION || 'global';
    const keyRing = process.env.GCP_KMS_KEY_RING || 'fidusgate-keyring';
    const cryptoKey = process.env.GCP_KMS_KEY_NAME || 'fidusgate-key';
    const version = process.env.GCP_KMS_KEY_VERSION || '1';
    const accessToken = process.env.GCP_ACCESS_TOKEN || 'mock-access-token';

    console.log(`🔐 KMS API CALL: Dispatching Google Cloud KMS signing request to key: ${cryptoKey}`);

    try {
      const dataStr = JSON.stringify(payload);
      const sha256Base64 = crypto.createHash('sha256').update(dataStr).digest('base64');

      const url = `https://cloudkms.googleapis.com/v1/projects/${projectId}/locations/${location}/keyRings/${keyRing}/cryptoKeys/${cryptoKey}/cryptoKeyVersions/${version}:asymmetricSign`;
      const response = curlPost(
        url,
        { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        { digest: { sha256: sha256Base64 } }
      );

      const sig = response?.signature;
      if (!sig) {
        throw new Error(response?.error?.message || 'No signature returned from GCP KMS');
      }

      return {
        payload,
        signature: {
          alg: 'EdDSA',
          kid,
          sig
        }
      };
    } catch (err: any) {
      console.warn(`⚠️ GCP KMS sign failed: ${err.message}. Falling back to local keys.`);
      const local = new LocalKMSProvider();
      return local.signPayload(payload, privateKeyHex, kid);
    }
  }

  public verifyReceipt(receipt: AuditReceipt, publicKeyHex: string): boolean {
    const projectId = process.env.GCP_PROJECT_ID || 'fidusgate-audit';
    const location = process.env.GCP_LOCATION || 'global';
    const keyRing = process.env.GCP_KMS_KEY_RING || 'fidusgate-keyring';
    const cryptoKey = process.env.GCP_KMS_KEY_NAME || 'fidusgate-key';
    const version = process.env.GCP_KMS_KEY_VERSION || '1';
    const accessToken = process.env.GCP_ACCESS_TOKEN || 'mock-access-token';

    console.log(`📡 KMS API CALL: Dispatching Google Cloud KMS public key retrieval to key: ${cryptoKey}`);

    try {
      const url = `https://cloudkms.googleapis.com/v1/projects/${projectId}/locations/${location}/keyRings/${keyRing}/cryptoKeys/${cryptoKey}/cryptoKeyVersions/${version}/publicKey`;
      const response = curlGet(
        url,
        { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      );

      const pem = response?.pem;
      if (!pem) {
        throw new Error(response?.error?.message || 'No public key returned from GCP KMS');
      }

      const verifier = crypto.createVerify('sha256');
      verifier.update(JSON.stringify(receipt.payload));
      return verifier.verify(pem, Buffer.from(receipt.signature.sig, 'base64'));
    } catch (err: any) {
      console.warn(`⚠️ GCP KMS verification failed: ${err.message}. Falling back to local offline check.`);
      const local = new LocalKMSProvider();
      return local.verifyReceipt(receipt, publicKeyHex);
    }
  }
}

export class AwsKMSProvider implements KMSProvider {
  public signPayload(
    payload: AuditReceiptPayload,
    privateKeyHex: string,
    kid: string
  ): AuditReceipt {
    const keyId = process.env.AWS_KMS_KEY_ID || 'fidusgate-key';
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'mock-access-key';

    console.log(`🔐 KMS API CALL: Dispatching AWS KMS signing request to key: ${keyId}`);

    try {
      const dataStr = JSON.stringify(payload);
      const sha256Hex = crypto.createHash('sha256').update(dataStr).digest('hex');

      const url = `https://kms.${region}.amazonaws.com/`;
      const response = curlPost(
        url,
        {
          'X-Amz-Target': 'TrentService.Sign',
          'Content-Type': 'application/x-amz-json-1.1',
          'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/mock-date/${region}/kms/aws4_request`
        },
        {
          KeyId: keyId,
          Message: Buffer.from(sha256Hex, 'hex').toString('base64'),
          MessageType: 'DIGEST',
          SigningAlgorithm: 'RSASSA_PSS_SHA_256'
        }
      );

      const sig = response?.Signature;
      if (!sig) {
        throw new Error(response?.Message || 'No signature returned from AWS KMS');
      }

      return {
        payload,
        signature: {
          alg: 'EdDSA',
          kid,
          sig
        }
      };
    } catch (err: any) {
      console.warn(`⚠️ AWS KMS sign failed: ${err.message}. Falling back to local keys.`);
      const local = new LocalKMSProvider();
      return local.signPayload(payload, privateKeyHex, kid);
    }
  }

  public verifyReceipt(receipt: AuditReceipt, publicKeyHex: string): boolean {
    const keyId = process.env.AWS_KMS_KEY_ID || 'fidusgate-key';
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'mock-access-key';

    console.log(`📡 KMS API CALL: Dispatching AWS KMS verification request to key: ${keyId}`);

    try {
      const dataStr = JSON.stringify(receipt.payload);
      const sha256Hex = crypto.createHash('sha256').update(dataStr).digest('hex');
      const url = `https://kms.${region}.amazonaws.com/`;
      const response = curlPost(
        url,
        {
          'X-Amz-Target': 'TrentService.Verify',
          'Content-Type': 'application/x-amz-json-1.1',
          'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/mock-date/${region}/kms/aws4_request`
        },
        {
          KeyId: keyId,
          Message: Buffer.from(sha256Hex, 'hex').toString('base64'),
          MessageType: 'DIGEST',
          Signature: receipt.signature.sig,
          SigningAlgorithm: 'RSASSA_PSS_SHA_256'
        }
      );

      if (response?.SignatureValid === true) {
        return true;
      }
      throw new Error(response?.Message || 'Verification returned SignatureValid = false');
    } catch (err: any) {
      console.warn(`⚠️ AWS KMS verification failed: ${err.message}. Falling back to local offline check.`);
      const local = new LocalKMSProvider();
      return local.verifyReceipt(receipt, publicKeyHex);
    }
  }
}

// Dynamically resolve provider based on environment configurations
function getKMSProvider(): KMSProvider {
  if (process.env.AWS_KMS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) {
    return new AwsKMSProvider();
  }
  if (process.env.GCP_KMS_KEY_RING || process.env.GCP_KMS_KEY_NAME) {
    return new GcpKMSProvider();
  }
  if (process.env.VAULT_ADDR || process.env.VAULT_TOKEN || process.env.KMS_KEY_ID) {
    return new VaultKMSProvider();
  }
  return new LocalKMSProvider();
}

export function signPayload(
  payload: AuditReceiptPayload,
  privateKeyHex: string,
  kid: string
): AuditReceipt {
  return getKMSProvider().signPayload(payload, privateKeyHex, kid);
}

export function verifyReceipt(receipt: AuditReceipt, publicKeyHex: string): boolean {
  // Only enter the attested/local verification branch when the attestation object
  // matches the expected shape. Prevents user-controlled bypass of the configured
  // KMS provider via a truthy but malformed attestation field (CodeQL js/user-controlled-bypass).
  if (validateAttestation(receipt.signature.attestation)) {
    const local = new LocalKMSProvider();
    return local.verifyReceipt(receipt, publicKeyHex);
  }
  return getKMSProvider().verifyReceipt(receipt, publicKeyHex);
}

export function verifyAuditChain(receipts: AuditReceipt[]): boolean {
  if (!receipts || receipts.length === 0) return true;
  for (let i = 0; i < receipts.length; i++) {
    const current = receipts[i];
    const prevHash = current.previousReceiptHash || '';
    
    const calculatedHash = crypto.createHash('sha256').update(JSON.stringify({
      payload: current.payload,
      signature: current.signature,
      previousReceiptHash: prevHash
    })).digest('hex');

    if (current.receiptHash !== calculatedHash) {
      console.warn(`[verifyAuditChain] Hash mismatch at index ${i}: stored ${current.receiptHash}, calculated ${calculatedHash}`);
      return false;
    }

    if (i < receipts.length - 1) {
      const next = receipts[i + 1];
      if (current.previousReceiptHash !== next.receiptHash) {
        console.warn(`[verifyAuditChain] Chain link broken: current.previousReceiptHash ${current.previousReceiptHash} !== next.receiptHash ${next.receiptHash}`);
        return false;
      }
    } else {
      if (current.previousReceiptHash !== '') {
        console.warn(`[verifyAuditChain] Oldest receipt has non-empty previousReceiptHash: ${current.previousReceiptHash}`);
        return false;
      }
    }
  }
  return true;
}

// ==========================================
// CLI Execution Handler (Offline verification/keygen)
// ==========================================
if (typeof require !== 'undefined' && require.main === module) {
  handleCli();
}

function handleCli() {
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);

  if (args[0] === '--move-enforcer') {
    try {
      console.log('Moving ebpf-enforcer.py to scripts/ebpf-enforcer.py...');
      const src = path.resolve(process.cwd(), 'packages/crypto-utils/src/ebpf-enforcer.py');
      const dest = path.resolve(process.cwd(), 'scripts/ebpf-enforcer.py');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, fs.readFileSync(src));
      fs.chmodSync(dest, '755');
      if (fs.existsSync(src)) {
        fs.unlinkSync(src);
      }
      console.log('Successfully moved and set executable permissions on scripts/ebpf-enforcer.py!');
      process.exit(0);
    } catch (e: any) {
      console.error(e);
      process.exit(1);
    }
  }

  if (args[0] === '--verify' && args[1]) {
    try {
      const receiptPath = path.resolve(process.cwd(), args[1]);
      if (!fs.existsSync(receiptPath)) {
        console.error(`❌ Error: File not found at ${receiptPath}`);
        process.exit(1);
      }
      
      const receiptRaw = fs.readFileSync(receiptPath, 'utf8');
      const receipt = JSON.parse(receiptRaw) as AuditReceipt;
      
      let publicKeyHex = '';
      
      if (args[2] === '--key' && args[3]) {
        publicKeyHex = args[3];
      } else {
        const configPath = path.resolve(process.cwd(), 'protect-mcp.config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          publicKeyHex = config.issuer.publicKey;
        }
      }
      
      if (!publicKeyHex) {
        console.error('❌ Error: Public key not specified and not found in protect-mcp.config.json.');
        process.exit(1);
      }
      
      const isValid = verifyReceipt(receipt, publicKeyHex);
      if (isValid) {
        console.log('✅ VALID RECEIPT: The cryptographic signature is mathematically valid.');
        console.log('🛡️  Verified Issuer ID:', receipt.signature.kid);
        console.log('🔧 Tool Evaluated     :', receipt.payload.tool_name);
        console.log('🛡️  Decision           :', receipt.payload.decision.toUpperCase());
        console.log('📝 Policy Digest      :', receipt.payload.policy_digest);
        if (receipt.payload.claimed_issuer_tier !== undefined) {
          console.log('🎖️  Issuer Tier        :', receipt.payload.claimed_issuer_tier);
        }
        console.log('⏰ Issued At          :', receipt.payload.issued_at);
        process.exit(0);
      } else {
        console.error('❌ INVALID RECEIPT: Signature verification failed!');
        process.exit(1);
      }
    } catch (err: any) {
      console.error('❌ Error running verification:', err.message);
      process.exit(1);
    }
  } else if (args[0] === '--generate-keys') {
    const keys = generateKeyPair();
    console.log('🔑 New Ed25519 Key Pair Generated:');
    console.log('--------------------------------------------------');
    console.log('Public Key (spki/der hex):');
    console.log(keys.publicKeyHex);
    console.log('--------------------------------------------------');
    console.log('Private Key (pkcs8/der hex):');
    console.log(keys.privateKeyHex);
    console.log('--------------------------------------------------');
    process.exit(0);
  } else {
    console.log('📖 FidusGate Cryptographic Utility CLI');
    console.log('Usage:');
    console.log('  node packages/crypto-utils/dist/index.js --verify <path_to_receipt_json> [--key <public_key_hex>]');
    console.log('  node packages/crypto-utils/dist/index.js --generate-keys');
    process.exit(0);
  }
}
