const { acquireConnection, ensureExtension, resetConnection } = require('./connection');
const { configureCloudAccess } = require('./cloud');
const {
  escapeSql,
  quoteIdent,
  sanitizeSource,
  sanitizeWhere,
  sanitizeOutFields,
} = require('./sql');
const { extractGeoMetadata, getSchemaAndCount } = require('./metadata');
const { rowsToGeoJSON } = require('./geojson');
const {
  GeomEncoding,
  detectGeometry,
  geomToGeoJSONExpr,
  buildSelectWithGeom,
} = require('./geometry');

module.exports = {
  acquireConnection,
  ensureExtension,
  resetConnection,
  configureCloudAccess,
  escapeSql,
  quoteIdent,
  sanitizeSource,
  sanitizeWhere,
  sanitizeOutFields,
  extractGeoMetadata,
  getSchemaAndCount,
  rowsToGeoJSON,
  GeomEncoding,
  detectGeometry,
  geomToGeoJSONExpr,
  buildSelectWithGeom,
};
