# =============================================================================
# Multi-stage Dockerfile for freemoviesuggestion
# Target platform: Cloudflare Workers (SSR via @astrojs/cloudflare)
# IMPORTANT: Uses Debian base — Alpine is incompatible with
# @cloudflare/workerd-linux-64 (glibc binary).
# =============================================================================

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Set DNS resolution order to prefer IPv4 (fixes workerd prerender fetch in Docker)
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

RUN npm run build

# ─── Runner — local preview via wrangler dev ─────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
    ca-certificates \
    openssl \
    tini \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/astro.config.mjs ./astro.config.mjs
COPY --from=builder /app/wrangler.json ./wrangler.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:4321 || exit 1

ENTRYPOINT ["tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", "4321", "--ip", "0.0.0.0"]
