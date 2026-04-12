# Multi-stage build for Koop DuckDB FeatureServer
# Uses node:22-slim (Debian) — DuckDB native binaries require glibc, not musl (Alpine)

# Stage 1: Install production dependencies
FROM node:22-slim AS build
WORKDIR /app

# Copy package files for all workspace packages
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/featureserver/package.json packages/featureserver/
COPY packages/output-geoservices/package.json packages/output-geoservices/
COPY packages/winnow/package.json packages/winnow/
COPY packages/logger/package.json packages/logger/
COPY packages/cache-memory/package.json packages/cache-memory/
COPY packages/geoarrow/package.json packages/geoarrow/
COPY packages/duckdb-spatial/package.json packages/duckdb-spatial/
COPY packages/provider-duckdb/package.json packages/provider-duckdb/

RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:22-slim
WORKDIR /app

# Create non-root user
RUN groupadd -r koop && useradd -r -g koop -m koop

# Copy dependencies and source
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY packages/ ./packages/
COPY server.js ./

# DuckDB needs a writable dir for extension downloads
RUN mkdir -p /tmp/duckdb && chown koop:koop /tmp/duckdb
ENV HOME=/home/koop

EXPOSE 8080

USER koop

CMD ["node", "server.js"]
