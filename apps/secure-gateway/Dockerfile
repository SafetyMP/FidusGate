# ==========================================
# Stage 1: Build Workspace
# ==========================================
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /workspace

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy root configs and workspaces package structures for cached installs
COPY package.json package-lock.json tsconfig.json turbo.json ./
COPY packages/core-types/package.json ./packages/core-types/
COPY packages/crypto-utils/package.json ./packages/crypto-utils/
COPY packages/database/package.json ./packages/database/
COPY apps/secure-gateway/package.json ./apps/secure-gateway/

# Clean install all workspaces dependencies
RUN npm ci

# Copy codebase source trees
COPY packages/core-types/src ./packages/core-types/src
COPY packages/core-types/tsconfig.json ./packages/core-types/

COPY packages/crypto-utils/src ./packages/crypto-utils/src
COPY packages/crypto-utils/tsconfig.json ./packages/crypto-utils/

COPY packages/database/src ./packages/database/src
COPY packages/database/tsconfig.json ./packages/database/
COPY packages/database/data ./packages/database/data
COPY packages/database/prisma ./packages/database/prisma

COPY apps/secure-gateway/src ./apps/secure-gateway/src
COPY apps/secure-gateway/tsconfig.json ./apps/secure-gateway/

# Build shared library packages and gateway microservice
RUN npm run build --workspace=@fidusgate/core-types \
    && npm run build --workspace=@fidusgate/crypto-utils \
    && npm run build --workspace=@fidusgate/database \
    && npm run build --workspace=@fidusgate/secure-gateway

# Prune devDependencies to keep runtime modules minimal
RUN npm prune --omit=dev

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner

WORKDIR /workspace

ENV NODE_ENV=production
ENV PORT=3001

# Copy pruned dependencies
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/package.json ./package.json

# Copy compiled shared modules
COPY --from=builder /workspace/packages/core-types/package.json ./packages/core-types/
COPY --from=builder /workspace/packages/core-types/dist ./packages/core-types/dist

COPY --from=builder /workspace/packages/crypto-utils/package.json ./packages/crypto-utils/
COPY --from=builder /workspace/packages/crypto-utils/dist ./packages/crypto-utils/dist

COPY --from=builder /workspace/packages/database/package.json ./packages/database/
COPY --from=builder /workspace/packages/database/dist ./packages/database/dist
COPY --from=builder /workspace/packages/database/data ./packages/database/data

# Copy compiled gateway application
COPY --from=builder /workspace/apps/secure-gateway/package.json ./apps/secure-gateway/
COPY --from=builder /workspace/apps/secure-gateway/dist ./apps/secure-gateway/dist

# Hardened Security: Run as unprivileged node user
USER node

EXPOSE 3001

# Command execution entry point
CMD ["node", "apps/secure-gateway/dist/index.js"]
