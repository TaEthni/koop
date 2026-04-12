const { escapeSql } = require('./sql');

/**
 * Configure cloud storage credentials in DuckDB based on the
 * source URI scheme and provided options.
 */
async function configureCloudAccess(conn, source, options = {}) {
  if (source.startsWith('s3://')) {
    await configureS3(conn, options);
  }

  if (source.startsWith('az://') || source.startsWith('abfss://')) {
    await configureAzure(conn, options);
  }
}

async function configureS3(conn, options) {
  const region =
    options.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const keyId = options.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
  const secret = options.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;

  if (keyId && secret) {
    await conn.run(`
      CREATE OR REPLACE SECRET (
        TYPE s3,
        KEY_ID '${escapeSql(keyId)}',
        SECRET '${escapeSql(secret)}',
        REGION '${escapeSql(region)}'
      )
    `);
  }
}

async function configureAzure(conn, options) {
  const accountName = options.accountName || process.env.AZURE_STORAGE_ACCOUNT;
  const accountKey = options.accountKey || process.env.AZURE_STORAGE_KEY;

  if (accountName) {
    const keyClause = accountKey ? `, ACCOUNT_KEY '${escapeSql(accountKey)}'` : '';
    await conn.run(`
      CREATE OR REPLACE SECRET (
        TYPE azure,
        ACCOUNT_NAME '${escapeSql(accountName)}'
        ${keyClause}
      )
    `);
  }
}

module.exports = { configureCloudAccess };
