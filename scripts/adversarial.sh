#!/usr/bin/env bash
# Tier-3 adversarial oracle — YAML deny cases via run-adversarial.py.
# Traceability (check-threat-model.sh) — deny_case ids must appear in this file:
#   integration_from_worktree_denied
#   mcp_header_body_desync_denied
#   mcp_unauthenticated_http_denied
#   mcp_tool_poisoning_denied
#   mcp_command_injection_denied
#   unsigned_policy_reload_denied
#   kms_missing_fail_closed
#   json_db_fallback_denied
#   host_sandbox_fallback_denied
#   ws_unauthenticated_connect_denied
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

exec python3 "$ROOT/scripts/run-adversarial.py" --scope full --root "$ROOT"
