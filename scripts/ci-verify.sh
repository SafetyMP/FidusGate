#!/bin/bash
# Local CI/CD Workflow Verification Helper
# Author: Antigravity Code Assistant

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WORKFLOW_DIR="$REPO_ROOT/.github/workflows"

echo "📡 Starting local CI/CD workflow verification audit..."

# 1. Check for Docker daemon
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Error: Docker is not installed! 'act' requires a running Docker daemon."
    exit 1
elif ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker daemon is not running! Please start Docker and try again."
    exit 1
fi
echo "✅ Docker daemon is active."

# 2. Check for act CLI engine
if ! command -v act >/dev/null 2>&1; then
    echo "❌ Error: 'act' (Local CI Engine) is not installed!"
    echo "   👉 Installation Recommendations:"
    echo "      * macOS (Homebrew):  brew install act"
    echo "      * Linux:             curl -sSf https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo sh"
    echo "      * Windows (Scoop):   scoop install act"
    exit 1
fi
echo "✅ 'act' engine is available."

# 3. Check if workflow directory exists and contains yaml files
if [ ! -d "$WORKFLOW_DIR" ] || [ -z "$(ls -A "$WORKFLOW_DIR" 2>/dev/null | grep -E '\.(yml|yaml)$')" ]; then
    echo "❌ Error: No GitHub Actions workflow files (*.yml or *.yaml) found in $WORKFLOW_DIR!"
    exit 1
fi
echo "✅ Workflow files discovered under .github/workflows/"

# 4. Construct execution arguments
ARGS=()

# Check for custom secrets or environment files
if [ -f "$REPO_ROOT/.secrets" ]; then
    echo "🔑 Found local .secrets file. Emulating with simulated secrets."
    ARGS+=("--secret-file" "$REPO_ROOT/.secrets")
fi

if [ -f "$REPO_ROOT/.env" ]; then
    echo "📝 Found local .env file. Emulating with simulated environment variables."
    ARGS+=("--env-file" "$REPO_ROOT/.env")
fi

# 5. Handle command-line arguments
if [ $# -eq 0 ]; then
    # Default behavior is a dry-run check of the syntax and execution graph
    echo "ℹ️  No specific arguments provided. Performing a dry-run syntax check..."
    echo "🚀 Executing: act -n"
    act -n "${ARGS[@]}"
else
    echo "🚀 Executing: act $*"
    act "$@" "${ARGS[@]}"
fi

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    echo "🎉 Local CI/CD pipeline emulations completed successfully!"
else
    echo "❌ Error: Local pipeline execution failed with exit code $EXIT_CODE."
fi

exit $EXIT_CODE
