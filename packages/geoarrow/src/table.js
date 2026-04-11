const {
  Table,
  RecordBatch,
  Schema,
  Field,
  Float64,
  Int32,
  Int64,
  Utf8,
  Bool,
  Binary,
  DateMillisecond,
  tableToIPC,
  tableFromIPC,
  vectorFromArray,
  tableFromArrays,
} = require('apache-arrow');

/**
 * GeoArrowTable wraps an Apache Arrow Table with geospatial metadata.
 *
 * This is the internal data structure that flows through the Koop pipeline.
 * It carries:
 *   - An Arrow Table with property columns + a WKB geometry column
 *   - GeoArrow metadata (geometry column name, CRS, geometry types)
 *   - Koop metadata (layer name, field definitions, idField, etc.)
 *
 * The table is lazy-friendly: you can slice, filter, and project columns
 * without copying the underlying buffers.
 */
class GeoArrowTable {
  /**
   * @param {Table} arrowTable - Apache Arrow Table
   * @param {Object} geoMeta - GeoArrow metadata
   * @param {string} geoMeta.geometryColumn - Name of the geometry column (default: "geometry")
   * @param {string} geoMeta.encoding - Geometry encoding: "WKB" (default)
   * @param {Array<string>} geoMeta.geometryTypes - e.g. ["Point", "MultiPolygon"]
   * @param {Object|null} geoMeta.crs - CRS as PROJJSON (default: EPSG:4326)
   * @param {Object} koopMeta - Koop-specific metadata
   */
  constructor(arrowTable, geoMeta = {}, koopMeta = {}) {
    this.table = arrowTable;
    this.geometryColumn = geoMeta.geometryColumn || 'geometry';
    this.encoding = geoMeta.encoding || 'WKB';
    this.geometryTypes = geoMeta.geometryTypes || [];
    this.crs = geoMeta.crs || DEFAULT_CRS;
    this.metadata = koopMeta;
  }

  /** Number of rows */
  get numRows() {
    return this.table.numRows;
  }

  /** Number of columns (including geometry) */
  get numCols() {
    return this.table.numCols;
  }

  /** Column names (excluding geometry) */
  get propertyColumns() {
    return this.table.schema.fields
      .map((f) => f.name)
      .filter((name) => name !== this.geometryColumn);
  }

  /** All column names */
  get columnNames() {
    return this.table.schema.fields.map((f) => f.name);
  }

  /** Get a single column as an Arrow Vector */
  getColumn(name) {
    return this.table.getChild(name);
  }

  /** Get the geometry column */
  getGeometry() {
    return this.table.getChild(this.geometryColumn);
  }

  /**
   * Serialize to Arrow IPC stream format.
   * Includes GeoArrow metadata in the schema.
   */
  toIPC() {
    const schemaWithMeta = this.#addGeoMetadata(this.table.schema);
    const tableWithMeta = new Table(schemaWithMeta, this.table.batches);
    return tableToIPC(tableWithMeta, 'stream');
  }

  /**
   * Create a GeoArrowTable from an Arrow IPC buffer.
   */
  static fromIPC(buffer, koopMeta = {}) {
    const table = tableFromIPC(buffer);
    const geoMeta = extractGeoMetaFromSchema(table.schema);
    return new GeoArrowTable(table, geoMeta, koopMeta);
  }

  /**
   * Create a GeoArrowTable from column arrays.
   *
   * @param {Object} columns - { colName: [...values] } including geometry as Buffer[]
   * @param {Object} geoMeta
   * @param {Object} koopMeta
   */
  static fromColumns(columns, geoMeta = {}, koopMeta = {}) {
    const geomCol = geoMeta.geometryColumn || 'geometry';
    const arrowCols = {};

    for (const [name, values] of Object.entries(columns)) {
      if (name === geomCol) {
        arrowCols[name] = vectorFromArray(values, new Binary());
      } else {
        arrowCols[name] = vectorFromArray(values);
      }
    }

    const table = tableFromArrays(arrowCols);
    return new GeoArrowTable(table, geoMeta, koopMeta);
  }

  #addGeoMetadata(schema) {
    const meta = new Map(schema.metadata || new Map());
    meta.set(
      'geo',
      JSON.stringify({
        version: '1.1.0',
        primary_column: this.geometryColumn,
        columns: {
          [this.geometryColumn]: {
            encoding: this.encoding,
            geometry_types: this.geometryTypes,
            crs: this.crs,
          },
        },
      }),
    );
    return new Schema(schema.fields, meta);
  }
}

function extractGeoMetaFromSchema(schema) {
  const meta = schema.metadata;
  if (!meta || !meta.get('geo')) {
    return { geometryColumn: 'geometry', encoding: 'WKB' };
  }

  const geo = JSON.parse(meta.get('geo'));
  const primaryColumn = geo.primary_column || 'geometry';
  const colMeta = geo.columns?.[primaryColumn] || {};

  return {
    geometryColumn: primaryColumn,
    encoding: colMeta.encoding || 'WKB',
    geometryTypes: colMeta.geometry_types || [],
    crs: colMeta.crs || null,
  };
}

const DEFAULT_CRS = {
  $schema: 'https://proj.org/schemas/v0.7/projjson.schema.json',
  type: 'GeographicCRS',
  name: 'WGS 84',
  id: { authority: 'EPSG', code: 4326 },
};

module.exports = { GeoArrowTable };
