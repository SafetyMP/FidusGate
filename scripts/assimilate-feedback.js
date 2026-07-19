#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const plmStatePath = path.resolve(process.cwd(), '.memory/plm-compliance-state.json');
const ledgerPath = path.resolve(process.cwd(), '.memory/agent-learning-ledger.json');

// Atomic write via temp file + rename — no existsSync/writeFileSync race
// (CodeQL js/file-system-race).
function atomicWriteFileSync(targetPath, data) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const suffix = crypto.randomBytes(6).toString('hex');
  const tempPath = path.join(dir, `${path.basename(targetPath)}.${suffix}.tmp`);
  fs.writeFileSync(tempPath, data, 'utf8');
  fs.renameSync(tempPath, targetPath);
}

// Helper to resolve the target SME role based on files modified
function getTargetSmeRole(modifiedFiles) {
  if (!modifiedFiles || modifiedFiles.length === 0) return 'developer';
  
  const hasDb = modifiedFiles.some(f => f.includes('packages/database/'));
  const hasDashboard = modifiedFiles.some(f => f.includes('apps/admin-dashboard/'));
  const hasDevops = modifiedFiles.some(f => f.includes('.github/workflows/') || f.includes('Dockerfile') || f.includes('scripts/sandbox-execute.sh'));
  const hasSecurity = modifiedFiles.some(f => f.includes('policy.cedar') || f.includes('protect-mcp.config.json'));
  
  if (hasSecurity) return 'security-sme';
  if (hasDevops) return 'devops-sme';
  if (hasDb) return 'backend-sme';
  if (hasDashboard) return 'frontend-sme';
  
  return 'developer';
}

function main() {
  if (!fs.existsSync(plmStatePath)) {
    console.log('🚀 FidusGate Learning: No PLM state found. Nothing to assimilate.');
    process.exit(0);
  }

  let plmState;
  try {
    plmState = JSON.parse(fs.readFileSync(plmStatePath, 'utf8'));
  } catch (err) {
    console.error('❌ FidusGate Learning: Failed to parse plm-compliance-state.json:', err.message);
    process.exit(1);
  }

  const activeDirectives = plmState.activeDirectives || [];
  if (plmState.feedbackAligned !== false && activeDirectives.length === 0) {
    console.log('✅ FidusGate Learning: All feedback is aligned. No active critiques to assimilate.');
    process.exit(0);
  }

  console.log('🔍 FidusGate Learning: Unaligned feedback/directives detected:');
  activeDirectives.forEach((dir, idx) => {
    console.log(`   ${idx + 1}. ${dir}`);
  });

  // Extract staging files and staged diff
  let stagedFiles = [];
  let gitDiffStat = '';
  try {
    stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only']).toString().trim().split('\n').filter(Boolean);
    gitDiffStat = execFileSync('git', ['diff', '--cached', '--stat']).toString().trim();
  } catch (e) {
    // Git might not be initialized or no files staged
  }

  // Determine resolution explanation
  let justification = process.env.RESOLUTION_JUSTIFICATION || '';
  
  // Parse command line args
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--justification=')) {
      justification = args[i].split('=')[1];
    } else if (args[i] === '--justification' && args[i + 1]) {
      justification = args[i + 1];
    }
  }

  if (!justification) {
    if (gitDiffStat) {
      justification = `Auto-resolved by staging the following changes:\n${gitDiffStat}`;
    } else {
      justification = 'Feedback resolved via workspace modifications.';
    }
  }

  // Load or initialize the shared learning ledger
  let ledger = [];
  if (fs.existsSync(ledgerPath)) {
    try {
      ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    } catch (err) {
      console.warn('⚠️  FidusGate Learning: Muted error parsing learning ledger, resetting:', err.message);
    }
  }

  // Gather historical feedback records that correspond to active directives
  const historicalFeedback = plmState.historicalFeedback || [];
  const targetRole = getTargetSmeRole(stagedFiles.length > 0 ? stagedFiles : plmState.modifiedFiles);

  const newLessons = [];

  activeDirectives.forEach((directive) => {
    // Find matching feedback details
    const matchingFeedback = historicalFeedback.find(f => f.comment === directive) || {
      role: 'admin',
      comment: directive,
      severity: 'warn',
      timestamp: new Date().toISOString()
    };

    const lesson = {
      id: `lesson_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      requirementId: plmState.activeRequirementId || 'GENERAL',
      sourceRole: matchingFeedback.role,
      targetRole: targetRole,
      critique: matchingFeedback.comment,
      resolution: justification,
      modifiedFiles: stagedFiles.length > 0 ? stagedFiles : plmState.modifiedFiles,
      assimilatedBy: process.env.AGENT_ROLE || 'developer'
    };

    ledger.unshift(lesson);
    newLessons.push(lesson);
  });

  // Write updated ledger
  try {
    atomicWriteFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(`✅ FidusGate Learning: Recorded ${newLessons.length} new lesson(s) in .memory/agent-learning-ledger.json.`);
    newLessons.forEach(l => {
      console.log(`   💡 [${l.sourceRole} ➔ ${l.targetRole}]: "${l.critique}" Resolved via: "${l.resolution.split('\n')[0]}"`);
    });
  } catch (err) {
    console.error('❌ FidusGate Learning: Failed to write learning ledger:', err.message);
    process.exit(1);
  }

  // Clear PLM gate in state
  plmState.feedbackAligned = true;
  plmState.activeDirectives = [];

  try {
    atomicWriteFileSync(plmStatePath, JSON.stringify(plmState, null, 2));
    console.log('✅ FidusGate Learning: PLM compliance state updated. FeedbackAligned = true.');
  } catch (err) {
    console.error('❌ FidusGate Learning: Failed to update PLM compliance state file:', err.message);
    process.exit(1);
  }

  // Hit the secure gateway API to align feedback if running
  if (process.env.DISABLE_AUTH !== 'true') {
    // We can attempt to notify the running server, but since this runs in a git hook,
    // updating the state file directly is sufficient for local validation.
  }
}

main();
