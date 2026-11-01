# ECHOLOG — content-addressed object storage as a standalone service.
# Build:  docker build -t echolog .
# Run:    docker run --rm -p 3006:3006 -v echolog-data:/data -e ECHOLOG_GRANT_SECRET=… \
#                -e ECHOLOG_S3_BUCKET=… -e ECHOLOG_S3_ACCESS_KEY_ID=… -e ECHOLOG_S3_SECRET_ACCESS_KEY=… echolog

# --- build -------------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Dependency layer first: the lockfile is the whole truth, no workspace protocol.
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

# --- runtime -----------------------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    ECHOLOG_HOST=0.0.0.0 \
    ECHOLOG_PORT=3006 \
    ECHOLOG_STORAGE_ROOT=/data/echolog \
    ECHOLOG_DATABASE_PATH=/data/echolog/echolog.db

RUN mkdir -p /data/echolog && chown -R node:node /data /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3006
VOLUME ["/data"]

# /health/ready writes and reads a probe file, so it proves the volume works.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.ECHOLOG_PORT||'3006')+'/health/ready').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
