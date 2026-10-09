# syntax=docker/dockerfile:1.7
# Creator Network — production image (single Node.js process: API + WebSockets + built web app).
#
#   docker compose build            (see docker-compose.yml and docs/DEPLOYMENT.md)
#
# The base image is a build argument so mirrors can be used where Docker Hub is rate limited.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

# ---------------------------------------------------------------- build stage
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# The native modules (better-sqlite3, argon2) ship prebuilt binaries for linux x64/arm64
# (glibc and musl) inside their npm packages, so no compiler toolchain is needed and
# dependency install scripts are not run at all (--ignore-scripts).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Optional: behind a TLS-intercepting proxy, pass its CA as a build secret
# (docker build --secret id=build_ca,src=/path/ca.crt …). It is never stored in a layer.
RUN --mount=type=secret,id=build_ca,required=false \
  if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
  npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN npm run build

# ------------------------------------------------- production dependencies only
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Only the server's runtime dependencies (the web app is static files, shared code is bundled).
RUN --mount=type=secret,id=build_ca,required=false \
  if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
  npm ci --omit=dev --ignore-scripts --workspace @creator-network/server --no-audit --no-fund && npm cache clean --force
# Fail the build early if no prebuilt native binary matches this platform.
RUN node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get(); require('argon2'); console.log('native modules OK')"

# ---------------------------------------------------------------- runtime stage
FROM ${NODE_IMAGE} AS runtime
# V8 otherwise sizes its young generation from the host's total RAM (≈270 MB idle RSS on a
# 16 GB host instead of ≈130 MB); 16 MB semi-spaces keep the footprint predictable.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    BACKUP_DIR=/app/backups \
    NODE_OPTIONS=--max-semi-space-size=16
WORKDIR /app
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/package.json ./package.json
COPY --from=build --chown=root:root /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=root:root /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=root:root /app/apps/web/dist ./apps/web/dist
# Application code is read-only for the runtime user; only data/ and backups/ are writable.
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
USER node
EXPOSE 3000
VOLUME ["/app/data", "/app/backups"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/server/dist/main.js"]
