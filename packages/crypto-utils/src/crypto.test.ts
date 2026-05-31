import test from 'node:test';
import assert from 'node:assert';
import { generateKeyPair, signPayload, verifyReceipt, createAttestedSession } from './index';
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
        sig: receipt.signature.sig.replace(/^[0-9a-f]/, '0') // modify first hex char
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
    const tamperedAttestationReceipt = {
      ...attestedReceipt,
      signature: {
        ...attestedReceipt.signature,
        attestation: {
          ...attestedReceipt.signature.attestation,
          attestationSignature: attestedReceipt.signature.attestation.attestationSignature.replace(/^[0-9a-f]/, '0')
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
});
