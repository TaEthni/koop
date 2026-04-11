const { DuckDBInstance } = require('@duckdb/node-api');

let _instance;
let _connection;

/**
 * Get or create a shared DuckDB instance and connection.
 * Extensions are installed/loaded once on first use.
 */
async function getConnection() {
  if (_connection) return _connection;

  _instance = await DuckDBInstance.create(':memory:', {
    allow_unsigned_extensions: 'true',
  });
  _connection = await _instance.connect();

  // Install and load spatial extension for geometry support
  await _connection.run('INSTALL spatial');
  await _connection.run('LOAD spatial');

  // Install httpfs for HTTP/S3/Azure/GCS access
  await _connection.run('INSTALL httpfs');
  await _connection.run('LOAD httpfs');

  // Install azure extension for abfss:// URIs
  await _connection.run('INSTALL azure');
  await _connection.run('LOAD azure');

  return _connection;
}

/**
 * Read a GeoParquet file using DuckDB.
 *
 * DuckDB handles:
 *   - Parquet parsing (all compression codecs: ZSTD, Snappy, LZ4, etc.)
 *   - Column pruning (only reads columns referenced in the query)
 *   - Predicate pushdown (filters applied at the storage level)
 *   - Cloud access via httpfs/azure extensions (S3, GCS, Azure, HTTP)
 *   - Spatial geometry types via the spatial extension
 *
 * This means a 472MB ZSTD-compressed file with huge geometry columns
 * won't OOM — DuckDB streams results and only touches what's needed.
 *
 * @param {string} source - Path or URI to the GeoParquet file
 * @param {Object} [storageOptions] - Cloud credentials
 * @param {Object} [readOptions] - Query options
 * @param {string[]} [readOptions.columns] - Columns to select
 * @param {string} [readOptions.where] - SQL WHERE clause
 * @param {number} [readOptions.limit] - Max rows to return
 * @param {number} [readOptions.simplifyTolerance] - Geometry simplification tolerance in degrees (0 = no simplify)
 * @returns {Promise<{rows: Array<Object>, geoMetadata: Object, totalRows: number, allColumnNames: string[]}>}
 */
async function readParquet(source, storageOptions = {}, readOptions = {}) {
  const conn = await getConnection();

  // Configure cloud credentials if provided
  await configureCloudAccess(conn, source, storageOptions);

  // Get file metadata first (column names, row count, geo metadata)
  const meta = await getParquetMetadata(conn, source);

  // Build the SELECT query with column pruning and predicates
  const sql = buildQuery(source, meta, readOptions);
  const reader = await conn.runAndReadAll(sql);
  const rows = reader.getRowObjectsJson();

  return {
    rows,
    geoMetadata: meta.geoMetadata,
    totalRows: meta.totalRows,
    allColumnNames: meta.allColumnNames,
  };
}

/**
 * Extract metadata from a GeoParquet file using DuckDB's parquet_metadata
 * and parquet_kv_metadata functions.
 */
async function getParquetMetadata(conn, source) {
  // Get column names and row count
  const schemaReader = await conn.runAndReadAll(
    `SELECT name FROM parquet_schema('${escapeSql(source)}') WHERE num_children IS NULL`,
  );
  const allColumnNames = schemaReader.getRowObjectsJson().map((r) => r.name);

  const countReader = await conn.runAndReadAll(
    `SELECT num_rows FROM parquet_file_metadata('${escapeSql(source)}')`,
  );
  const countRows = countReader.getRowObjectsJson();
  const totalRows = countRows.length > 0 ? Number(countRows[0].num_rows) : 0;

  // Get GeoParquet metadata from key-value metadata
  let geoMetadata = {
    geometryColumn: 'geometry',
    encoding: 'WKB',
    geometryTypes: [],
    crs: null,
    primaryColumn: 'geometry',
  };

  try {
    const kvReader = await conn.runAndReadAll(
      `SELECT value FROM parquet_kv_metadata('${escapeSql(source)}') WHERE key = 'geo'`,
    );
    const kvRows = kvReader.getRowObjectsJson();
    if (kvRows.length > 0) {
      // value comes back as a blob/bytes — decode it
      const geoValue = kvRows[0].value;
      const geoStr =
        typeof geoValue === 'string'
          ? geoValue
          : Buffer.from(geoValue, 'base64').toString('utf-8');
      const geo = JSON.parse(geoStr);
      const primaryColumn = geo.primary_column || 'geometry';
      const columnMeta = geo.columns?.[primaryColumn] || {};

      geoMetadata = {
        geometryColumn: primaryColumn,
        encoding: columnMeta.encoding || 'WKB',
        geometryTypes: columnMeta.geometry_types || [],
        crs: columnMeta.crs || null,
        bbox: columnMeta.bbox || null,
        primaryColumn,
        layerName: geo.layer_name || null,
        description: geo.description || null,
        version: geo.version || null,
      };
    }
  } catch {
    // No geo metadata — fall back to defaults
  }

  return { allColumnNames, totalRows, geoMetadata };
}

