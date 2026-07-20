#!/usr/bin/env bash
# EXEC probe: HTTP MCP path blocks fs-mutating tools (MCP03 tool poisoning class).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
HTTP="$ROOT/apps/secure-gateway/src/mcp-http.ts"
SERVER="$ROOT/apps/secure-gateway/src/mcp-server.ts"
require_file "$HTTP"
require_file "$SERVER"
require_pattern "mcp_tool_poisoning" "HTTP_FS_MUTATING_TOOLS" "$HTTP"
require_pattern "mcp_tool_poisoning" "HTTP_FS_MUTATING_TOOLS\.has" "$HTTP"
require_pattern "mcp_tool_poisoning" "tools/list" "$SERVER"
echo "ok: mcp_tool_poisoning_denied"
