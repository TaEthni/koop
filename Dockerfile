# Multi-stage build for Koop DuckDB FeatureServer
# Uses node:22-slim (Debian) — DuckDB native binaries require glibc, not musl (Alpine)

# Stage 1: Install dependencies
FROM node:22-slim AS build
WORKDIR /app

# Copy everything needed for npm ci (workspace structure must exist)
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY server.js ./

# --ignore-scripts skips the "prepare" hook (husky install) which
# requires devDependencies not present with --omit=dev
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: Production image
FROM node:22-slim
WORKDIR /app

# Create non-root user
RUN groupadd -r koop && useradd -r -g koop -m koop

# Copy app with resolved dependencies
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/server.js ./

# DuckDB needs a writable dir for extension downloads
RUN mkdir -p /tmp/duckdb && chown koop:koop /tmp/duckdb
ENV HOME=/home/koop

EXPOSE 8080

USER koop

CMD ["node", "server.js"]