/**
 * Build a SQL SELECT query for the GeoParquet file.
 *
 * Geometry is converted to GeoJSON via ST_AsGeoJSON so downstream
 * consumers (winnow, featureserver) get standard GeoJSON geometry.
 */
function buildQuery(source, meta, readOptions = {}) {
  const { columns, where, limit, simplifyTolerance } = readOptions;
  const geomCol = meta.geoMetadata.geometryColumn;

  // Build geometry expression with optional simplification
  let geomExpr = quoteIdent(geomCol);
  if (simplifyTolerance && simplifyTolerance > 0) {
    geomExpr = `ST_Simplify(${geomExpr}, ${Number(simplifyTolerance)})`;
  }
  const geomSelect = `ST_AsGeoJSON(${geomExpr}) AS ${quoteIdent(geomCol)}`;

  // Select columns — convert geometry to GeoJSON string
  let selectCols;
  if (columns && columns.length > 0) {
    selectCols = columns
      .map((col) => {
        if (col === geomCol) return geomSelect;
        return quoteIdent(col);
      })
      .join(', ');
  } else {
    selectCols = meta.allColumnNames
      .map((col) => {
        if (col === geomCol) return geomSelect;
        return quoteIdent(col);
      })
      .join(', ');
  }

  let sql = `SELECT ${selectCols} FROM read_parquet('${escapeSql(source)}')`;

  if (where) {
    sql += ` WHERE ${where}`;
  }

  if (limit !== undefined) {
    sql += ` LIMIT ${parseInt(limit, 10)}`;
  }

  return sql;
}

/**
 * Configure cloud storage credentials in DuckDB.
 */
async function configureCloudAccess(conn, source, options) {
  if (source.startsWith('s3://')) {
    const region = options.region || process.env.AWS_REGION || 'us-east-1';
    const keyId = options.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secret = options.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    if (keyId && secret) {
      await conn.run(`
        CREATE OR REPLACE SECRET (
          TYPE s3,
          KEY_ID '${escapeSql(keyId)}',
          SECRET '${escapeSql(secret)}',
          REGION '${escapeSql(region)}'
        )
      `);
    }
  }

  if (source.startsWith('az://') || source.startsWith('abfss://')) {
    const accountName = options.accountName || process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = options.accountKey || process.env.AZURE_STORAGE_KEY;
    if (accountName) {
      await conn.run(`
        CREATE OR REPLACE SECRET (
          TYPE azure,
          ACCOUNT_NAME '${escapeSql(accountName)}'
          ${accountKey ? `, ACCOUNT_KEY '${escapeSql(accountKey)}'` : ''}
        )
      `);
    }
  }

  if (source.startsWith('gs://') || source.startsWith('gcs://')) {
    // GCS uses the default service account or GOOGLE_APPLICATION_CREDENTIALS
    // DuckDB's httpfs extension handles this via CREATE SECRET
  }
}

function escapeSql(str) {
  return String(str).replace(/'/g, "''");
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

module.exports = { readParquet, getConnection };
