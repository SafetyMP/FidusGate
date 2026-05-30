const fs = require('fs');
const path = require('path');

const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'ci-agent-pipeline.yml');
const databasePath = path.resolve(__dirname, '..', 'packages', 'database', 'data', 'findings.json');

console.log('🔍 Starting CI/CD Workflow Security Scanner...');

if (!fs.existsSync(workflowPath)) {
  console.error(`❌ Error: Workflow file not found at ${workflowPath}`);
  process.exit(1);
}

const content = fs.readFileSync(workflowPath, 'utf8');

// Detect if the file contains the vulnerable event dynamic interpolation
const isVulnerable = content.includes('github.event.pull_request.title');

let findings = [];

if (isVulnerable) {
  console.log('⚠️  CRITICAL VULNERABILITY DETECTED: Hardcoded event metadata passed directly into prompt context!');
  
  findings.push({
    vector: "A",
    title: "Env Var Intermediary (Vulnerable)",
    severity: "High",
    file: ".github/workflows/ci-agent-pipeline.yml",
    step: "jobs.agent-review.steps[2] line 39",
    impact: "Allows any malicious PR contributor to execute arbitrary shell commands in CI via indirect prompt injection.",
    evidence: "env:\n  PR_TITLE: ${{ github.event.pull_request.title }}\nprompt: \"Review code changes for PR: $PR_TITLE\"",
    dataFlow: [
      "Attacker creates a pull request with prompt injection code in the title.",
      "The workflow triggers on the pull request event.",
      "The workflow loads the untrusted title into the env block.",
      "The AI agent reads the environment variable, interprets the injected command as an instruction, and executes it."
    ],
    remediation: "Do not pass dynamic event variables directly to environment blocks consumed by AI prompts. Use strict string sanitization filters or pull named fields from authenticated metadata sources."
  });
} else {
  console.log('✅ WORKFLOW SECURE: No workflow prompt injection vulnerabilities detected.');
}

// Write the findings directly to the shared mounted database volume
console.log('💾 Syncing scan reports directly to Veritas Database volume...');
try {
  fs.writeFileSync(databasePath, JSON.stringify(findings, null, 2), 'utf8');
  console.log(`✅ Scan report successfully written. Findings synced: ${findings.length}`);
  process.exit(0);
} catch (err) {
  console.error(`❌ Failed to write to database: ${err.message}`);
  process.exit(1);
}
