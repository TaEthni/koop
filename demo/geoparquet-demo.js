const Koop = require('@koopjs/koop-core');
const geoparquetProvider = require('@koopjs/provider-geoparquet');

const koop = new Koop({ logLevel: 'debug' });

koop.register(geoparquetProvider, {
  dataDir: '/mnt/c/Users/LBerryman/repos/admin-boundaries-sql/migration/scripts/exports/eoe_v2',
});

const port = process.env.PORT || 8080;
koop.server.listen(port, () => {
  console.log(`\nKoop GeoParquet demo running on http://localhost:${port}`);
  console.log(`\nTry these endpoints:`);
  console.log(`  FeatureServer info:`);
  console.log(`    http://localhost:${port}/geoparquet/rest/services/adm0_osm_enriched/FeatureServer/0`);
  console.log(`  Query (JSON):`);
  console.log(`    http://localhost:${port}/geoparquet/rest/services/adm0_osm_enriched/FeatureServer/0/query?where=1=1&outFields=iso3,name,area_km2&f=json&resultRecordCount=10`);
  console.log(`  Query (GeoJSON):`);
  console.log(`    http://localhost:${port}/geoparquet/rest/services/adm0_osm_enriched/FeatureServer/0/query?where=1=1&outFields=iso3,name,area_km2&f=geojson&resultRecordCount=10`);
  console.log(`  Query (PBF):`);
  console.log(`    http://localhost:${port}/geoparquet/rest/services/adm0_osm_enriched/FeatureServer/0/query?where=1=1&outFields=iso3,name&f=pbf&resultRecordCount=5`);
  console.log(`  Single country:`);
  console.log(`    http://localhost:${port}/geoparquet/rest/services/adm0_osm_enriched/FeatureServer/0/query?where=iso3='USA'&outFields=*&f=geojson`);
});
