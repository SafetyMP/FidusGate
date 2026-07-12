#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ledgerPath = path.resolve(process.cwd(), '.memory/agent-learning-ledger.json');

// Parse arguments
const args = process.argv.slice(2);
let role = process.env.AGENT_ROLE || '';
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--role=')) {
    role = args[i].split('=')[1];
  } else if (args[i] === '--role' && args[i + 1]) {
    role = args[i + 1];
  }
}

// Get staged/modified files
let activeFiles = [];
try {
  const staged = execSync('git diff --cached --name-only', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n').filter(Boolean);
  const modified = execSync('git diff --name-only', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n').filter(Boolean);
  const untracked = execSync('git status --porcelain', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n')
    .map(line => line.substring(3).trim())
    .filter(Boolean);
  activeFiles = Array.from(new Set([...staged, ...modified, ...untracked]));
} catch (e) {
  // Git failed or not a repo, fallback to empty
}

console.log('🧠 FidusGate Agent Synaptic Memory Context Retriever');
console.log('────────────────────────────────────────────────────────────────────────────────');

if (!fs.existsSync(ledgerPath)) {
  console.log('ℹ️  No agent learning ledger found. No historical context to retrieve.');
  process.exit(0);
}

let ledger = [];
try {
  ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
} catch (err) {
  console.error('❌ Failed to parse agent-learning-ledger.json:', err.message);
  process.exit(1);
}

if (ledger.length === 0) {
  console.log('ℹ️  Agent learning ledger is empty. No lessons recorded yet.');
  process.exit(0);
}

// Find matches
const matchedLessons = [];
ledger.forEach(lesson => {
  let score = 0;
  const reasons = [];

  // Match by modified files
  if (activeFiles.length > 0 && lesson.modifiedFiles) {
    const commonFiles = lesson.modifiedFiles.filter(f => activeFiles.includes(f));
    if (commonFiles.length > 0) {
      score += commonFiles.length * 10;
      reasons.push(`${commonFiles.length} file(s) match currently modified files`);
    }
  }

  // Match by role
  if (role && lesson.targetRole === role) {
    score += 5;
    reasons.push(`matches target role: ${role}`);
  }

  if (score > 0) {
    matchedLessons.push({
      lesson,
      score,
      reasons
    });
  }
});

// Sort by match score descending
matchedLessons.sort((a, b) => b.score - a.score);

const topLessons = matchedLessons.slice(0, 5);

if (topLessons.length === 0) {
  console.log('✅ No specific historical critiques matched your current workspace changes or role.');
  console.log('   Showing the 3 most recent general lessons from the ledger:\n');
  const general = ledger.slice(0, 3);
  general.forEach((g, idx) => {
    printLesson(g, idx + 1);
  });
} else {
  console.log(`🔍 Found ${topLessons.length} relevant historical lesson(s) based on your files/role:\n`);
  topLessons.forEach((m, idx) => {
    console.log(`💡 Lesson #${idx + 1} (Match score: ${m.score} - ${m.reasons.join(', ')}):`);
    printLesson(m.lesson, null);
  });
}

function printLesson(lesson, number) {
  const prefix = number ? `[Lesson #${number}] ` : '';
  console.log(`   ${prefix}📅 Date       : ${lesson.timestamp}`);
  console.log(`   🎯 Requirement: ${lesson.requirementId}`);
  console.log(`   👥 Roles      : ${lesson.sourceRole} ➔ ${lesson.targetRole}`);
  console.log(`   ⚠️  Critique   : ${lesson.critique}`);
  console.log(`   ✅ Resolution : ${lesson.resolution}`);
  if (lesson.modifiedFiles && lesson.modifiedFiles.length > 0) {
    console.log(`   📁 Files      : ${lesson.modifiedFiles.join(', ')}`);
  }
  console.log('────────────────────────────────────────────────────────────────────────────────');
}
