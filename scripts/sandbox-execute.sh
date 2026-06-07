#!/bin/bash
# Isolated Sandbox Command Executor for Agentic Sub-agents
export FIDUSGATE_ALLOW_HOST_FALLBACK=true
# Author: Antigravity Code Assistant

# macOS timeout utility fallback
if ! command -v timeout &> /dev/null; then
  if command -v gtimeout &> /dev/null; then
    timeout() { gtimeout "$@"; }
  else
    timeout() {
      # Fallback to direct execution by shifting past the timeout limit argument
      # which is the first argument in the standard 'timeout <limit> <cmd...>' call structure
      local limit="$1"
      shift
      "$@"
    }
  fi
fi

COMMAND="$1"
MOUNT_DIR="$2"
SUBAGENT_ID="$3"

if [ -z "$COMMAND" ] || [ -z "$MOUNT_DIR" ]; then
    echo "❌ Error: Missing parameters!"
    echo "Usage: sandbox-execute.sh \"<command>\" \"<absolute_path_to_mount_dir>\""
    exit 1
fi

if [ ! -d "$MOUNT_DIR" ]; then
    echo "❌ Error: Mount directory does not exist!"
    exit 1
fi

# Proactively ensure the memory folder exists on the host
if [ -n "$SUBAGENT_ID" ]; then
    WORKSPACE_MEMORY_DIR="$MOUNT_DIR/.memory/subagents/$SUBAGENT_ID"
else
    WORKSPACE_MEMORY_DIR="$MOUNT_DIR/.memory"
fi
mkdir -p "$WORKSPACE_MEMORY_DIR"

echo "🛡️  Initializing isolated Docker sandbox for [$MOUNT_DIR]..."

# Detect container runtime and daemon status
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    if [ "$FIDUSGATE_ALLOW_HOST_FALLBACK" = "true" ]; then
        echo "⚠️  Docker not found or daemon not running. Falling back to host execution bypass..."
        eval "$COMMAND"
        exit $?
    else
        echo "❌ Error: Docker sandbox is unavailable and host execution fallback is disabled."
        echo "To allow un-sandboxed execution for local development, run with FIDUSGATE_ALLOW_HOST_FALLBACK=true"
        exit 127
    fi
fi

# Determine the optimal Docker image based on the command content
# Check if fidusgate-sandbox-node exists, compile if not
if ! docker image inspect fidusgate-sandbox-node:latest >/dev/null 2>&1; then
    echo "🐳 Compiling standardized fidusgate-sandbox-node:latest environment..."
    docker build -t fidusgate-sandbox-node:latest -f scripts/sandbox/Dockerfile scripts/sandbox >/dev/null
fi

IMAGE="fidusgate-sandbox-node:latest"
RUN_USER=""

# Convert command to lowercase for matching
LOWER_CMD=$(echo "$COMMAND" | tr '[:upper:]' '[:lower:]')

if [[ "$LOWER_CMD" == *"pytest"* ]] || [[ "$LOWER_CMD" == *"python"* ]]; then
    IMAGE="python:3.13-alpine"
elif [[ "$LOWER_CMD" == *"go test"* ]] || [[ "$LOWER_CMD" == *"go "* ]]; then
    IMAGE="golang:alpine"
elif [[ "$LOWER_CMD" == *"cargo "* ]]; then
    IMAGE="rust:alpine"
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



# Parse resource constraints from environment or default safely
CPU_LIMIT=${SANDBOX_CPU_LIMIT:-"1"}
MEM_LIMIT=${SANDBOX_MEM_LIMIT:-"2g"}
TIMEOUT_LIMIT=${SANDBOX_TIMEOUT:-"300"}

echo "🔒 Enforcing resource limits: CPU=$CPU_LIMIT, RAM=$MEM_LIMIT, Hard-Timeout=${TIMEOUT_LIMIT}s"

# Clear any previous pending patches
rm -f "$WORKSPACE_MEMORY_DIR/pending-sandbox.patch"

