import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { verifyReceipt } from '@fidusgate/crypto-utils';
import { AuditReceipt } from '@fidusgate/core-types';

async function run() {
  console.log('🛡️  FidusGate SecOps Guard Action Bootstrapping...');
  
  const rootKeyHex = process.env.INPUT_FIDUSGATE_ROOT_KEY || process.env.FIDUSGATE_ROOT_KEY;
  if (!rootKeyHex) {
    console.error('❌ Error: Missing required input: fidusgate_root_key');
    process.exit(1);
  }

  console.log('🔑 Loaded FidusGate Master Root Key for receipt validation.');

  // 1. Scan GitHub Workflow files for prompt injection vulnerabilities
  console.log('\n🔍 Phase 1: Scanning Workflow Files...');
  const workflowsDir = path.resolve(process.cwd(), '.github', 'workflows');
  let scanFailures = 0;

  if (fs.existsSync(workflowsDir)) {
    const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    console.log(`Found ${files.length} workflow files to check.`);
    
    for (const file of files) {
      const filePath = path.join(workflowsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Look for unsafe github context references in run commands (e.g., github.event.issue.body, github.event.comment.body)
      const unsafeContextRegex = /\$\{\{\s*github\.event\.(issue|pull_request|comment|review|commits|head_commit)\.(body|title|description|message)\s*\}\}/i;
      if (unsafeContextRegex.test(content)) {
        console.error(`❌ SECURITY VIOLATION: Unsafe GitHub Context binding in ${file}!`);
        console.error(`   Ref: ${content.match(unsafeContextRegex)?.[0]}`);
        console.error(`   Remediation: Store the context value in an environment variable instead of expanding it directly in the shell.`);
        scanFailures++;
      }
    }
  } else {
    console.log('ℹ️ No workflows directory found. Skipping workflow scan.');
  }

  // 2. Scan Commit History for cryptographically attested audit receipts
  console.log('\n🔍 Phase 2: Verifying Cryptographic Commit Attestations...');
  let receiptVerificationFailures = 0;
  
  try {
    const gitLog = execSync('git log -n 5 --format="%H|%s|%B"', { encoding: 'utf8' });
    const commits = gitLog.split('\n').filter(Boolean);
    console.log(`Analyzing recent ${commits.length} commits for FidusGate certifications...`);
    
    for (const commit of commits) {
      const [hash, subject, body] = commit.split('|');
      console.log(`\nCommit: ${hash.substring(0, 7)} - "${subject}"`);
      
      // Look for [fidusgate:receipt:...] embedded in commit body or receipts stored in receipts directory
      const receiptMatch = body?.match(/\[fidusgate:receipt:(.+?)\]/);
      if (receiptMatch) {
        try {
          const receiptRaw = Buffer.from(receiptMatch[1], 'base64').toString('utf8');
          const receipt = JSON.parse(receiptRaw) as AuditReceipt;
          
          const isValid = verifyReceipt(receipt, rootKeyHex);
          if (isValid) {
            console.log(`✅ Mathematical Attestation Verified!`);
            console.log(`   Tool  : ${receipt.payload.tool_name}`);
            console.log(`   Issuer: ${receipt.signature.kid}`);
            console.log(`   Digest: ${receipt.payload.policy_digest}`);
          } else {
            console.error(`❌ ATTENUATION FAILURE: Cryptographic signature verification failed!`);
            receiptVerificationFailures++;
          }
        } catch (err: any) {
          console.error(`❌ Error parsing attested receipt: ${err.message}`);
          receiptVerificationFailures++;
        }
      } else {
        // If there's no receipt in commit, look for a receipt file in the memory directory matching the commit hash
        const memoryReceiptPath = path.resolve(process.cwd(), '.memory', 'receipts', `${hash}.json`);
        if (fs.existsSync(memoryReceiptPath)) {
          try {
            const receipt = JSON.parse(fs.readFileSync(memoryReceiptPath, 'utf8')) as AuditReceipt;
            const isValid = verifyReceipt(receipt, rootKeyHex);
            if (isValid) {
              console.log(`✅ Mathematical Attestation Verified via local file cache!`);
            } else {
              console.error(`❌ ATTENUATION FAILURE: Signature verification failed for local receipt!`);
              receiptVerificationFailures++;
            }
          } catch (err: any) {
            console.error(`❌ Error parsing local receipt file: ${err.message}`);
            receiptVerificationFailures++;
          }
        } else {
          console.log(`⚠️  Warning: No cryptographic FidusGate attestation found for this commit.`);
        }
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Git log check failed: ${err.message}. Skipping history validation.`);
  }

  // 3. Summarize results
  console.log('\n=========================================');
  console.log('🛡️  FidusGate SecOps Guard Summary:');
  console.log(`   Workflow Violations Found  : ${scanFailures}`);
  console.log(`   Cryptographic Receipt Fails: ${receiptVerificationFailures}`);
  console.log('=========================================');

  if (scanFailures > 0 || receiptVerificationFailures > 0) {
    console.error('\n❌ FidusGate Guard failed due to security violations or invalid attestations.');
    process.exit(1);
  } else {
    console.log('\n✅ FidusGate Guard passed successfully! Workspace complies with all security policies.');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal Exception in Action:', err);
  process.exit(1);
});
