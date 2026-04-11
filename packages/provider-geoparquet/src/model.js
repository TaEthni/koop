const path = require('path');
const { readParquet } = require('./parquet-reader');

const LOG_PREFIX = 'GeoParquet provider:';

class Model {
  #dataDir;
  #ttl;
  #storageOptions;
  #logger;

  constructor(koop = {}, options = {}) {
    this.#logger = koop.logger || console;
    this.#dataDir = options.dataDir || process.env.GEOPARQUET_DATA_DIR || './data';
    this.#ttl = options.ttl || 0;
    this.#storageOptions = options.storage || {};
  }

  async getData(req) {
    const { id } = req.params;

    if (!id) {
      const error = new Error(`${LOG_PREFIX} "id" parameter is required`);
      error.code = 400;
      throw error;
    }

    const source = this.#resolveSource(id);
    this.#logger.info?.(`${LOG_PREFIX} reading ${source}`);

    // Extract query hints from the Koop/FeatureServer request
    // so DuckDB can push down predicates and column selection
    const readOptions = this.#buildReadOptions(req);

    try {
      const { rows, geoMetadata, totalRows } = await readParquet(
        source,
        this.#storageOptions,
        readOptions,
      );

      // DuckDB returns geometry as GeoJSON strings via ST_AsGeoJSON — parse them
      const geomCol = geoMetadata.geometryColumn;
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

      const geojson = {
        type: 'FeatureCollection',
        features,
        ttl: this.#ttl,
        metadata: {
          name: geoMetadata.layerName || path.basename(source, '.parquet'),
          title: geoMetadata.layerName || `GeoParquet: ${id}`,
          description: geoMetadata.description || `GeoParquet data from ${id}`,
          geometryType: mapGeometryType(geoMetadata.geometryTypes),
          fields: buildFieldDefinitions(rows, geomCol),
        },
      };

      // If total count was requested but no features (count-only query),
      // pass count for FeatureServer
      if (totalRows !== undefined) {
        geojson.count = totalRows;
      }

      return geojson;
    } catch (err) {
      if (err.message?.includes('No such file') || err.message?.includes('not found')) {
        err.code = 404;
        err.message = `${LOG_PREFIX} not found: ${source}`;
      } else {
        err.message = `${LOG_PREFIX} ${err.message}`;
      }
      throw err;
    }
  }

  /**
   * Build DuckDB read options from the incoming Koop request.
   * This enables predicate pushdown and column pruning at the storage layer.
   */
  #buildReadOptions(req) {
    const options = {};
    const query = { ...req.query, ...req.body };

    // resultRecordCount / limit
    if (query.resultRecordCount) {
      options.limit = parseInt(query.resultRecordCount, 10);
    }

    // Geometry simplification (degrees). Huge win for complex boundaries.
    // ?simplify=0.01 → ~1km tolerance, drops 99%+ of vertices at web scale
    if (query.simplify) {
      options.simplifyTolerance = parseFloat(query.simplify);
    }

    return options;
  }

  #resolveSource(id) {
    const cloudPrefixes = ['http://', 'https://', 's3://', 'az://', 'abfss://', 'gs://'];
    if (cloudPrefixes.some((prefix) => id.startsWith(prefix))) {
      return id;
    }

    const filename = id.endsWith('.parquet') ? id : `${id}.parquet`;
    return path.resolve(process.cwd(), this.#dataDir, filename);
  }
}

function mapGeometryType(geometryTypes) {
  if (!geometryTypes || geometryTypes.length === 0) return 'Point';
  // Return the first type, mapping Multi variants
  return geometryTypes[0];
}

function buildFieldDefinitions(rows, geomCol) {
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
  if (value === null || value === undefined) return 'esriFieldTypeString';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'esriFieldTypeInteger' : 'esriFieldTypeDouble';
  }
  if (typeof value === 'boolean') return 'esriFieldTypeSmallInteger';
  return 'esriFieldTypeString';
}

module.exports = Model;
