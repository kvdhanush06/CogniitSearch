# =============================================================================
# CogniitSearch — Backend Dockerfile
# -----------------------------------------------------------------------------
# Multi-stage build:
#   1. deps        — install all dependencies (dev + prod) for the build
#   2. build       — compile TypeScript to dist/ using tsc
#   3. runtime     — slim production image with prod deps only, runs as non-root
#
# Two Node processes run in the runtime container via `npm-run-all`:
#   - API    : node dist/server.js         (Express, port 4000)
#   - workers: node dist/workers/run.js    (BullMQ, shares Redis with API)
# =============================================================================

# ---------- Stage 1: dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Install with the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Stage 2: build ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Create a non-root user for the runtime.
RUN addgroup -S app && adduser -S app -G app

# Re-install ONLY production deps for the runtime image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy compiled JS + type stubs.
COPY --from=build /app/dist ./dist
# Copy any runtime-only assets if they exist (none today, but keeps the
# Dockerfile resilient to future additions like a `public/` folder).
COPY --from=build /app/src ./src

# Hand ownership to the non-root user.
RUN chown -R app:app /app
USER app

# Expose the API port.
EXPOSE 4000

# Healthcheck — the /health endpoint also reports queue stats.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

# Default command runs API + workers in parallel (npm-run-all -p).
CMD ["npm", "run", "start:all"]
