#!/usr/bin/env bash
# EXEC probe: production forbids JSON datastore fallback (MCP01 / CR-11).
set -euo pipefail
source "$(dirname "$0")/_probe-lib.sh"
ROOT="$(probe_root)"
DB="$ROOT/packages/database/src/index.ts"
PROFILE="$ROOT/apps/secure-gateway/src/production-profile.ts"
require_file "$DB"
require_file "$PROFILE"
# Fail-closed production gate (helper + hard error strings).
require_pattern "json_db_fallback" "isProductionRuntime" "$DB"
require_pattern "json_db_fallback" "JSON persistence is disabled in production" "$DB"
require_pattern "json_db_fallback" "DATABASE_URL is required in production" "$DB"
# Non-production must not silently degrade when DATABASE_URL is set.
require_pattern "json_db_fallback" "FIDUSGATE_ALLOW_JSON_FALLBACK" "$DB"
require_pattern "json_db_fallback" "JSON fallback blocked while DATABASE_URL is set" "$DB"
require_pattern "json_db_fallback" "JSON datastore fallback forbidden" "$PROFILE"
echo "ok: json_db_fallback_denied"
