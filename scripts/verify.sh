#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "Run npm run bootstrap first" >&2
  exit 1
fi

echo "== verify: build + test =="
npm run build
npm run test

echo "verify: ok"
