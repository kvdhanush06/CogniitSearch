# =============================================================================
# CogniitSearch — Frontend Dockerfile
# -----------------------------------------------------------------------------
# Multi-stage build:
#   1. deps    — install all dependencies (needed for the Vite build)
#   2. build   — type-check and bundle the SPA with Vite
#   3. runtime — tiny `nginx:alpine` serving the static dist/ with a small
#                server config that reverse-proxies /api/* to the backend.
#
# In the Linode deploy, the host nginx terminates TLS and forwards /api/* to
# the backend container; this in-container nginx just serves the SPA.
# =============================================================================

# ---------- Stage 1: dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Stage 2: build ----------
FROM node:20-alpine AS build
WORKDIR /app

ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts ./
COPY index.html ./
COPY components.json tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public

# Vite reads VITE_API_URL, VITE_API_PREFIX, VITE_APP_URL from the build env.
# In production these point to "" (relative origin) so the SPA uses the
# host nginx's /api/* proxy.
ARG VITE_API_URL=""
ARG VITE_API_PREFIX=/api/v1
ARG VITE_APP_URL=https://cogniitsearch.allkvd.dev
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_PREFIX=$VITE_API_PREFIX
ENV VITE_APP_URL=$VITE_APP_URL

RUN npm run build

# ---------- Stage 3: runtime (nginx) ----------
FROM nginx:1.27-alpine AS runtime

# Drop the default config; ship a minimal one.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
