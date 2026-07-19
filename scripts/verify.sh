#!/usr/bin/env bash
# Definition of Done — stub canary + npm ci + lint/test + threat-model.
# Invoked by stop hook and CI verify job (.github/workflows/ci.yml).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -x ./scripts/check-stub-canary.sh ]]; then
  ./scripts/check-stub-canary.sh
fi

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare npm@10.9.2 --activate >/dev/null 2>&1 || true
fi

echo "==> npm ci (expect packageManager npm@10.9.2)"
npm ci

echo "==> lint + test"
npm run lint
npm run test

echo "verify: ok (ci/web parity)"

if [[ -f ./scripts/check-threat-model.sh ]]; then
  echo "==> threat model gate"
  bash ./scripts/check-threat-model.sh
fi
