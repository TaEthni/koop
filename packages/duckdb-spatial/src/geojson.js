const path = require('path');

/**
 * Convert DuckDB row objects to a Koop-compatible GeoJSON FeatureCollection.
 *
 * Expects geometry columns to already be GeoJSON strings (via ST_AsGeoJSON
 * in the SQL query).
 *
 * @param {Object[]} rows - Row objects from DuckDB getRowObjectsJson()
 * @param {string} geomCol - Name of the geometry column
 * @param {Object} opts - Additional options
 * @param {string} [opts.layerName] - Layer name for metadata
 * @param {string} [opts.source] - Source path (for fallback name)
 * @param {string} [opts.description] - Layer description
 * @param {string} [opts.geometryType] - Geometry type
 * @param {number} [opts.totalRows] - Total row count
 * @param {number} [opts.ttl] - Cache TTL
 * @returns {Object} GeoJSON FeatureCollection with metadata
 */
function rowsToGeoJSON(rows, geomCol, opts = {}) {
  const features = rows.map((row) => {
    const properties = {};
    let geometry = null;

    for (const [key, value] of Object.entries(row)) {
      if (key === geomCol) {
        geometry = typeof value === 'string' ? JSON.parse(value) : value;
      } else {
        properties[key] = value;
      }
    }

    return { type: 'Feature', properties, geometry };
  });

  const name = opts.layerName || (opts.source ? path.basename(opts.source, '.parquet') : 'layer');

  const geojson = {
    type: 'FeatureCollection',
    features,
    ttl: opts.ttl || 0,
    metadata: {
      name,
      title: opts.layerName || name,
      description: opts.description || `Data from ${name}`,
      geometryType: opts.geometryType || features[0]?.geometry?.type || 'Point',
      fields: buildFieldDefs(rows, geomCol),
    },
  };

  if (opts.totalRows !== undefined) {
    geojson.count = opts.totalRows;
  }

  return geojson;
}

function buildFieldDefs(rows, geomCol) {
  if (!rows.length) return [];
  const sample = rows[0];

  return Object.keys(sample)
    .filter((key) => key !== geomCol)
    .map((key) => ({
      name: key,
      alias: key,
      type: inferEsriFieldType(sample[key]),
    }));
}

function inferEsriFieldType(value) {
  if (value === null || value === undefined) {
    return 'esriFieldTypeString';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'esriFieldTypeInteger' : 'esriFieldTypeDouble';
  }
  if (typeof value === 'boolean') {
    return 'esriFieldTypeSmallInteger';
  }
  return 'esriFieldTypeString';
}

module.exports = { rowsToGeoJSON };
