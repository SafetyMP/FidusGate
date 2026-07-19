#!/bin/bash
# Unified Repository Bootstrapper
# Author: Antigravity Code Assistant

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SCRIPTS_DIR="$REPO_ROOT/scripts"

echo "🚀 Starting unified repository bootstrapping..."

# 1. Verify Git Hooks setup
if [ -f "$SCRIPTS_DIR/setup-git-hooks.sh" ]; then
    echo "⚙️  Configuring local Git hooks..."
    bash "$SCRIPTS_DIR/setup-git-hooks.sh"
else
    echo "❌ Error: setup-git-hooks.sh not found!"
    exit 1
fi

# 2. Check for Mise version manager (no curl|sh — Scorecard downloadThenRun)
if command -v mise >/dev/null 2>&1; then
    echo "✅ Mise version manager is active."
elif [ -x "$HOME/.local/bin/mise" ]; then
    export PATH="$HOME/.local/bin:$HOME/.local/share/mise/bin:$PATH"
    echo "✅ Mise found at ~/.local/bin/mise."
else
    echo "ℹ️  Mise not installed. Install from https://mise.jdx.dev (brew/release binary),"
    echo "   then re-run bootstrap. Continuing with system Node/npm."
fi

# 3. Check Docker status for the isolated sandbox
if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
        echo "✅ Docker daemon is active. Isolated sandboxed execution is enabled."
    else
        echo "⚠️  Docker daemon is not running. Sandbox execution will fall back to safe host shell."
    fi
else
    echo "⚠️  Docker is not installed. Sandbox execution will fall back to safe host shell."
fi

# 4. Install dependencies via locked npm ci only (Scorecard npmCommand pin)
if [ -f "$REPO_ROOT/package.json" ]; then
    echo "📦 Installing package dependencies..."
    if [ ! -f "$REPO_ROOT/package-lock.json" ]; then
        echo "❌ Error: package-lock.json missing; refusing unpinned npm install."
        exit 1
    fi
    if ! command -v npm >/dev/null 2>&1; then
        echo "❌ Error: npm is required."
        exit 1
    fi
    (cd "$REPO_ROOT" && npm ci)
fi

# 5. Run initial Context Drift audit
if [ -f "$SCRIPTS_DIR/ham-drift-watcher.sh" ]; then
    echo "📡 Running initial Context Drift audit..."
    bash "$SCRIPTS_DIR/ham-drift-watcher.sh"
fi

echo "🎉 Bootstrapping complete! Your environment is fully configured, secure, and optimized."
exit 0