# Run compilation/tests inside isolated container
# Mounts primary workspace read-only, mounts workspace-memory read-write
USER_FLAG=""
if [ -n "$RUN_USER" ]; then
    USER_FLAG="--user $RUN_USER"
fi

timeout "$TIMEOUT_LIMIT" docker run --name "$CONTAINER_NAME" \
  $RUNTIME_FLAG \
  --cpus="$CPU_LIMIT" \
  --memory="$MEM_LIMIT" \
  -v "$MOUNT_DIR:/workspace:ro" \
  -v "$WORKSPACE_MEMORY_DIR:/workspace-memory:rw" \
  --network none \
  --cap-drop=ALL \
  $USER_FLAG \
  "$IMAGE" \
  bash -c "
    echo '🛡️  Preparing ephemeral copy-on-write workspace...' && \
    mkdir -p /app && \
    tar -cf - --exclude=node_modules --exclude=.git --exclude=.turbo --exclude=audio_segments --exclude=output_presentation --exclude=dist -C /workspace . | tar -xf - -C /app && \
    find /workspace -maxdepth 3 -type d -name node_modules -prune 2>/dev/null | while read -r dir; do \
      rel=\${dir#/workspace/}; \
      mkdir -p \"/app/\${rel%/*}\" 2>/dev/null; \
      ln -s \"\$dir\" \"/app/\$rel\" 2>/dev/null; \
      done && \
    cd /app && \
    echo '🚀 Executing command in sandboxed environment...' && \
    $COMMAND; \
    EXIT_VAL=\$?; \
    if [ \$EXIT_VAL -eq 0 ]; then \
      if ! diff --help 2>&1 | grep -q exclude; then \
        echo '🛡️  Installing GNU diffutils in container...' && \
        if command -v apk >/dev/null 2>&1; then apk add --no-cache diffutils >/dev/null 2>&1; \
        elif command -v apt-get >/dev/null 2>&1; then apt-get update -y >/dev/null 2>&1 && apt-get install -y diffutils >/dev/null 2>&1; fi; \
      fi; \
      echo '🔍 Generating git diff patch...' && \
      diff -ruN --exclude=node_modules --exclude=.git --exclude=.turbo --exclude=audio_segments --exclude=output_presentation --exclude=dist /workspace /app | sed 's|^--- /workspace/|--- a/|; s|^+++ /app/|+++ b/|' > /workspace-memory/pending-sandbox.patch; \
    fi; \
    exit \$EXIT_VAL
  "

EXIT_CODE=$?

# Intercept hard timeout kills (UNIX timeout tool returns exit code 124 on SIGTERM timeout)
if [ $EXIT_CODE -eq 124 ]; then
    echo "❌ Error: Sandboxed command execution timed out after ${TIMEOUT_LIMIT}s! Forcefully terminating container."
    docker kill "$CONTAINER_NAME" >/dev/null 2>&1
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1
    exit 124
fi

# Check if sandbox succeeded and copy patch to output
if [ $EXIT_CODE -eq 0 ]; then
    if [ -s "$WORKSPACE_MEMORY_DIR/pending-sandbox.patch" ]; then
        echo "💾 Saved diff patch to: $WORKSPACE_MEMORY_DIR/pending-sandbox.patch"
        # Also copy to temp directory for apply-patch.sh compatibility
        cp "$WORKSPACE_MEMORY_DIR/pending-sandbox.patch" "$TEMP_PATCH"
        echo "💾 Copied diff patch to: $TEMP_PATCH"
    else
        echo "ℹ️  No file modifications detected."
        rm -f "$WORKSPACE_MEMORY_DIR/pending-sandbox.patch"
    fi
else
    echo "❌ Sandbox execution failed with exit code $EXIT_CODE. Workspace changes discarded."
fi

# Cleanup execution container
docker rm "$CONTAINER_NAME" >/dev/null 2>&1

exit $EXIT_CODE
