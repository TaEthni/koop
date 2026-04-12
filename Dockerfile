# Multi-stage build for Koop DuckDB FeatureServer
# Uses node:22-slim (Debian) — DuckDB native binaries require glibc, not musl (Alpine)

# Stage 1: Install dependencies and pre-warm DuckDB extensions
FROM node:22-slim AS build
WORKDIR /app

# Copy everything needed for npm ci (workspace structure must exist)
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY server.js ./

# --ignore-scripts skips the "prepare" hook (husky install) which
# requires devDependencies not present with --omit=dev
RUN npm ci --omit=dev --ignore-scripts

# Pre-install DuckDB extensions so they're baked into the image.
# No cold-start download needed at runtime.
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
FROM node:22-slim
WORKDIR /app

# Install CA certificates (required for DuckDB HTTPS/Azure connections)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r koop && useradd -r -g koop -m koop

# Copy app with resolved dependencies
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/server.js ./

# Copy pre-installed DuckDB extensions from build stage
COPY --from=build /root/.duckdb /home/koop/.duckdb

RUN chown -R koop:koop /home/koop/.duckdb
ENV HOME=/home/koop

EXPOSE 8080

USER koop

CMD ["node", "server.js"]
