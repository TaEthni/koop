const { DuckDBInstance } = require('@duckdb/node-api');

let _instance;
let _initPromise;
const _loadedExtensions = new Set();

// Connection pool — limits concurrent DuckDB connections to prevent OOM
const MAX_CONNECTIONS = parseInt(process.env.DUCKDB_MAX_CONNECTIONS || '4', 10);
let _activeCount = 0;
const _waitQueue = [];

/**
 * Get or create the shared DuckDB instance.
 */
async function getInstance() {
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const memoryLimit = process.env.DUCKDB_MEMORY_LIMIT || '6GB';
    const threads = process.env.DUCKDB_THREADS;
    const config = {
      allow_unsigned_extensions: 'true',
      memory_limit: memoryLimit,
    };
    if (threads) config.threads = threads;

    _instance = await DuckDBInstance.create(':memory:', config);

    // Load core extensions on the initial connection
    const conn = await _instance.connect();
    await ensureExtension(conn, 'spatial');
    await setCACert(conn);
    conn.closeSync();

    _initPromise = null;
    return _instance;
  })();

  return _initPromise;
}

/**
 * Acquire a connection from the pool.
 *
 * If the pool is full, the caller waits until a connection is released.
 * Returns a connection wrapper with a release() method that MUST be
 * called when done (use try/finally).
 *
 * Usage:
 *   const conn = await acquireConnection();
 *   try {
 *     await conn.run('SELECT ...');
 *   } finally {
 *     conn.release();
 *   }
 *
 * @returns {Promise<Object>} DuckDB connection with .release() method
 */
async function acquireConnection() {
  // Wait if pool is full
  if (_activeCount >= MAX_CONNECTIONS) {
    await new Promise((resolve) => _waitQueue.push(resolve));
  }

  _activeCount++;
  const instance = await getInstance();
  const raw = await instance.connect();
  await setCACert(raw);

  // Wrap with release method
  const conn = Object.create(raw);
  conn.release = () => {
    _activeCount--;
    try {
      raw.closeSync();
    } catch {
      // ignore close errors
    }
    if (_waitQueue.length > 0) {
      const next = _waitQueue.shift();
      next();
    }
  };

  return conn;
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
 * Set CA cert path for HTTPS connections (Linux containers).
 */
async function setCACert(conn) {
  const fs = require('fs');
  const caPaths = ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'];
  for (const p of caPaths) {
    if (fs.existsSync(p)) {
      await conn.run(`SET ca_cert_file = '${p}'`);
      return;
    }
  }
}

/**
 * Reset (for testing).
 */
async function resetConnection() {
  _instance = null;
  _initPromise = null;
  _activeCount = 0;
  _waitQueue.length = 0;
  _loadedExtensions.clear();
}

module.exports = {
  getInstance,
  acquireConnection,
  ensureExtension,
  resetConnection,
};
