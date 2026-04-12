const Koop = require('@koopjs/koop-core');
const duckdbProvider = require('@koopjs/provider-duckdb');

const logLevel = process.env.LOG_LEVEL || 'info';
const port = process.env.PORT || 8080;

const koop = new Koop({ logLevel });

// Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For) from nginx ingress
koop.server.set('trust proxy', true);

koop.register(duckdbProvider, {
  dataDir: process.env.DUCKDB_DATA_DIR || './data',
  ttl: parseInt(process.env.KOOP_CACHE_TTL || '0', 10),
  storage: {
    accountName: process.env.AZURE_STORAGE_ACCOUNT,
    accountKey: process.env.AZURE_STORAGE_KEY,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

koop.server.listen(port, () => {
  console.log(`Koop DuckDB FeatureServer listening on port ${port}`);
});
