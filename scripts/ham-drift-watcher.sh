#!/bin/bash
# Real-Time HAM Scoped Memory (CLAUDE.md) Drift Detector
# Author: Antigravity Code Assistant

node << 'EOF'
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = execSync('git rev-parse --show-toplevel 2>/dev/null || pwd', { encoding: 'utf8' }).trim();
const memoryDir = path.join(repoRoot, '.memory');
const statusFile = path.join(memoryDir, 'drift-status.json');

if (!fs.existsSync(memoryDir)) {
  fs.mkdirSync(memoryDir, { recursive: true });
}

console.log('📡 Starting real-time HAM Memory Drift Audit...');

try {
  // Find all CLAUDE.md files in subdirectories
  const hamFiles = execSync('find . -name "CLAUDE.md" -not -path "*/.git/*" -not -path "*/node_modules/*"', { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map(p => path.resolve(repoRoot, p));

  const drifted = [];
  
  // Get git log once for all paths
  const logData = execSync('git log --name-only --format="COMMIT:%at"', { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const lines = logData.split('\n');
  
  const latestCommit = {};
  let currentTs = 0;
  
  for (const line of lines) {
    if (line.startsWith('COMMIT:')) {
      currentTs = parseInt(line.substring(7), 10);
    } else if (line.trim()) {
      const filePath = path.resolve(repoRoot, line.trim());
      if (!latestCommit[filePath]) {
        latestCommit[filePath] = currentTs;
      }
      
      // Propagate timestamps to parent directories
      let dir = path.dirname(filePath);
      while (dir.startsWith(repoRoot) && dir !== repoRoot) {
        if (!latestCommit[dir] || currentTs > latestCommit[dir]) {
          latestCommit[dir] = currentTs;
        }
        dir = path.dirname(dir);
      }
    }
  }
  
  for (const file of hamFiles) {
    const dir = path.dirname(file);
    if (dir === repoRoot) continue; // Skip root CLAUDE.md
    
    const memTs = latestCommit[file] || 0;
    
    // Get latest commit to directory excluding the CLAUDE.md file itself
    let dirTs = 0;
    try {
      const dirLog = execSync(`git log -n 1 --format="%at" -- "${dir}" ":(exclude)${file}"`, { encoding: 'utf8' }).trim();
      if (dirLog) {
        dirTs = parseInt(dirLog, 10);
      }
    } catch (err) {
      // Fallback to directory timestamp from general log
      dirTs = latestCommit[dir] || 0;
    }
    
    if (dirTs > memTs) {
      const relativeDir = path.relative(repoRoot, dir);
      console.log(`   ⚠️  Drifted: \x1b[33m${relativeDir}\x1b[0m`);
      drifted.push({
        path: relativeDir,
        drift_seconds: dirTs - memTs
      });
    }
  }

  const result = {
    last_audit_at: new Date().toISOString(),
    drifted_directories: drifted,
    drift_count: drifted.length
  };

  fs.writeFileSync(statusFile, JSON.stringify(result, null, 2) + '\n');
  console.log(`✅ Drift audit complete. Status saved to: .memory/drift-status.json`);
} catch (error) {
  console.error('❌ Error running drift audit:', error.message);
  process.exit(1);
}
EOF

