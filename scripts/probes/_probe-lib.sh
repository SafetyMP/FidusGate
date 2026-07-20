#!/usr/bin/env bash
# Shared helpers for ADR-0006 static security probes (no live HTTP required).
set -euo pipefail

probe_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

require_pattern() {
  local label="$1"
  local pattern="$2"
  local file="$3"
  # Prefer ripgrep when present; fall back to grep so CI runners without rg work.
  if command -v rg >/dev/null 2>&1; then
    if ! rg -q "$pattern" "$file"; then
      echo "FAIL [$label]: pattern not found in $file" >&2
      echo "  want: $pattern" >&2
      exit 1
    fi
  elif ! grep -EEq "$pattern" "$file"; then
    echo "FAIL [$label]: pattern not found in $file" >&2
    echo "  want: $pattern" >&2
    exit 1
  fi
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "FAIL: missing file $path" >&2
    exit 1
  fi
}
