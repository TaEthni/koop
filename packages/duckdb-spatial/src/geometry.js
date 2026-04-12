const { quoteIdent } = require('./sql');

/**
 * Geometry encoding types we support.
 *
 * NATIVE   — DuckDB GEOMETRY type (from spatial extension or GeoParquet)
 * WKB      — Well-Known Binary in a BLOB column
 * WKT      — Well-Known Text in a VARCHAR column
 * GEOJSON  — GeoJSON string in a VARCHAR column
 * LATLON   — Separate lat/lon (or latitude/longitude, y/x) numeric columns
 * NONE     — No geometry detected
 */
const GeomEncoding = {
  NATIVE: 'native',
  WKB: 'wkb',
  WKT: 'wkt',
  GEOJSON: 'geojson',
  LATLON: 'latlon',
  NONE: 'none',
};

/**
 * Well-known lat/lon column name pairs (case-insensitive).
 * First match wins.
 */
const LATLON_PAIRS = [
  { lat: 'latitude', lon: 'longitude' },
  { lat: 'lat', lon: 'lon' },
  { lat: 'lat', lon: 'lng' },
  { lat: 'lat', lon: 'long' },
  { lat: 'y', lon: 'x' },
  { lat: 'ycoord', lon: 'xcoord' },
  { lat: 'y_coord', lon: 'x_coord' },
];

/**
 * Detect the geometry encoding in a DuckDB scan result.
 *
 * Checks (in order):
 *   1. GeoParquet/GeoIceberg metadata (geo key in parquet KV metadata)
 *   2. DuckDB GEOMETRY column type (native spatial)
 *   3. BLOB column named geometry/geom/wkb* (WKB)
 *   4. VARCHAR column named geometry/geom/wkt* (WKT)
 *   5. VARCHAR column named geojson/geo_json (GeoJSON string)
 *   6. Lat/lon numeric column pairs
 *
 * @param {Object} conn - DuckDB connection
 * @param {string} scanExpr - SQL scan expression
 * @param {Object} [geoMeta] - GeoParquet metadata (if available)
 * @returns {Promise<Object>} { encoding, column, latColumn, lonColumn }
 */
async function detectGeometry(conn, scanExpr, geoMeta) {
  // 1. GeoParquet metadata says where the geometry is
  if (geoMeta && geoMeta.geometryColumn && geoMeta.encoding) {
    const enc = geoMeta.encoding.toUpperCase();
    if (enc === 'WKB') {
      return {
        encoding: GeomEncoding.WKB,
        column: geoMeta.geometryColumn,
      };
    }
    if (enc === 'WKT') {
      return {
        encoding: GeomEncoding.WKT,
        column: geoMeta.geometryColumn,
      };
    }
    // GeoParquet default is WKB; native GEOMETRY also comes through here
    return {
      encoding: GeomEncoding.NATIVE,
      column: geoMeta.geometryColumn,
    };
  }

  // 2-6. Inspect column names and types from the scan
  const typeReader = await conn.runAndReadAll(`DESCRIBE SELECT * FROM ${scanExpr}`);
  const columns = typeReader.getRowObjectsJson();
  const colMap = {};
  const lowerMap = {};
  for (const col of columns) {
    colMap[col.column_name] = col.column_type;
    lowerMap[col.column_name.toLowerCase()] = col;
  }

  // 2. Native GEOMETRY type
  for (const col of columns) {
    if (col.column_type.startsWith('GEOMETRY')) {
      return {
        encoding: GeomEncoding.NATIVE,
        column: col.column_name,
      };
    }
  }

  // 3. WKB — BLOB column with geometry-like name
  const wkbNames = ['geometry', 'geom', 'wkb', 'wkb_geometry', 'the_geom', 'shape'];
  for (const name of wkbNames) {
    const match = lowerMap[name];
    if (match && match.column_type === 'BLOB') {
      return {
        encoding: GeomEncoding.WKB,
        column: match.column_name,
      };
    }
  }

  // 4. WKT — VARCHAR column with geometry-like name
  const wktNames = [
    'wkt',
    'wkt_geometry',
    'geometry_wkt',
    'geom_wkt',
    'geometry',
    'geom',
    'the_geom',
    'shape',
  ];
  for (const name of wktNames) {
    const match = lowerMap[name];
    if (match && match.column_type === 'VARCHAR') {
      return {
        encoding: GeomEncoding.WKT,
        column: match.column_name,
      };
    }
  }

  // 5. GeoJSON string column
  const geojsonNames = ['geojson', 'geo_json', 'geojson_geometry'];
  for (const name of geojsonNames) {
    const match = lowerMap[name];
    if (match && match.column_type === 'VARCHAR') {
      return {
        encoding: GeomEncoding.GEOJSON,
        column: match.column_name,
      };
    }
  }

  // 6. Lat/lon column pairs
  for (const pair of LATLON_PAIRS) {
    const latCol = lowerMap[pair.lat];
    const lonCol = lowerMap[pair.lon];
    if (
      latCol &&
      lonCol &&
      isNumericType(latCol.column_type) &&
      isNumericType(lonCol.column_type)
    ) {
      return {
        encoding: GeomEncoding.LATLON,
        column: null,
        latColumn: latCol.column_name,
        lonColumn: lonCol.column_name,
      };
    }
  }

  return { encoding: GeomEncoding.NONE, column: null };
}

