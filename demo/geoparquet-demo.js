const Koop = require('@koopjs/koop-core');
const duckdbProvider = require('@koopjs/provider-duckdb');

const koop = new Koop({ logLevel: 'debug' });

koop.register(duckdbProvider, {
  dataDir:
    '/mnt/c/Users/LBerryman/repos/admin-boundaries-sql/' +
    'migration/scripts/exports/eoe_v2',
});

const port = process.env.PORT || 8080;
koop.server.listen(port, () => {
  const base = `http://localhost:${port}/duckdb/rest/services`;
  console.log(`\nKoop DuckDB provider running on port ${port}`);
  console.log(`\nGeoParquet:`);
  console.log(`  ${base}/adm0_osm_enriched/FeatureServer/0?f=html`);
  console.log(`  ${base}/adm0_osm_enriched/FeatureServer/0/query?f=html`);
  console.log(`\nQuery examples:`);
  console.log(`  JSON:    ...query?where=1=1&outFields=iso3,name&f=json&resultRecordCount=10`);
  console.log(`  GeoJSON: ...query?where=iso3='USA'&outFields=*&simplify=0.01&f=geojson`);
  console.log(`  PBF:     ...query?where=1=1&outFields=*&simplify=0.01&f=pbf&resultRecordCount=5`);
  console.log(`\nCSV (with lat/lon):    ...services/my_data.csv/FeatureServer/0/query?f=html`);
  console.log(`Shapefile:             ...services/my_data.shp/FeatureServer/0/query?f=html`);
  console.log(`Iceberg:               ...services/path%2Fto%2Ficeberg/FeatureServer/0/query?format=iceberg&f=html`);
  console.log(`Delta:                 ...services/path%2Fto%2Fdelta/FeatureServer/0/query?format=delta&f=html`);
});
