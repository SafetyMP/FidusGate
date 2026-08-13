#!/usr/bin/env bash
# Install cedar-policy-cli for policy validation in CI.
set -euo pipefail

CEDAR_CLI_VERSION="${CEDAR_CLI_VERSION:-4.11.1}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found; install Rust (https://rustup.rs) before running this script" >&2
  exit 1
fi

cargo install cedar-policy-cli \
  --version "${CEDAR_CLI_VERSION}" \
  --locked

cedar --version
