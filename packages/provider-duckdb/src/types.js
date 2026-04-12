/**
 * @typedef {Object} KoopInstance
 * @property {Object} [logger] - Winston-compatible logger
 */

/**
 * @typedef {Object} ProviderOptions
 * @property {string} [dataDir='./data'] - Base directory for local file
 *   resolution. Files without cloud URI prefixes resolve relative to this.
 *   Env: DUCKDB_DATA_DIR
 * @property {number} [ttl=0] - Cache TTL in seconds (0 = no cache)
 * @property {StorageOptions} [storage] - Cloud storage credentials
 */

/**
 * @typedef {Object} StorageOptions
 * @property {string} [region] - AWS region (default: us-east-1).
 *   Env: AWS_REGION
 * @property {string} [accessKeyId] - AWS access key.
 *   Env: AWS_ACCESS_KEY_ID
 * @property {string} [secretAccessKey] - AWS secret key.
 *   Env: AWS_SECRET_ACCESS_KEY
 * @property {string} [accountName] - Azure storage account name.
 *   Env: AZURE_STORAGE_ACCOUNT
 * @property {string} [accountKey] - Azure storage account key.
 *   Env: AZURE_STORAGE_KEY
 * @property {string} [endpoint] - Custom storage endpoint URL
 */

/**
 * Query parameters accepted on the FeatureServer /query endpoint.
 *
 * Standard ArcGIS FeatureServer params:
 *
 * @typedef {Object} QueryParams
 * @property {string} [where='1=1'] - SQL WHERE clause.
 *   Examples: `1=1`, `iso3='USA'`, `population > 1000000`
 * @property {string} [outFields='*'] - Comma-separated field names
 *   or `*` for all. Example: `iso3,name,area_km2`
 * @property {number} [resultRecordCount] - Max features to return.
 *   Maps to SQL LIMIT.
 * @property {number} [resultOffset] - Skip N features.
 *   Maps to SQL OFFSET. Use with resultRecordCount for pagination.
 * @property {string} [orderByFields] - Sort expression.
 *   Example: `area_km2 DESC`
 * @property {boolean} [returnGeometry=true] - Include geometry in response.
 *   Set to false for attributes-only (much faster for large geometry).
 * @property {boolean} [returnCountOnly=false] - Return only the feature count
 * @property {boolean} [returnIdsOnly=false] - Return only object IDs
 * @property {boolean} [returnExtentOnly=false] - Return only the extent
 * @property {string} [outSR] - Output spatial reference WKID.
 *   Example: `4326`, `3857`
 * @property {string} [geometry] - Spatial filter envelope as JSON.
 *   Example: `{"xmin":-180,"ymin":-90,"xmax":180,"ymax":90}`
 * @property {'json'|'pjson'|'geojson'|'pbf'|'html'} [f='json'] - Response
 *   format. `json`=Esri JSON, `pjson`=pretty, `geojson`=GeoJSON,
 *   `pbf`=Protocol Buffers, `html`=query form
 *
 * DuckDB provider extensions (not in standard ArcGIS spec):
 *
 * @property {number} [simplify] - Geometry simplification tolerance
 *   in degrees. Pushes ST_Simplify down to DuckDB.
 *   Approximate scale: 0.001≈100m, 0.01≈1km, 0.1≈10km
 * @property {string} [format] - Explicit source format override.
 *   Auto-detected from file extension by default.
 *   Values: `parquet`, `iceberg`, `delta`, `csv`, `json`,
 *   `geojson`, `shapefile`, `flatgeobuf`, `geopackage`,
 *   `kml`, `excel`, `sqlite`
 * @property {string} [table] - Table name within a multi-table source
 *   (sqlite, geopackage). Example: `my_table`
 */

/**
 * Parsed and sanitized query parameters (internal).
 *
 * @typedef {Object} ParsedQuery
 * @property {string} [where] - Sanitized WHERE clause
 * @property {string[]} columns - Sanitized column names (empty = all)
 * @property {number} [limit] - SQL LIMIT
 * @property {number} [offset] - SQL OFFSET
 * @property {string} [orderBy] - ORDER BY clause
 * @property {number} [simplifyTolerance] - ST_Simplify tolerance
 * @property {string} [format] - Explicit format hint
 * @property {string} [table] - Table name for multi-table sources
 */

/**
 * @typedef {Object} KoopRequest
 * @property {Object} params - Route parameters
 * @property {string} params.id - Source identifier (filename or URI)
 * @property {QueryParams} query - Query string parameters
 * @property {QueryParams} body - POST body parameters
 * @property {Object} headers
 */

/**
 * @typedef {Object} GeoJSONResponse
 * @property {'FeatureCollection'} type
 * @property {Object[]} features - GeoJSON features
 * @property {number} [ttl] - Cache TTL
 * @property {number} [count] - Total feature count
 * @property {Object} metadata - Koop metadata
 * @property {string} metadata.name - Layer name
 * @property {string} metadata.title - Layer title
 * @property {string} metadata.description
 * @property {string} metadata.geometryType - Esri geometry type
 * @property {Object[]} metadata.fields - Field definitions
 */

// JSDoc-only module — no runtime exports
module.exports = {};
