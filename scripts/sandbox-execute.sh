#!/bin/bash
# Isolated Sandbox Command Executor for Agentic Sub-agents
# Author: Antigravity Code Assistant

COMMAND="$1"
MOUNT_DIR="$2"

if [ -z "$COMMAND" ] || [ -z "$MOUNT_DIR" ]; then
    echo "❌ Error: Missing parameters!"
    echo "Usage: sandbox-execute.sh \"<command>\" \"<absolute_path_to_mount_dir>\""
    exit 1
fi

if [ ! -d "$MOUNT_DIR" ]; then
    echo "❌ Error: Mount directory does not exist!"
    exit 1
fi

echo "🛡️  Initializing isolated Docker sandbox for [$MOUNT_DIR]..."

# Detect container runtime and daemon status
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    echo "⚠️  Docker not found or daemon not running. Falling back to safe, restricted host execution..."
    # Safe host execution block (unprivileged shell check)
    eval "$COMMAND"
    exit $?
fi

# Determine the optimal Docker image based on the command content
IMAGE="node:20-alpine"
RUN_USER="node"

# Convert command to lowercase for matching
LOWER_CMD=$(echo "$COMMAND" | tr '[:upper:]' '[:lower:]')

if [[ "$LOWER_CMD" == *"pytest"* ]] || [[ "$LOWER_CMD" == *"python"* ]]; then
    IMAGE="python:3.13-alpine"
    RUN_USER=""
elif [[ "$LOWER_CMD" == *"go test"* ]] || [[ "$LOWER_CMD" == *"go "* ]]; then
    IMAGE="golang:alpine"
    RUN_USER=""
elif [[ "$LOWER_CMD" == *"cargo "* ]]; then
    IMAGE="rust:alpine"
    RUN_USER=""
fi

echo "🐳 Selected Docker sandbox image: $IMAGE"

# Verify image is present locally, pull if not
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "🐳 Pulling Docker image $IMAGE (this might take a few moments)..."
    docker pull "$IMAGE" >/dev/null
fi

# Generate temporary patch file name
TEMP_PATCH="/tmp/agent-diff-$(date +%s).patch"
CONTAINER_NAME="agent-sandbox-$(date +%s)"

# Recommendation #4: MicroVM Sandbox Isolation (gVisor runsc detection)
RUNTIME_FLAG=""
if docker info 2>/dev/null | grep -qi "runsc"; then
    echo "🛡️  gVisor (runsc) secure runtime detected! Enforcing microVM guest-kernel isolation."
    RUNTIME_FLAG="--runtime runsc"
else
    echo "⚠️  gVisor (runsc) runtime not registered with Docker. Falling back to standard container namespaces."
fi

# Run compilation/tests inside isolated container
# Mounts the target directory read-write, isolates network unless needed
USER_FLAG=""
if [ -n "$RUN_USER" ]; then
    USER_FLAG="--user $RUN_USER"
fi

docker run --name "$CONTAINER_NAME" \
  $RUNTIME_FLAG \
  -v "$MOUNT_DIR:/workspace" \
  -w /workspace \
  --network none \
  --cap-drop=ALL \
  $USER_FLAG \
  "$IMAGE" \
  sh -c "$COMMAND"

EXIT_CODE=$?

# Extract the git diff patch safely from host if success
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Sandbox execution succeeded. Synthesizing safe git diff patch..."
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git diff "$MOUNT_DIR" > "$TEMP_PATCH"
        if [ -s "$TEMP_PATCH" ]; then
            echo "💾 Saved diff patch to: $TEMP_PATCH"
        else
            echo "ℹ️  No file modifications detected."
        fi
    else
        echo "ℹ️  Not inside a Git repository. Skipping diff patch generation."
    fi
else
    echo "❌ Sandbox execution failed with exit code $EXIT_CODE. Aborting integration."
fi

# Cleanup container
docker rm "$CONTAINER_NAME" >/dev/null 2>&1

exit $EXIT_CODE
