#!/usr/bin/env bash
# EXEC probe: host sandbox fallback defaults off and is forbidden in production (MCP05).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
SANDBOX="$ROOT/scripts/sandbox-execute.sh"
PROFILE="$ROOT/apps/secure-gateway/src/production-profile.ts"
require_file "$SANDBOX"
require_file "$PROFILE"
require_pattern "host_sandbox_fallback" 'FIDUSGATE_ALLOW_HOST_FALLBACK="\$\{FIDUSGATE_ALLOW_HOST_FALLBACK:-false\}"' "$SANDBOX"
require_pattern "host_sandbox_fallback" "host execution fallback is disabled" "$SANDBOX"
require_pattern "host_sandbox_fallback" "FIDUSGATE_ALLOW_HOST_FALLBACK is forbidden in production" "$PROFILE"
echo "ok: host_sandbox_fallback_denied"
