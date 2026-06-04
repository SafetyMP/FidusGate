#!/bin/bash
# Patch Auditing & Application Utility
# Author: Antigravity Code Assistant

echo "💾 Searching for the latest sandboxed diff patch..."

# Locate the most recent patch file in /tmp/
LATEST_PATCH=$(ls -t /tmp/agent-diff-*.patch 2>/dev/null | head -n 1)

if [ -z "$LATEST_PATCH" ]; then
    # Fallback to local workspace memory patch
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    WORKSPACE_PATCH="$REPO_ROOT/.memory/pending-sandbox.patch"
    if [ -f "$WORKSPACE_PATCH" ]; then
        LATEST_PATCH="$WORKSPACE_PATCH"
        echo "ℹ️  No patch found in /tmp/. Falling back to workspace memory patch: $LATEST_PATCH"
    else
        echo "❌ Error: No sandboxed diff patch file found in /tmp/ or .memory/!"
        echo "   Ensure you have executed a sandbox command that made file modifications."
        exit 1
    fi
fi

echo "📁 Found latest patch: $LATEST_PATCH"
echo "────────────────────────────────────────────────────────────────────────────────"
echo -e "\033[1;36mPreviewing changes:\033[0m"

# Print colored diff preview
if command -v colordiff >/dev/null 2>&1; then
    colordiff < "$LATEST_PATCH"
else
    # Simple shell fallback colorizer for basic readability
    while IFS= read -r line; do
        if [[ "$line" =~ ^\+([^+]|$) ]]; then
            echo -e "\033[32m$line\033[0m" # Green for additions
        elif [[ "$line" =~ ^-([^-]|$) ]]; then
            echo -e "\033[31m$line\033[0m" # Red for deletions
        elif [[ "$line" =~ ^@@ ]]; then
            echo -e "\033[35m$line\033[0m" # Magenta for line numbers
        else
            echo "$line"
        fi
    done < "$LATEST_PATCH"
fi

echo "────────────────────────────────────────────────────────────────────────────────"
echo -n "👉 Do you want to apply this patch to the workspace? (y/N): "
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "⚙️  Applying patch via 'git apply'..."
    git apply "$LATEST_PATCH"
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Patch applied successfully to the workspace!"
        # Keep patch as backup, rename with timestamp or delete
        mv "$LATEST_PATCH" "${LATEST_PATCH}.applied"
        echo "💾 Archived patch to: ${LATEST_PATCH}.applied"
    else
        echo "❌ Error: git apply failed with exit code $EXIT_CODE."
        exit 1
    fi
else
    echo "⚠️  Patch application cancelled by user."
fi

exit 0
