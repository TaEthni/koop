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

  _instance = await DuckDBInstance.create(':memory:', {
    allow_unsigned_extensions: 'true',
  });
  _connection = await _instance.connect();

  await ensureExtension(_connection, 'spatial');

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
