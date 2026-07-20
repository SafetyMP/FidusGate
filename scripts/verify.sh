#!/usr/bin/env bash
# Definition of Done — stub canary + npm ci + lint/test + threat-model.
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

FILTER="${1:-}"
if [[ "$FILTER" == "--filter" ]]; then
  FILTER="${2:-}"
fi

run_if_exists() {
  local script="$1"
  if [[ -x "$script" ]] || [[ -f "$script" ]]; then
    bash "$script"
  fi
}

case "$FILTER" in
  ux-console)
    echo "==> ux-console filter"
    run_if_exists ./scripts/operator-journey-smoke.sh
    ;;
  data-ai)
    echo "==> data-ai filter (covered by npm test ai-firewall/interview/router)"
    ;;
  "" )
    echo "==> production profile + kill-list honesty"
    run_if_exists ./scripts/production-profile-failclosed.sh
    run_if_exists ./scripts/kill-list-honesty-check.sh
    ;;
  *)
    echo "==> unknown filter '$FILTER' (skipped extras)"
    ;;
esac
