const path = require('path');
const {
  acquireConnection,
  ensureExtension,
  configureCloudAccess,
  sanitizeWhere,
  sanitizeOutFields,
  getSchemaAndCount,
  detectGeometry,
  buildSelectWithGeom,
  rowsToGeoJSON,
} = require('@koopjs/duckdb-spatial');
const { buildScanExpr } = require('./formats');

const LOG_PREFIX = 'DuckDB provider:';

class Model {
  #dataDir;
  #ttl;
  #storageOptions;
  #logger;

  /**
   * @param {import('./types').KoopInstance} koop
   * @param {import('./types').ProviderOptions} options
   */
  constructor(koop = {}, options = {}) {
    this.#logger = koop.logger || console;
    this.#dataDir = options.dataDir || process.env.DUCKDB_DATA_DIR || './data';
    this.#ttl = options.ttl || 0;
    this.#storageOptions = options.storage || {};
  }

  /**
   * @param {import('./types').KoopRequest} req
   * @returns {Promise<import('./types').GeoJSONResponse>}
   */
  async getData(req) {
    const { id } = req.params;

    if (!id) {
      const error = new Error(`${LOG_PREFIX} "id" parameter is required`);
      error.code = 400;
      throw error;
    }

    const source = this.#resolveSource(id);
    const query = this.#parseQueryParams(req);

    this.#logger.info?.(`${LOG_PREFIX} ${query.format || 'auto'} → ${source}`);

    const conn = await acquireConnection();
    try {
      // Build scan expression and load required extensions
      const { scanExpr, duckdbExtensions } = buildScanExpr(source, query.format, {
        table: query.table,
      });

      for (const ext of duckdbExtensions) {
        await ensureExtension(conn, ext);
      }

      // Cloud credentials
      await configureCloudAccess(conn, source, this.#storageOptions);

      // Detect geometry encoding (WKB, WKT, lat/lon, native, etc.)
      const geomInfo = await detectGeometry(conn, scanExpr);

      // Get schema and count
      const { allColumnNames, totalRows } = await getSchemaAndCount(conn, scanExpr);

      // Build query with geometry conversion + SQL injection protection
      const selectCols = buildSelectWithGeom(
        query.columns,
        allColumnNames,
        geomInfo,
        query.simplifyTolerance,
      );

      let sql = `SELECT ${selectCols} FROM ${scanExpr}`;

      if (query.where && query.where !== '1=1') {
        sql += ` WHERE ${query.where}`;
      }
      if (query.orderBy) {
        sql += ` ORDER BY ${query.orderBy}`;
      }
      if (query.limit !== undefined) {
        sql += ` LIMIT ${query.limit}`;
      }
      if (query.offset !== undefined) {
        sql += ` OFFSET ${query.offset}`;
      }

      const reader = await conn.runAndReadAll(sql);
      const rows = reader.getRowObjectsJson();

      return rowsToGeoJSON(rows, 'geometry', {
        source,
        totalRows,
        ttl: this.#ttl,
        geometryType: geomInfo.geometryTypes?.[0],
      });
    } catch (err) {
      // Strip SAS tokens / credentials from error messages
      const safeSource = source.split('?')[0];
      const safeMsg = (err.message || '').replace(/\?[^\s'"]+/g, '?[REDACTED]');

      if (safeMsg.includes('No such file') || safeMsg.includes('Could not open file')) {
        err.code = 404;
        err.message = `${LOG_PREFIX} not found: ${safeSource}`;
      } else if (err.code !== 400) {
        err.message = `${LOG_PREFIX} ${safeMsg}`;
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Parse and sanitize all query parameters from the request.
   *
   * @param {import('./types').KoopRequest} req
   * @returns {import('./types').ParsedQuery}
   */
  #parseQueryParams(req) {
    const q = { ...req.query, ...req.body };

    return {
      where: q.where ? sanitizeWhere(q.where) : undefined,
      columns: q.outFields ? sanitizeOutFields(q.outFields) : [],
      limit: q.resultRecordCount
        ? parseInt(q.resultRecordCount, 10)
        : parseInt(process.env.DUCKDB_DEFAULT_LIMIT || '1000', 10),
      offset: q.resultOffset ? parseInt(q.resultOffset, 10) : undefined,
      orderBy: q.orderByFields || undefined,
      simplifyTolerance: q.simplify
        ? parseFloat(q.simplify)
        : parseFloat(process.env.DUCKDB_DEFAULT_SIMPLIFY || '0'),
      format: q.format || undefined,
      table: q.table || undefined,
    };
  }

  /**
   * Resolve a source ID to a file path or cloud URI.
   * Cloud URIs pass through. Bare names resolve relative to dataDir.
   *
   * @param {string} id
   * @returns {string}
   */
  #resolveSource(id) {
    // If the id itself is a cloud URI, pass through
    const cloudPrefixes = ['http://', 'https://', 's3://', 'az://', 'abfss://', 'gs://', 'gcs://'];
    if (cloudPrefixes.some((p) => id.startsWith(p))) {
      return id;
    }

    // Check if it has an extension already
    const hasExt = path.extname(id).length > 1;
    const filename = hasExt ? id : `${id}.parquet`;

    // If dataDir is a cloud URI prefix, join as cloud path
    if (cloudPrefixes.some((p) => this.#dataDir.startsWith(p))) {
      const base = this.#dataDir.replace(/\/$/, '');
      let url = `${base}/${filename}`;
      // Append SAS token for Azure Blob HTTPS URLs if available
      // decodeURIComponent handles env vars that got URL-encoded by shell
      const sas = process.env.AZURE_STORAGE_SAS;
      if (sas && url.includes('.blob.core.windows.net')) {
        url += `?${decodeURIComponent(sas)}`;
      }
      return url;
    }

    return path.resolve(process.cwd(), this.#dataDir, filename);
  }
}

module.exports = Model;
