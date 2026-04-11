# TaEthni Koop Fork

## Overview

Fork of [koopjs/koop](https://github.com/koopjs/koop) with three enhancements:

1. **`@koopjs/provider-geoparquet`** — Serve GeoParquet files as ArcGIS FeatureServer endpoints, powered by DuckDB
2. **`@koopjs/geoarrow`** — GeoArrow columnar encoding medium for the Koop pipeline (replaces GeoJSON as internal data format)
3. **HTML query forms** — ArcGIS Server-style HTML interface for the FeatureServer query/layer info endpoints

## Repository Structure

This is an npm workspaces monorepo. New packages added by this fork:

| Package | Path | Purpose |
|---------|------|---------|
| `@koopjs/provider-geoparquet` | `packages/provider-geoparquet/` | DuckDB-powered GeoParquet provider — reads from local, HTTP, S3, Azure Blob, GCS |
| `@koopjs/geoarrow` | `packages/geoarrow/` | GeoArrow ↔ GeoJSON conversion, Arrow IPC serialization, pipeline medium |

Existing upstream packages (maintained):

| Package | Path | Purpose |
|---------|------|---------|
| `@koopjs/koop-core` | `packages/core/` | Main Koop module, Express server, plugin registration |
| `@koopjs/featureserver` | `packages/featureserver/` | GeoServices spec — query engine, PBF/JSON/GeoJSON responses |
| `@koopjs/output-geoservices` | `packages/output-geoservices/` | FeatureServer output plugin (routes, auth, HTML forms) |
| `@koopjs/winnow` | `packages/winnow/` | SQL-like filters on GeoJSON (alasql, turf) |
| `@koopjs/logger` | `packages/logger/` | Winston-based logging |
| `@koopjs/cache-memory` | `packages/cache-memory/` | Default in-memory cache |

## Architecture

```
Client (browser / ArcGIS Pro / AGOL)
  ↓ HTTP
Koop (Express)
  ↓
output-geoservices (routes: /rest/services/:id/FeatureServer/:layer/query)
  ↓
provider-geoparquet (Model.getData)
  ↓
DuckDB (@duckdb/node-api)
  ├── read_parquet() — reads GeoParquet from any storage
  ├── ST_Simplify() — geometry simplification pushdown
  ├── ST_AsGeoJSON() — geometry → GeoJSON string
  └── Column pruning, predicate pushdown, ZSTD decompression
  ↓
GeoJSON FeatureCollection
  ↓
featureserver + winnow (filter, transform, serialize)
  ↓
Response: f=json (Esri), f=geojson, f=pbf (protobuf), f=pjson
```

## Key Design Decisions

### DuckDB as the parquet engine (not hyparquet)
- hyparquet is pure JS but OOMs on large files (472MB boundary parquet = 567MB decompressed WKB geometry)
- DuckDB handles ZSTD decompression, column pruning, spatial operations, and cloud storage natively
- `ST_Simplify` in DuckDB reduces 4.6M coordinate pairs → 30K at 0.01° tolerance (99.3% reduction)
- DuckDB extensions: `spatial`, `httpfs`, `azure` — installed on first query, cached after

### GeoArrow as internal medium (future)
- Current pipeline uses GeoJSON as the intermediate format between all stages
- `@koopjs/geoarrow` provides `fromGeoJSON()` / `toGeoJSON()` / `GeoArrowTable` for columnar encoding
- Round-trip verified: GeoJSON → Arrow → GeoJSON preserves coordinates, properties, metadata
- Future: wire into koop-core's `pull()` to avoid GeoJSON serialization between stages

### HTML forms on FeatureServer endpoints
- Browser requests (Accept: text/html) get an HTML form instead of raw JSON
- Query form: where, outFields, simplify, returnGeometry, format selector
- Layer info: name, geometry type, field list, link to query
- `?f=html` forces HTML output from any client

## Provider-GeoParquet Usage

```js
const Koop = require('@koopjs/koop-core');
const geoparquetProvider = require('@koopjs/provider-geoparquet');

const koop = new Koop();
koop.register(geoparquetProvider, {
  dataDir: './data',           // local directory for parquet files
  storage: {                   // cloud credentials (optional)
    accountName: process.env.AZURE_STORAGE_ACCOUNT,
    accountKey: process.env.AZURE_STORAGE_KEY,
  },
});
koop.server.listen(8080);
```

Query endpoints:
```
# Local file (id = filename without .parquet)
/geoparquet/rest/services/adm0_osm_enriched/FeatureServer/0/query?f=json

# Custom query params
?where=iso3='USA'&outFields=iso3,name,area_km2&simplify=0.01&f=geojson&resultRecordCount=10

# Cloud URIs as the id (URL-encoded)
/geoparquet/rest/services/az%3A%2F%2Fcontainer%2Fpath.parquet/FeatureServer/0/query
```

### Simplification parameter
`?simplify=<degrees>` pushes `ST_Simplify` down to DuckDB:
- `0.001` ≈ 100m — detailed, suitable for city-level zoom
- `0.01` ≈ 1km — good for country-level web maps
- `0.1` ≈ 10km — fast overview

## Development

```bash
npm install                  # install all workspace deps
npm test --workspaces        # run all tests (upstream packages)
node demo/geoparquet-demo.js # start demo server on port 8080
node demo/benchmark-pbf.js 10 # benchmark PBF encoding for N rows
```

Node.js 20+ required (Volta pinned to 20.11.1). DuckDB native binaries are prebuilt for linux/darwin/win32 x64+arm64.

## Git Conventions

- Present tense, imperative mood: "Add feature" not "Added feature"
- First line: concise summary (50 chars or less)
- Branch from `master` (upstream default)
- Keep upstream synced: `git fetch upstream && git merge upstream/master`

## Remotes

- `origin` → `TaEthni/koop` (our fork)
- `upstream` → `koopjs/koop` (upstream)