/**
 * Build the SQL expression that converts a geometry column
 * to GeoJSON string, with optional simplification.
 *
 * Handles all supported encodings:
 *   NATIVE  → ST_AsGeoJSON(geom)
 *   WKB     → ST_AsGeoJSON(ST_GeomFromWKB(geom))
 *   WKT     → ST_AsGeoJSON(ST_GeomFromText(geom))
 *   GEOJSON → geom (already GeoJSON, pass through)
 *   LATLON  → ST_AsGeoJSON(ST_Point(lon, lat))
 *
 * @param {Object} geomInfo - From detectGeometry()
 * @param {number} [simplifyTolerance] - Degrees for ST_Simplify
 * @returns {string} SQL expression aliased as "geometry"
 */
function geomToGeoJSONExpr(geomInfo, simplifyTolerance) {
  const alias = quoteIdent('geometry');

  if (geomInfo.encoding === GeomEncoding.NONE) {
    return null;
  }

  let inner;

  switch (geomInfo.encoding) {
    case GeomEncoding.NATIVE:
      inner = quoteIdent(geomInfo.column);
      break;

    case GeomEncoding.WKB:
      inner = `ST_GeomFromWKB(${quoteIdent(geomInfo.column)})`;
      break;

    case GeomEncoding.WKT:
      inner = `ST_GeomFromText(${quoteIdent(geomInfo.column)})`;
      break;

    case GeomEncoding.GEOJSON:
      // Already a GeoJSON string — no spatial conversion needed
      if (geomInfo.column === 'geometry') {
        return quoteIdent(geomInfo.column);
      }
      return `${quoteIdent(geomInfo.column)} AS ${alias}`;

    case GeomEncoding.LATLON:
      inner = `ST_Point(${quoteIdent(geomInfo.lonColumn)}, ` + `${quoteIdent(geomInfo.latColumn)})`;
      break;

    default:
      return null;
  }

  // Apply simplification if requested
  if (simplifyTolerance && simplifyTolerance > 0) {
    inner = `ST_Simplify(${inner}, ${Number(simplifyTolerance)})`;
  }

  return `ST_AsGeoJSON(${inner}) AS ${alias}`;
}

/**
 * Build a full SELECT column list, replacing the geometry column
 * with the appropriate conversion expression.
 *
 * @param {string[]} requestedCols - Columns requested (empty = all)
 * @param {string[]} allColumns - All available columns
 * @param {Object} geomInfo - From detectGeometry()
 * @param {number} [simplifyTolerance]
 * @returns {string} SQL column list
 */
function buildSelectWithGeom(requestedCols, allColumns, geomInfo, simplifyTolerance) {
  const cols = requestedCols.length > 0 ? requestedCols : allColumns;

  const geomExpr = geomToGeoJSONExpr(geomInfo, simplifyTolerance);
  const geomColName = geomInfo.column;

  // For LATLON, we exclude the lat/lon columns from properties
  // and add the synthesized geometry
  const latlonCols =
    geomInfo.encoding === GeomEncoding.LATLON
      ? [geomInfo.latColumn?.toLowerCase(), geomInfo.lonColumn?.toLowerCase()]
      : [];

  const parts = [];

  for (const col of cols) {
    const lower = col.toLowerCase();

    // Skip the original geometry column — replaced by geomExpr
    if (geomColName && lower === geomColName.toLowerCase()) {
      continue;
    }

    // Skip raw lat/lon columns if we're synthesizing geometry
    if (latlonCols.includes(lower)) {
      continue;
    }

    parts.push(quoteIdent(col));
  }

  // Add the geometry expression
  if (geomExpr) {
    parts.push(geomExpr);
  }

  return parts.join(', ');
}

function isNumericType(duckdbType) {
  const t = duckdbType.toUpperCase();
  return (
    t.includes('INT') ||
    t.includes('FLOAT') ||
    t.includes('DOUBLE') ||
    t.includes('DECIMAL') ||
    t.includes('NUMERIC') ||
    t.includes('REAL')
  );
}

module.exports = {
  GeomEncoding,
  detectGeometry,
  geomToGeoJSONExpr,
  buildSelectWithGeom,
};
