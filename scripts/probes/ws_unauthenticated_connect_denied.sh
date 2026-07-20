#!/usr/bin/env bash
# EXEC probe: production WebSocket telemetry rejects unauthenticated connects (MCP07).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
FILE="$ROOT/apps/secure-gateway/src/index.ts"
require_file "$FILE"
require_pattern "ws_unauthenticated_connect" "WS_AUTH: unauthenticated WebSocket rejected" "$FILE"
require_pattern "ws_unauthenticated_connect" "isProductionRuntime" "$FILE"
require_pattern "ws_unauthenticated_connect" "socket\.close\(1008" "$FILE"
echo "ok: ws_unauthenticated_connect_denied"
