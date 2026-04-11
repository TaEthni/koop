/**
 * Direct DuckDB → PBF benchmark.
 *
 * Compares the two hot paths:
 *   1. Current: DuckDB ST_AsGeoJSON → JSON.parse → Esri coords
 *   2. Fast:    DuckDB ST_AsWKB → wkx binary parse → Esri coords (no JSON text)
 */

const { DuckDBInstance } = require('@duckdb/node-api');

const SOURCE =
  '/mnt/c/Users/LBerryman/repos/admin-boundaries-sql/migration/scripts/exports/eoe_v2/adm0_osm_enriched.parquet';

const LIMIT = process.argv[2] ? parseInt(process.argv[2]) : 10;

async function main() {
  console.log(`\nBenchmarking ${LIMIT} rows from adm0_osm_enriched.parquet\n`);

  // Setup DuckDB (one-time cost)
  console.time('duckdb-init');
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run('INSTALL spatial; LOAD spatial;');
  console.timeEnd('duckdb-init');

  // ======= PATH 1: GeoJSON text round-trip =======
  console.log('\n--- Path 1: ST_AsGeoJSON → JSON.parse ---');

  console.time('path1-duckdb-query');
  const r1 = await conn.runAndReadAll(`
    SELECT iso3, name, area_km2,
           ST_AsGeoJSON("geometry") AS geojson_geom
    FROM read_parquet('${SOURCE}')
    LIMIT ${LIMIT}
  `);
  const rows1 = r1.getRowObjectsJson();
  console.timeEnd('path1-duckdb-query');

  let coordCount1 = 0;
  console.time('path1-json-parse');
  for (const row of rows1) {
    const geom = JSON.parse(row.geojson_geom);
    coordCount1 += countCoords(geom);
  }
  console.timeEnd('path1-json-parse');
  console.log(`  Coordinate pairs: ${coordCount1.toLocaleString()}`);

  // ======= PATH 2: WKB binary parse =======
  console.log('\n--- Path 2: ST_AsWKB → wkx binary parse ---');

  console.time('path2-duckdb-query');
  const r2 = await conn.runAndReadAll(`
    SELECT iso3, name, area_km2,
           ST_AsWKB("geometry") AS wkb_geom
    FROM read_parquet('${SOURCE}')
    LIMIT ${LIMIT}
  `);
  const rows2 = r2.getRowObjectsJson();
  console.timeEnd('path2-duckdb-query');

  const wkx = require('wkx');
  let coordCount2 = 0;
  console.time('path2-wkb-parse');
  for (const row of rows2) {
    const wkbBuf = Buffer.from(row.wkb_geom, 'base64');
    const geom = wkx.Geometry.parse(wkbBuf).toGeoJSON();
    coordCount2 += countCoords(geom);
  }
  console.timeEnd('path2-wkb-parse');
  console.log(`  Coordinate pairs: ${coordCount2.toLocaleString()}`);

  // ======= PATH 3: No geometry at all =======
  console.log('\n--- Path 3: Attributes only (no geometry) ---');
  console.time('path3-query');
  const r3 = await conn.runAndReadAll(`
    SELECT iso3, name, area_km2
    FROM read_parquet('${SOURCE}')
    LIMIT ${LIMIT}
  `);
  r3.getRowObjectsJson();
  console.timeEnd('path3-query');

  // ======= PATH 4: ALL 248 rows, attributes only =======
  console.log('\n--- Path 4: ALL 248 rows, attributes only ---');
  console.time('path4-query');
  const r4 = await conn.runAndReadAll(`
    SELECT iso3, name, area_km2
    FROM read_parquet('${SOURCE}')
  `);
  r4.getRowObjectsJson();
  console.timeEnd('path4-query');

  console.log('\n=== Done ===');
}

function countCoords(geom) {
  if (!geom) return 0;
  switch (geom.type) {
    case 'Point':
      return 1;
    case 'MultiPoint':
      return geom.coordinates.length;
    case 'LineString':
      return geom.coordinates.length;
    case 'MultiLineString':
      return geom.coordinates.reduce((s, l) => s + l.length, 0);
    case 'Polygon':
      return geom.coordinates.reduce((s, r) => s + r.length, 0);
    case 'MultiPolygon':
      return geom.coordinates.reduce(
        (s, p) => s + p.reduce((s2, r) => s2 + r.length, 0),
        0,
      );
    default:
      return 0;
  }
}

main().catch(console.error);
