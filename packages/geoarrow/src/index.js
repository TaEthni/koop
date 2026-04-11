/**
 * @koopjs/geoarrow
 *
 * Internal encoding medium for the Koop pipeline. Replaces GeoJSON as the
 * data interchange format between providers, winnow, and output plugins.
 *
 * GeoArrow uses Apache Arrow's columnar memory layout with WKB-encoded
 * geometry, giving:
 *   - Zero-copy slicing (no parse/serialize per stage)
 *   - Columnar access (touch only the columns you need)
 *   - Binary geometry (no coordinate→string→coordinate round-trips)
 *   - Native interop with DuckDB, GDAL, geopandas, R/sf, etc.
 *
 * Usage in the pipeline:
 *
 *   Provider.getData(req)   → returns GeoArrowTable (or GeoJSON for compat)
 *   Winnow.filter(table, q) → returns filtered GeoArrowTable
 *   Output.serialize(table)  → converts to json/pbf/geojson response
 *
 * Backward compatibility:
 *
 *   Providers that return GeoJSON still work — the pipeline wraps them
 *   via fromGeoJSON(). The conversion cost is paid once at ingestion,
 *   not at every stage boundary.
 */

const { fromGeoJSON, toGeoJSON } = require('./convert');
const { GeoArrowTable } = require('./table');

module.exports = {
  GeoArrowTable,
  fromGeoJSON,
  toGeoJSON,
};
