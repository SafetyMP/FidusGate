import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { AuditReceipt, AuditReceiptPayload } from '@fidusgate/core-types';

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
      const attestation = receipt.signature.attestation;
      
      if (attestation) {
        // 1. Verify attestation is not expired
        if (new Date(attestation.expiresAt).getTime() < Date.now()) {
          return false;
        }

        // 2. Verify the attestation certificate signed by the master root key
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

        // 3. Verify the receipt signature signed by the ephemeral session key
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

// Synchronous curl post helper to handle networked HSM queries
function curlPost(url: string, headers: Record<string, string>, body: any): any {
  const curlCmd = `curl -s -X POST "${url}" ` +
    Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ') +
    ` -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`;
  const output = execSync(curlCmd, { encoding: 'utf8' });
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
    const local = new LocalKMSProvider();
    return local.verifyReceipt(receipt, publicKeyHex);
  }
}

// Dynamically resolve provider based on environment configurations
function getKMSProvider(): KMSProvider {
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
  if (receipt.signature.attestation) {
    const local = new LocalKMSProvider();
    return local.verifyReceipt(receipt, publicKeyHex);
  }
  return getKMSProvider().verifyReceipt(receipt, publicKeyHex);
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
