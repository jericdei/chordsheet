# syntax=docker/dockerfile:1
# One Dockerfile, three targets: `web`, `realtime`, `migrate`.

ARG BUN_VERSION=1.3.14

# ---------- install workspace dependencies ----------
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/music/package.json packages/music/
COPY packages/realtime/package.json packages/realtime/
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd packages/db generate
RUN bun run --cwd apps/web build
RUN bun build apps/realtime/src/server.ts --target=bun --minify --outfile=dist/realtime.js

# ---------- database migrations (one-shot) ----------
FROM build AS migrate
CMD ["bun", "run", "--cwd", "packages/db", "migrate:deploy"]

# ---------- realtime websocket server ----------
FROM oven/bun:${BUN_VERSION}-slim AS realtime
WORKDIR /app
ENV NODE_ENV=production REALTIME_PORT=3001
COPY --from=build /app/dist/realtime.js ./realtime.js
USER bun
EXPOSE 3001
CMD ["bun", "realtime.js"]

# ---------- Next.js web app ----------
# Built with Bun above; the standalone Next.js server itself runs on Node, the runtime
# Next.js officially supports. Chromium prints the /print pages to PDF, so exported sheets
# render exactly like the editor.
FROM node:24-slim AS web
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
  CHROMIUM_PATH=/usr/bin/chromium
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
