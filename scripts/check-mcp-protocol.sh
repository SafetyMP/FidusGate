#!/usr/bin/env bash
# Adversarial EXEC probe: MCP 2026-07-28 dual-era + Streamable HTTP header consistency.
# Traceability: mcp_header_body_desync_denied, mcp_protocol_dual_era_ok
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f apps/secure-gateway/dist/mcp-protocol.test.js ]]; then
  (cd apps/secure-gateway && npm run build)
fi

node --test apps/secure-gateway/dist/mcp-protocol.test.js
