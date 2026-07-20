import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { generateKeyPair, signPayload, verifyReceipt, createAttestedSession, verifyAuditChain } from './index';
import { AuditReceiptPayload } from '@fidusgate/core-types';

test('Ed25519 Public-Key Cryptography Tests', async (t) => {
  
  await t.test('Successful sign-and-verify cycle with valid keypair', () => {
    const keys = generateKeyPair();
    assert.ok(keys.publicKeyHex, 'Public key hex should be generated');
    assert.ok(keys.privateKeyHex, 'Private key hex should be generated');

    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    const receipt = signPayload(payload, keys.privateKeyHex, 'sb:issuer:test');
    assert.strictEqual(receipt.payload.tool_name, 'read_file');
    assert.strictEqual(receipt.signature.kid, 'sb:issuer:test');
    assert.ok(receipt.signature.sig, 'Signature string should exist');

    const isValid = verifyReceipt(receipt, keys.publicKeyHex);
    assert.strictEqual(isValid, true, 'Valid signature should be successfully verified');
  });

  await t.test('Reject verification when payload attributes are tampered', () => {
    const keys = generateKeyPair();
    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    const receipt = signPayload(payload, keys.privateKeyHex, 'sb:issuer:test');
    
    // Attempted tampering: changing decision from 'allow' to 'deny'
    const tamperedReceipt = {
      ...receipt,
      payload: {
        ...receipt.payload,
        decision: 'deny' as const
      }
    };

    const isValid = verifyReceipt(tamperedReceipt, keys.publicKeyHex);
    assert.strictEqual(isValid, false, 'Verification must reject a tampered payload attributes block');
  });

  await t.test('Reject verification when signature is corrupted', () => {
    const keys = generateKeyPair();
    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    const receipt = signPayload(payload, keys.privateKeyHex, 'sb:issuer:test');
    
    // Attempted tampering: corrupting the signature string
    const corruptReceipt = {
      ...receipt,
      signature: {
        ...receipt.signature,
        sig: receipt.signature.sig[0] === '0' ? '1' + receipt.signature.sig.slice(1) : '0' + receipt.signature.sig.slice(1)
      }
    };

    const isValid = verifyReceipt(corruptReceipt, keys.publicKeyHex);
    assert.strictEqual(isValid, false, 'Verification must reject a corrupted signature hex sequence');
  });

  await t.test('Reject verification when verifying with a mismatched public key', () => {
    const keysA = generateKeyPair();
    const keysB = generateKeyPair();
    
    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    // Sign with private key A
    const receipt = signPayload(payload, keysA.privateKeyHex, 'sb:issuer:test');
    
    // Verify with public key B (mismatched)
    const isValid = verifyReceipt(receipt, keysB.publicKeyHex);
    assert.strictEqual(isValid, false, 'Verification must fail when using a public key mismatched from the private signer key');
  });

  await t.test('Gracefully handle and reject entirely corrupt/malformed signature string formats', () => {
    const keys = generateKeyPair();
    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    const receipt = signPayload(payload, keys.privateKeyHex, 'sb:issuer:test');
    
    // Attempted tampering: passing non-hex / malformed signatures
    const malformedReceipt = {
      ...receipt,
      signature: {
        ...receipt.signature,
        sig: 'completely-invalid-non-hex-signature-string-here'
      }
    };

    const isValid = verifyReceipt(malformedReceipt, keys.publicKeyHex);
    assert.strictEqual(isValid, false, 'Verification must gracefully catch format conversion errors and return false');
  });

  await t.test('Successful attested ephemeral session key sign-and-verify cycle', () => {
    const masterKeys = generateKeyPair();
    const issuerId = 'sb:issuer:test-identity';
    
    // 1. Create attested session (signs the ephemeral key with the master private key)
    const session = createAttestedSession(
      masterKeys.privateKeyHex,
      masterKeys.publicKeyHex,
      issuerId,
      3600 // 1 hour expiry
    );
    
    assert.ok(session.sessionKeyPair.publicKeyHex, 'Session key should exist');
    assert.ok(session.attestationCert.attestationSignature, 'Attestation signature should exist');
    assert.strictEqual(session.attestationCert.issuerId, issuerId);

    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'execute_command',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: issuerId
    };

    // 2. Sign the payload using the ephemeral session key
    const localReceipt = signPayload(payload, session.sessionKeyPair.privateKeyHex, issuerId);
    
    // Attach the attestation certificate to the signature
    const attestedReceipt = {
      ...localReceipt,
      signature: {
        ...localReceipt.signature,
        attestation: session.attestationCert
      }
    };

    // 3. Verify the receipt using FidusGate's master root public key
    const isValid = verifyReceipt(attestedReceipt, masterKeys.publicKeyHex);
    assert.strictEqual(isValid, true, 'Attested receipt should be successfully verified via master root public key');

    // 4. Reject if attestation certificate signature is tampered
    const origSig = attestedReceipt.signature.attestation.attestationSignature;
    const lastNibble = origSig.slice(-1);
    const flippedNibble = lastNibble === 'a' ? 'b' : 'a';
    const tamperedAttestationReceipt = {
      ...attestedReceipt,
      signature: {
        ...attestedReceipt.signature,
        attestation: {
          ...attestedReceipt.signature.attestation,
          attestationSignature: origSig.slice(0, -1) + flippedNibble
        }
      }
    };
    const isTamperedAttestationValid = verifyReceipt(tamperedAttestationReceipt, masterKeys.publicKeyHex);
    assert.strictEqual(isTamperedAttestationValid, false, 'Should reject receipt if attestation certificate signature is tampered');

    // 5. Reject if receipt payload is tampered
    const tamperedPayloadReceipt = {
      ...attestedReceipt,
      payload: {
        ...attestedReceipt.payload,
        decision: 'deny' as const
      }
    };
    const isTamperedPayloadValid = verifyReceipt(tamperedPayloadReceipt, masterKeys.publicKeyHex);
    assert.strictEqual(isTamperedPayloadValid, false, 'Should reject receipt if payload is tampered');
  });

  await t.test('VaultKMSProvider signing and fallback', () => {
    const keys = generateKeyPair();
    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    // Trigger Vault path by setting process.env
    process.env.VAULT_ADDR = 'http://mock-vault:8200';
    process.env.VAULT_TOKEN = 'mock-token';
    process.env.KMS_KEY_ID = 'mock-key';

    // The signPayload should run, catch connection error (since host is mock), and fallback to local signing
    const receipt = signPayload(payload, keys.privateKeyHex, 'sb:issuer:test');
    assert.strictEqual(receipt.payload.tool_name, 'read_file');
    assert.ok(receipt.signature.sig);

    // Verify receipt should also fallback to local offline verify
    const isValid = verifyReceipt(receipt, keys.publicKeyHex);
    assert.strictEqual(isValid, true, 'Verification fallback should succeed');

    // Clean up
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.KMS_KEY_ID;
  });

  await t.test('GcpKMSProvider signing and fallback', () => {
    const keys = generateKeyPair();
    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    process.env.GCP_PROJECT_ID = 'mock-project';
    process.env.GCP_KMS_KEY_NAME = 'mock-key';

    const receipt = signPayload(payload, keys.privateKeyHex, 'sb:issuer:test');
    assert.strictEqual(receipt.payload.tool_name, 'read_file');
    assert.ok(receipt.signature.sig);

    const isValid = verifyReceipt(receipt, keys.publicKeyHex);
    assert.strictEqual(isValid, true, 'Verification fallback should succeed');

    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_KMS_KEY_NAME;
  });

  await t.test('AwsKMSProvider signing and fallback', () => {
    const keys = generateKeyPair();
    const payload: AuditReceiptPayload = {
      type: 'protectmcp:decision',
      tool_name: 'read_file',
      decision: 'allow',
      policy_digest: 'sha256:8f413a9de010',
      issued_at: new Date().toISOString(),
      issuer_id: 'sb:issuer:test'
    };

    process.env.AWS_KMS_KEY_ID = 'mock-key';

    const receipt = signPayload(payload, keys.privateKeyHex, 'sb:issuer:test');
    assert.strictEqual(receipt.payload.tool_name, 'read_file');
    assert.ok(receipt.signature.sig);

    const isValid = verifyReceipt(receipt, keys.publicKeyHex);
    assert.strictEqual(isValid, true, 'Verification fallback should succeed');

    delete process.env.AWS_KMS_KEY_ID;
  });

  await t.test('Production denies missing KMS configuration', () => {
    const priorNodeEnv = process.env.NODE_ENV;
    const priorRuntime = process.env.FIDUSGATE_RUNTIME;
    const priorVaultAddr = process.env.VAULT_ADDR;
    const priorVaultToken = process.env.VAULT_TOKEN;
    const priorKmsKeyId = process.env.KMS_KEY_ID;
    const priorAwsKeyId = process.env.AWS_KMS_KEY_ID;
    const priorAwsRegion = process.env.AWS_REGION;
    const priorAwsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const priorGcpProject = process.env.GCP_PROJECT_ID;
    const priorGcpLocation = process.env.GCP_LOCATION;
    const priorGcpKeyRing = process.env.GCP_KMS_KEY_RING;
    const priorGcpKeyName = process.env.GCP_KMS_KEY_NAME;
    const priorGcpToken = process.env.GCP_ACCESS_TOKEN;
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.FIDUSGATE_RUNTIME;
      delete process.env.VAULT_ADDR;
      delete process.env.VAULT_TOKEN;
      delete process.env.KMS_KEY_ID;
      delete process.env.AWS_KMS_KEY_ID;
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.GCP_PROJECT_ID;
      delete process.env.GCP_LOCATION;
      delete process.env.GCP_KMS_KEY_RING;
      delete process.env.GCP_KMS_KEY_NAME;
      delete process.env.GCP_ACCESS_TOKEN;

      const keys = generateKeyPair();
      assert.throws(
        () => signPayload({
          type: 'protectmcp:decision',
          tool_name: 'read_file',
          decision: 'allow',
          policy_digest: 'sha256:test',
          issued_at: new Date().toISOString(),
          issuer_id: 'sb:issuer:test'
        }, keys.privateKeyHex, 'sb:issuer:test'),
        /KMS provider is required in production/
      );
    } finally {
      restore('NODE_ENV', priorNodeEnv);
      restore('FIDUSGATE_RUNTIME', priorRuntime);
      restore('VAULT_ADDR', priorVaultAddr);
      restore('VAULT_TOKEN', priorVaultToken);
      restore('KMS_KEY_ID', priorKmsKeyId);
      restore('AWS_KMS_KEY_ID', priorAwsKeyId);
      restore('AWS_REGION', priorAwsRegion);
      restore('AWS_ACCESS_KEY_ID', priorAwsAccessKey);
      restore('GCP_PROJECT_ID', priorGcpProject);
      restore('GCP_LOCATION', priorGcpLocation);
      restore('GCP_KMS_KEY_RING', priorGcpKeyRing);
      restore('GCP_KMS_KEY_NAME', priorGcpKeyName);
      restore('GCP_ACCESS_TOKEN', priorGcpToken);
    }
  });

  await t.test('Receipt-chain verification rejects tampering', () => {
    const receipt: {
      payload: AuditReceiptPayload;
      signature: { alg: 'EdDSA'; kid: string; sig: string };
      previousReceiptHash: string;
      receiptHash: string;
    } = {
      payload: {
        type: 'protectmcp:decision',
        tool_name: 'read_file',
        decision: 'allow',
        policy_digest: 'sha256:test',
        issued_at: new Date().toISOString(),
        issuer_id: 'sb:issuer:test'
      },
      signature: { alg: 'EdDSA' as const, kid: 'sb:issuer:test', sig: 'signed' },
      previousReceiptHash: '',
      receiptHash: ''
    };
    receipt.receiptHash = crypto.createHash('sha256').update(JSON.stringify({
      payload: receipt.payload,
      signature: receipt.signature,
      previousReceiptHash: receipt.previousReceiptHash
    })).digest('hex');

    assert.strictEqual(verifyAuditChain([receipt]), true);
    receipt.payload.decision = 'deny';
    assert.strictEqual(verifyAuditChain([receipt]), false);
  });
});
