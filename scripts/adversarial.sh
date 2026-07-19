#!/usr/bin/env bash
# Tier-3 adversarial oracle — YAML deny cases via run-adversarial.py.
# EXEC worktree probes nest under .worktrees/adversarial-probe-* (see runner).
# Traceability (check-threat-model.sh): integration_from_worktree_denied
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

exec python3 "$ROOT/scripts/run-adversarial.py" --scope full --root "$ROOT"
