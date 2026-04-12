const { escapeSql } = require('./sql');

/**
 * Extract GeoParquet/GeoIceberg metadata from a parquet file's
 * key-value metadata. Works for any parquet-backed format.
 */
async function extractGeoMetadata(conn, source) {
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
      const geoValue = kvRows[0].value;
      const geoStr =
        typeof geoValue === 'string' ? geoValue : Buffer.from(geoValue, 'base64').toString('utf-8');
      const geo = JSON.parse(geoStr);
      const primaryColumn = geo.primary_column || 'geometry';
      const colMeta = geo.columns?.[primaryColumn] || {};

      geoMetadata = {
        geometryColumn: primaryColumn,
        encoding: colMeta.encoding || 'WKB',
        geometryTypes: colMeta.geometry_types || [],
        crs: colMeta.crs || null,
        bbox: colMeta.bbox || null,
        primaryColumn,
        layerName: geo.layer_name || null,
        description: geo.description || null,
        version: geo.version || null,
      };
    }
  } catch {
    // No geo metadata — fall back to defaults
  }

  return geoMetadata;
}

/**
 * Get column names and row count from a DuckDB scan source.
 *
 * @param {Object} conn - DuckDB connection
 * @param {string} scanExpr - SQL scan expression, e.g.
 *   "read_parquet('file.parquet')" or "iceberg_scan('path')"
 * @returns {Promise<{allColumnNames: string[], totalRows: number}>}
 */
async function getSchemaAndCount(conn, scanExpr) {
  const schemaReader = await conn.runAndReadAll(`SELECT * FROM ${scanExpr} LIMIT 0`);
  const allColumnNames = schemaReader.columnNames();

  const countReader = await conn.runAndReadAll(`SELECT count(*) AS cnt FROM ${scanExpr}`);
  const countRows = countReader.getRowObjectsJson();
  const totalRows = countRows.length > 0 ? Number(countRows[0].cnt) : 0;

  return { allColumnNames, totalRows };
}

module.exports = { extractGeoMetadata, getSchemaAndCount };
