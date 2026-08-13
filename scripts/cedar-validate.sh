#!/usr/bin/env bash
# Official cedar validate against policy.cedarschema (FO-006 / GHSA-jqc6-6pxv-g2ww).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v cedar >/dev/null 2>&1; then
  if [[ "${REQUIRE_CEDAR_CLI:-}" == "true" ]]; then
    echo "cedar CLI not installed (run scripts/install-cedar-cli.sh)" >&2
    exit 1
  fi
  echo "cedar CLI not installed; skipping cedar validate (install for local policy gate)"
  exit 0
fi

echo "cedar validate --schema policy.cedarschema --policies policy.cedar"
cedar validate --schema policy.cedarschema --policies policy.cedar
echo "cedar validate: ok"
