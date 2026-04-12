const { DuckDBInstance } = require('@duckdb/node-api');

let _instance;
let _connection;
const _loadedExtensions = new Set();

/**
 * Get or create a shared DuckDB instance and connection.
 * The spatial extension is always loaded. Other extensions
 * are loaded on demand via ensureExtension().
 */
async function getConnection() {
  if (_connection) return _connection;

  const memoryLimit = process.env.DUCKDB_MEMORY_LIMIT || '6GB';
  _instance = await DuckDBInstance.create(':memory:', {
    allow_unsigned_extensions: 'true',
    memory_limit: memoryLimit,
  });
  _connection = await _instance.connect();

  await ensureExtension(_connection, 'spatial');

  // Set CA cert path for httpfs HTTPS connections (Linux containers)
  const fs = require('fs');
  const caPaths = ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'];
  for (const p of caPaths) {
    if (fs.existsSync(p)) {
      await _connection.run(`SET ca_cert_file = '${p}'`);
      break;
    }
  }

  return _connection;
}

/**
 * Install and load a DuckDB extension if not already loaded.
 */
async function ensureExtension(conn, name) {
  if (_loadedExtensions.has(name)) return;
  await conn.run(`INSTALL ${name}`);
  await conn.run(`LOAD ${name}`);
  _loadedExtensions.add(name);
}

/**
 * Reset the connection (for testing).
 */
async function resetConnection() {
  if (_connection) {
    _connection.closeSync();
  }
  _connection = null;
  _instance = null;
  _loadedExtensions.clear();
}

module.exports = { getConnection, ensureExtension, resetConnection };
