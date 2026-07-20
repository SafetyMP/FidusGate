#!/usr/bin/env bash
# EXEC probe: unauthenticated Streamable HTTP MCP must be rejected (MCP07).
set -euo pipefail
# shellcheck source=scripts/probes/_probe-lib.sh
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
FILE="$ROOT/apps/secure-gateway/src/index.ts"
require_file "$FILE"
require_pattern "mcp_unauthenticated_http" "app\.post\('/mcp'.*requireAuth" "$FILE"
require_pattern "mcp_unauthenticated_http" "mcpResource: true" "$FILE"
echo "ok: mcp_unauthenticated_http_denied"
