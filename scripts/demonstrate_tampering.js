const path = require('path');
const fs = require('fs');
const cryptoUtils = require(path.resolve(__dirname, '../packages/crypto-utils/dist/index.js'));

console.log('🚀 Step 1: Generating a REAL cryptographically secure Ed25519 key pair...');
const keys = cryptoUtils.generateKeyPair();
console.log('  🗝️ Public Key Hex :', keys.publicKeyHex);
console.log('  🗝️ Private Key Hex:', keys.privateKeyHex.substring(0, 30) + '...');

const payload = {
  type: "protectmcp:decision",
  tool_name: "write_file",
  decision: "allow",
  policy_digest: "sha256:8f413a9de010",
  issued_at: new Date().toISOString(),
  issuer_id: "sb:issuer:de073ae64e43",
  reason: "Tier 2 file modification in approved src/ directory allowed",
  claimed_issuer_tier: 2
};

console.log('\n🚀 Step 2: Signing the payload using the private key...');
const receipt = cryptoUtils.signPayload(payload, keys.privateKeyHex, 'sb:issuer:de073ae64e43');
console.log('  ✍️ Ed25519 Signature generated successfully:', receipt.signature.sig);

console.log('\n🚀 Step 3: Verifying the authentic receipt...');
const isValid = cryptoUtils.verifyReceipt(receipt, keys.publicKeyHex);
console.log(`  🔍 Verification Decision: ${isValid ? '✅ VALID (Signature matches payload)' : '❌ INVALID'}`);

console.log('\n🚀 Step 4: Simulating ledger tampering (changing the decision from allow to deny)...');
const tamperedReceipt = JSON.parse(JSON.stringify(receipt));
tamperedReceipt.payload.decision = 'deny'; // Alter the payload

const isTamperedValid = cryptoUtils.verifyReceipt(tamperedReceipt, keys.publicKeyHex);
console.log(`  🔍 Verification Decision on Tampered Data: ${isTamperedValid ? '✅ VALID' : '❌ TAMPERED/INVALID (Signature verification failed!)'}`);

// Save to single-receipt.json
const targetFile = path.resolve(__dirname, '../packages/database/data/single-receipt.json');
fs.writeFileSync(targetFile, JSON.stringify(receipt, null, 2), 'utf8');
console.log(`\n💾 Saved the authentic, mathematically valid receipt to ${targetFile}`);

// Save keys to a temp workspace file so we can pass them in the CLI
const keysFile = path.resolve(__dirname, '../packages/database/data/test-keys.json');
fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2), 'utf8');
console.log(`💾 Saved keys to ${keysFile}`);
