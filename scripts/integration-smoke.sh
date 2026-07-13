#!/usr/bin/env bash
# Integration smoke — parent runs after merge on main root (see AGENTS.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
./scripts/ham-drift-watcher.sh
