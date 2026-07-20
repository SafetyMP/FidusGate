#!/usr/bin/env bash
# EXEC probe: production forbids JSON datastore fallback (MCP01 / CR-11).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
DB="$ROOT/packages/database/src/index.ts"
PROFILE="$ROOT/apps/secure-gateway/src/production-profile.ts"
require_file "$DB"
require_file "$PROFILE"
require_pattern "json_db_fallback" "production && !process\.env\.DATABASE_URL" "$DB"
require_pattern "json_db_fallback" "JSON fallback forbidden" "$DB"
require_pattern "json_db_fallback" "JSON datastore fallback forbidden" "$PROFILE"
echo "ok: json_db_fallback_denied"
