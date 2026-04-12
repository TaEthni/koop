# Multi-stage build for Koop DuckDB FeatureServer
# Uses node:22-bookworm (full Debian) — DuckDB's statically linked SSL
# needs the full system CA bundle + OpenSSL libs to connect to Azure/S3/GCS.
# node:22-slim lacks these and causes "Problem with the SSL CA cert" errors.

# Stage 1: Install dependencies and pre-warm DuckDB extensions
FROM node:22-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY server.js ./

# --ignore-scripts skips the "prepare" hook (husky install)
RUN npm ci --omit=dev --ignore-scripts

# Pre-install DuckDB extensions — baked into image, no runtime downloads
RUN node -e " \
  const { DuckDBInstance } = require('@duckdb/node-api'); \
  (async () => { \
    const db = await DuckDBInstance.create(':memory:'); \
    const conn = await db.connect(); \
    await conn.run('INSTALL spatial'); \
    await conn.run('INSTALL httpfs'); \
    await conn.run('INSTALL azure'); \
    await conn.run('INSTALL iceberg'); \
    await conn.run('INSTALL delta'); \
    console.log('DuckDB extensions installed'); \
  })(); \
"

# Stage 2: Production image
FROM node:22-bookworm
WORKDIR /app

RUN groupadd -r koop && useradd -r -g koop -m koop

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/server.js ./
COPY --from=build /root/.duckdb /home/koop/.duckdb

RUN chown -R koop:koop /home/koop/.duckdb
ENV HOME=/home/koop

EXPOSE 8080
USER koop
CMD ["node", "server.js"]
