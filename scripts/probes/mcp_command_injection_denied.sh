#!/usr/bin/env bash
# EXEC probe: execute_command routes through isCommandLineSecure (MCP05).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
AUDITOR="$ROOT/apps/secure-gateway/src/command-auditor.ts"
SERVER="$ROOT/apps/secure-gateway/src/mcp-server.ts"
require_file "$AUDITOR"
require_file "$SERVER"
require_pattern "mcp_command_injection" "export function isCommandLineSecure" "$AUDITOR"
require_pattern "mcp_command_injection" "forbiddenChars" "$AUDITOR"
require_pattern "mcp_command_injection" "isCommandLineSecure" "$SERVER"
echo "ok: mcp_command_injection_denied"
