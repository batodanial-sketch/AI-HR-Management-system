# Fluxentiq — Next.js web app image (standalone output)
# ---------------------------------------------------------------------------
# Multi-stage build using Next.js `output: "standalone"` so the runner ships
# only the traced server bundle + static assets (image < 150 MB), not the full
# node_modules tree.
#
# Stages:
#   base   — node:20-alpine + build toolchain (better-sqlite3 native build)
#   deps   — `npm ci` (cached layer)
#   build  — `next build` → .next/standalone
#   runner — minimal runtime (node:20-alpine) + curl for healthchecks

FROM node:20-alpine AS base
# better-sqlite3 (optional local-memory backend) compiles from source on alpine.
RUN apk add --no-cache python3 make g++
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# curl is required by the Docker healthcheck.
RUN apk add --no-cache curl

WORKDIR /app

# Standalone server bundle (server.js + traced node_modules).
COPY --from=build /app/.next/standalone ./
# Static assets + public files are NOT included in standalone output by Next.js.
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# better-sqlite3 is dynamically `require`d (memory adapter), so Next's output
# tracing misses it — copy it (and its `bindings` dep) so the optional local
# SQLite memory backend keeps working in the container.
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Runtime config + local memory live in /app/data (mounted as a volume).
RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
