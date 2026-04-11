const wkx = require('wkx');
const { GeoArrowTable } = require('./table');

/**
 * Convert a GeoJSON FeatureCollection to a GeoArrowTable.
 *
 * This is the on-ramp for legacy providers that return GeoJSON.
 * The cost is paid once at ingestion — after this, the data flows
 * through the pipeline as columnar Arrow buffers.
 *
 * @param {Object} geojson - GeoJSON FeatureCollection (with optional .metadata)
 * @returns {GeoArrowTable}
 */
function fromGeoJSON(geojson) {
  const features = geojson.features || [];
  const koopMeta = geojson.metadata || {};

  if (features.length === 0) {
    return GeoArrowTable.fromColumns(
      { geometry: [] },
      { geometryColumn: 'geometry', encoding: 'WKB', geometryTypes: [] },
      koopMeta,
    );
  }

  // Collect all property keys across all features
  const propertyKeys = collectPropertyKeys(features);

  // Build column arrays
  const columns = {};
  for (const key of propertyKeys) {
    columns[key] = new Array(features.length);
  }
  columns.geometry = new Array(features.length);

  const geometryTypes = new Set();

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const props = feature.properties || {};

    // Properties
    for (const key of propertyKeys) {
      columns[key][i] = normalizeValue(props[key] ?? null);
    }

    // Geometry → WKB
    if (feature.geometry) {
      geometryTypes.add(feature.geometry.type);
      columns.geometry[i] = geojsonGeometryToWKB(feature.geometry);
    } else {
      columns.geometry[i] = null;
    }
  }

  return GeoArrowTable.fromColumns(
    columns,
    {
      geometryColumn: 'geometry',
      encoding: 'WKB',
      geometryTypes: Array.from(geometryTypes),
    },
    koopMeta,
  );
}

/**
 * Convert a GeoArrowTable back to a GeoJSON FeatureCollection.
 *
 * This is the off-ramp for output plugins that need GeoJSON
 * (e.g., the existing featureserver/output-geoservices).
 *
 * @param {GeoArrowTable} geoArrowTable
 * @returns {Object} GeoJSON FeatureCollection with .metadata
 */
function toGeoJSON(geoArrowTable) {
  const { table, geometryColumn, metadata } = geoArrowTable;
  const propertyColumns = geoArrowTable.propertyColumns;
  const geomVector = table.getChild(geometryColumn);
  const numRows = table.numRows;

  const features = new Array(numRows);

  for (let i = 0; i < numRows; i++) {
    const properties = {};
    for (const colName of propertyColumns) {
      const vec = table.getChild(colName);
      properties[colName] = vec.get(i);
    }

    let geometry = null;
    if (geomVector) {
      const wkbValue = geomVector.get(i);
      if (wkbValue) {
        geometry = wkbToGeoJSON(wkbValue);
      }
    }

    features[i] = {
      type: 'Feature',
      properties,
      geometry,
    };
  }

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  // Preserve Koop metadata for downstream consumers
  if (metadata && Object.keys(metadata).length > 0) {
    geojson.metadata = metadata;
  }

  return geojson;
}

/**
 * Convert a GeoJSON geometry to WKB Buffer.
 */
function geojsonGeometryToWKB(geometry) {
  return wkx.Geometry.parseGeoJSON(geometry).toWkb();
}

/**
 * Convert a WKB value to GeoJSON geometry.
 */
function wkbToGeoJSON(value) {
  const buf = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(value);

  return wkx.Geometry.parse(buf).toGeoJSON();
}

/**
 * Collect all unique property keys across features.
 */
function collectPropertyKeys(features) {
  const keySet = new Set();
  for (const feature of features) {
    if (feature.properties) {
      for (const key of Object.keys(feature.properties)) {
        keySet.add(key);
      }
    }
  }
  return Array.from(keySet);
}

/**
 * Normalize property values for Arrow compatibility.
 */
function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (value instanceof Date) return value.getTime();
  return value;
}

module.exports = { fromGeoJSON, toGeoJSON, geojsonGeometryToWKB, wkbToGeoJSON };
