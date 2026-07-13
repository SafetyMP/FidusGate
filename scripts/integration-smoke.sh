#!/usr/bin/env bash
# Integration smoke — parent runs after merge on main root (see AGENTS.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

case "$PWD" in
  */.worktrees/*)
    echo "integration-smoke refused from worktree cwd ($PWD)" >&2
    exit 1
    ;;
esac

./scripts/ham-drift-watcher.sh
