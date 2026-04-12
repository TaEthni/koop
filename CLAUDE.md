# TaEthni Koop Fork

## Overview

Fork of [koopjs/koop](https://github.com/koopjs/koop) with three enhancements:

1. **`@koopjs/provider-duckdb`** — Serve any data source DuckDB can read as an ArcGIS FeatureServer (GeoParquet, Iceberg, Delta Lake, CSV, Shapefile, GeoJSON, FlatGeobuf, GeoPackage, KML, Excel, SQLite, and more)
2. **`@koopjs/geoarrow`** — GeoArrow columnar encoding medium for the Koop pipeline (replaces GeoJSON as internal data format)
3. **HTML query forms** — ArcGIS Server-style HTML interface for the FeatureServer query/layer info endpoints

## Repository Structure

This is an npm workspaces monorepo. New packages added by this fork:

| Package | Path | Purpose |
|---------|------|---------|
| `@koopjs/provider-duckdb` | `packages/provider-duckdb/` | Universal DuckDB provider — any format, any cloud, one FeatureServer |
| `@koopjs/duckdb-spatial` | `packages/duckdb-spatial/` | Shared DuckDB engine — connection, geometry detection, cloud access, SQL safety |
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
provider-duckdb (Model.getData)
  ↓
duckdb-spatial (shared engine)
  ↓
DuckDB (@duckdb/node-api)
  ├── Format auto-detect → read_parquet / iceberg_scan / delta_scan / ST_Read / read_csv / ...
  ├── Geometry auto-detect → NATIVE / WKB / WKT / GeoJSON string / lat+lon columns
  ├── ST_Simplify() pushdown for complex geometry
  ├── Column pruning, predicate pushdown, ZSTD decompression
  └── Cloud access via httpfs / azure extensions (S3, GCS, Azure Blob, HTTP)
  ↓
GeoJSON FeatureCollection
  ↓
featureserver + winnow (filter, transform, serialize)
  ↓
Response: f=json (Esri), f=geojson, f=pbf (protobuf), f=pjson, f=html (form)
```

## Supported Source Formats

| Format | Extension | DuckDB Function | Geometry |
|--------|-----------|-----------------|----------|
| GeoParquet | `.parquet`, `.geoparquet` | `read_parquet()` | Native GEOMETRY or WKB |
| Iceberg | (use `?format=iceberg`) | `iceberg_scan()` | WKB, WKT, or lat/lon |
| Delta Lake | (use `?format=delta`) | `delta_scan()` | WKB, WKT, or lat/lon |
| CSV/TSV | `.csv`, `.tsv` | `read_csv()` | lat/lon columns, WKT |
| JSON/NDJSON | `.json`, `.ndjson`, `.jsonl` | `read_json()` | lat/lon, WKT, GeoJSON string |
| GeoJSON | `.geojson` | `ST_Read()` (GDAL) | Native |
| Shapefile | `.shp` | `ST_Read()` (GDAL) | Native |
| FlatGeobuf | `.fgb` | `ST_Read()` (GDAL) | Native |
| GeoPackage | `.gpkg` | `ST_Read()` (GDAL) | Native |
| KML/KMZ | `.kml`, `.kmz` | `ST_Read()` (GDAL) | Native |
| Excel | `.xlsx` | `read_xlsx()` | lat/lon columns, WKT |
| SQLite | `.sqlite`, `.db` | `sqlite_scan()` | WKB, WKT, SpatiaLite |

## Geometry Encoding Detection

The provider auto-detects geometry encoding (checked in order):

1. **GeoParquet metadata** (`geo` key in parquet KV metadata)
2. **DuckDB GEOMETRY type** (native spatial column)
3. **WKB** — BLOB column named `geometry`, `geom`, `wkb_geometry`, `the_geom`, `shape`
4. **WKT** — VARCHAR column named `wkt`, `wkt_geometry`, `geometry`, `geom`, `the_geom`
5. **GeoJSON string** — VARCHAR column named `geojson`, `geo_json`
6. **Lat/lon pairs** — numeric columns named `latitude`/`longitude`, `lat`/`lon`, `y`/`x`, etc.

## SQL Injection Protection

All user input is sanitized before reaching DuckDB:

- **Source paths**: Reject semicolons, comment markers (`--`, `/*`)
- **WHERE clauses**: Block DDL/DML keywords (DROP, DELETE, INSERT, UPDATE, ALTER, CREATE, EXEC, COPY, ATTACH, etc.), statement terminators, comments
- **Column names**: Must match `[a-zA-Z_][a-zA-Z0-9_.]*` pattern
- **Identifiers**: Quoted with double-quote escaping

## Query Parameters

Standard ArcGIS FeatureServer parameters:

| Parameter | Example | Description |
|-----------|---------|-------------|
| `where` | `iso3='USA'` | SQL WHERE filter |
| `outFields` | `iso3,name,area_km2` or `*` | Fields to return |
| `resultRecordCount` | `10` | Max features (LIMIT) |
| `resultOffset` | `20` | Skip N features (OFFSET) |
| `orderByFields` | `area_km2 DESC` | Sort order |
| `returnGeometry` | `false` | Skip geometry (much faster) |
| `returnCountOnly` | `true` | Count only |
| `f` | `json`, `geojson`, `pbf`, `pjson`, `html` | Response format |

DuckDB provider extensions:

| Parameter | Example | Description |
|-----------|---------|-------------|
| `simplify` | `0.01` | ST_Simplify tolerance in degrees (0.001≈100m, 0.01≈1km, 0.1≈10km) |
| `format` | `iceberg`, `delta`, `csv` | Explicit source format (auto-detected from extension by default) |
| `table` | `my_table` | Table name for multi-table sources (SQLite, GeoPackage) |

## Usage

```js
const Koop = require('@koopjs/koop-core');
const duckdbProvider = require('@koopjs/provider-duckdb');

const koop = new Koop();
koop.register(duckdbProvider, {
  dataDir: './data',           // base directory for local files
  storage: {                   // cloud credentials (optional)
    accountName: process.env.AZURE_STORAGE_ACCOUNT,
    accountKey: process.env.AZURE_STORAGE_KEY,
    // region, accessKeyId, secretAccessKey for S3
  },
});
koop.server.listen(8080);
```

### Example URLs

```bash
# GeoParquet (auto-detected from .parquet extension)
/duckdb/rest/services/boundaries.parquet/FeatureServer/0/query?f=html

# Iceberg table on Azure
/duckdb/rest/services/abfss%3A%2F%2Ficeberg%40storage.dfs.core.windows.net%2Ftables%2Factivities/FeatureServer/0/query?format=iceberg&f=json

# Delta table on S3
/duckdb/rest/services/s3%3A%2F%2Fbucket%2Fdelta%2Ftable/FeatureServer/0/query?format=delta&f=geojson

# CSV with lat/lon columns
/duckdb/rest/services/cities.csv/FeatureServer/0/query?f=json

# Shapefile via GDAL
/duckdb/rest/services/parcels.shp/FeatureServer/0/query?f=geojson

# Simplified country boundaries (~1km tolerance)
/duckdb/rest/services/adm0.parquet/FeatureServer/0/query?simplify=0.01&f=pbf

# GeoPackage with named table
/duckdb/rest/services/data.gpkg/FeatureServer/0/query?table=buildings&f=json
```

## Development

```bash
npm install                  # install all workspace deps
npm test --workspaces        # run all tests
node demo/geoparquet-demo.js # start demo server on port 8080
node demo/benchmark-pbf.js 10 # benchmark PBF encoding
```

Node.js 20+ required (Volta pinned to 20.11.1). DuckDB native binaries are prebuilt for linux/darwin/win32 x64+arm64.

## Git Conventions

- Conventional commits required: `feat:`, `fix:`, `chore:`, etc.
- Present tense, imperative mood
- Branch from `master` (upstream default)
- Keep upstream synced: `git fetch upstream && git merge upstream/master`

## Remotes

- `origin` → `TaEthni/koop` (our fork)
- `upstream` → `koopjs/koop` (upstream)
