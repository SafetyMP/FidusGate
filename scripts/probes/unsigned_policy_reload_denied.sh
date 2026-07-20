#!/usr/bin/env bash
# EXEC probe: programmatic Cedar reload requires authenticated admin/auditor (MCP07).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
FILE="$ROOT/apps/secure-gateway/src/index.ts"
require_file "$FILE"
require_pattern "unsigned_policy_reload" "app\.post\('/api/policy/reload', requireAuth\(\['admin', 'auditor'\]\)" "$FILE"
echo "ok: unsigned_policy_reload_denied"
