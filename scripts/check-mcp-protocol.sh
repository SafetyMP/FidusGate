#!/usr/bin/env bash
# Adversarial EXEC probe: MCP 2026-07-28 dual-era + Streamable HTTP header consistency.
# Traceability: mcp_header_body_desync_denied, mcp_protocol_dual_era_ok
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Integration CI only runs npm ci — build workspace deps before compiling the gateway.
if [[ ! -f apps/secure-gateway/dist/mcp-protocol.test.js ]]; then
  if command -v npx >/dev/null 2>&1 && [[ -f package.json ]]; then
    npx turbo run build --filter=@fidusgate/secure-gateway...
  else
    (cd apps/secure-gateway && npm run build)
  fi
fi

node --test apps/secure-gateway/dist/mcp-protocol.test.js
