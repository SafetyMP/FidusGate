#!/usr/bin/env bash
# DO_NOT_DELETE_STUB_CANARY — Cedar/MCP stub detector for FidusGate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
errors=0
if [[ -f scripts/verify.sh ]] && grep -q 'TODO: add real test' scripts/verify.sh; then
  echo "STUB_CANARY: placeholder verify.sh" >&2
  errors=$((errors + 1))
fi
if command -v rg >/dev/null 2>&1; then
  if rg -q 'allowAll|denyAll|mockCedar.*always' src/ tests/ 2>/dev/null; then
    echo "STUB_CANARY: mock policy stub" >&2
    errors=$((errors + 1))
  fi
fi
if [[ "$errors" -gt 0 ]]; then
  exit 1
fi
echo "check-stub-canary: ok"
