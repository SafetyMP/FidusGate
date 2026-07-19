#!/usr/bin/env bash
# Integration smoke — parent runs after merge on main root (see AGENTS.md).
set -euo pipefail

case "$PWD" in
  */.worktrees|*/.worktrees/|*/.worktrees/*)
    echo "integration-smoke refused from worktree cwd ($PWD)" >&2
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
./scripts/ham-drift-watcher.sh
