# ==========================================
# Stage 1: Build Workspace
# ==========================================
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /workspace

# Copy root configs and workspaces package structures for cached installs
COPY package.json package-lock.json tsconfig.json turbo.json ./
COPY packages/core-types/package.json ./packages/core-types/
COPY packages/crypto-utils/package.json ./packages/crypto-utils/
COPY apps/admin-dashboard/package.json ./apps/admin-dashboard/

# Clean install workspaces dependencies
RUN npm ci

# Copy codebase source trees
COPY packages/core-types/src ./packages/core-types/src
COPY packages/core-types/tsconfig.json ./packages/core-types/

COPY packages/crypto-utils/src ./packages/crypto-utils/src
COPY packages/crypto-utils/tsconfig.json ./packages/crypto-utils/

COPY apps/admin-dashboard/src ./apps/admin-dashboard/src
COPY apps/admin-dashboard/tsconfig.json ./apps/admin-dashboard/
COPY apps/admin-dashboard/vite.config.ts ./apps/admin-dashboard/
COPY apps/admin-dashboard/index.html ./apps/admin-dashboard/

# Build shared library packages and compile Vite React production bundle
RUN npm run build --workspace=@fidusgate/core-types \
    && npm run build --workspace=@fidusgate/crypto-utils \
    && npm run build --workspace=@fidusgate/admin-dashboard

# ==========================================
# Stage 2: Production Nginx Server
# ==========================================
FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS runner

# Copy compiled static Vite assets to Nginx html root
COPY --from=builder /workspace/apps/admin-dashboard/dist /usr/share/nginx/html

# Copy custom Nginx configuration supporting SPA routing fallbacks and API proxying
COPY apps/admin-dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
