#!/usr/bin/env bash
# EXEC probe: production boot fails closed without KMS configuration (MCP01).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
PROFILE="$ROOT/apps/secure-gateway/src/production-profile.ts"
INDEX="$ROOT/apps/secure-gateway/src/index.ts"
require_file "$PROFILE"
require_file "$INDEX"
require_pattern "kms_missing_fail_closed" "KMS_PROVIDER" "$PROFILE"
require_pattern "kms_missing_fail_closed" "no silent local key fallback" "$PROFILE"
require_pattern "kms_missing_fail_closed" "assertProductionPrerequisites" "$INDEX"
echo "ok: kms_missing_fail_closed"
