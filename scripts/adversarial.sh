#!/usr/bin/env bash
# Tier-3 adversarial oracle — integration must not run from worktree cwd.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo ""; echo "== adversarial: $* =="; }

WT_DIR="$ROOT/.worktrees/adversarial-probe-$$"
mkdir -p "$WT_DIR"
trap 'rm -rf "$WT_DIR"' EXIT

# deny_case: integration_from_worktree_denied
log "integration_from_worktree_denied (expect failure from worktree cwd)"
set +e
( cd "$WT_DIR" && "$ROOT/scripts/integration-smoke.sh" ) >/tmp/fidus-adversarial.log 2>&1
code=$?
set -e
if [[ "$code" -eq 0 ]]; then
  echo "integration-smoke unexpectedly succeeded from worktree cwd" >&2
  cat /tmp/fidus-adversarial.log >&2
  exit 1
fi
echo "  exit ${code} from worktree (as expected)"

echo ""
echo "adversarial: ok"
