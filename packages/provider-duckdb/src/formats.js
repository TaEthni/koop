const { sanitizeSource } = require('@koopjs/duckdb-spatial');

/**
 * Supported source formats and their DuckDB scan expressions.
 *
 * Format is auto-detected from the file extension or URI pattern,
 * or can be set explicitly via ?format= query parameter.
 */
const FORMATS = {
  parquet: {
    extensions: ['.parquet', '.geoparquet', '.pq'],
    scanFn: (src) => `read_parquet('${src}')`,
    duckdbExtensions: [],
  },
  iceberg: {
    extensions: [],
    patterns: [/\/metadata\/.*\.metadata\.json$/, /iceberg/i],
    scanFn: (src) => `iceberg_scan('${src}')`,
    duckdbExtensions: ['iceberg'],
  },
  delta: {
    extensions: [],
    patterns: [/_delta_log/],
    scanFn: (src) => `delta_scan('${src}')`,
    duckdbExtensions: ['delta'],
  },
  csv: {
    extensions: ['.csv', '.tsv', '.txt'],
    scanFn: (src) => `read_csv('${src}', auto_detect=true)`,
    duckdbExtensions: [],
  },
  json: {
    extensions: ['.json', '.ndjson', '.jsonl'],
    scanFn: (src) => `read_json('${src}', auto_detect=true)`,
    duckdbExtensions: [],
  },
  geojson: {
    extensions: ['.geojson'],
    scanFn: (src) => `ST_Read('${src}')`,
    duckdbExtensions: [],
  },
  shapefile: {
    extensions: ['.shp'],
    scanFn: (src) => `ST_Read('${src}')`,
    duckdbExtensions: [],
  },
  flatgeobuf: {
    extensions: ['.fgb'],
    scanFn: (src) => `ST_Read('${src}')`,
    duckdbExtensions: [],
  },
  geopackage: {
    extensions: ['.gpkg'],
    scanFn: (src) => `ST_Read('${src}')`,
    duckdbExtensions: [],
  },
  kml: {
    extensions: ['.kml', '.kmz'],
    scanFn: (src) => `ST_Read('${src}')`,
    duckdbExtensions: [],
  },
  excel: {
    extensions: ['.xlsx', '.xls'],
    scanFn: (src) => `read_xlsx('${src}')`,
    duckdbExtensions: ['spatial'],
  },
  sqlite: {
    extensions: ['.sqlite', '.db', '.sqlite3'],
    scanFn: (src, table) => {
      const t = table || 'main';
      return `sqlite_scan('${src}', '${t}')`;
    },
    duckdbExtensions: ['sqlite'],
  },
};

/**
 * Detect the format from a source path/URI and optional explicit hint.
 *
 * @param {string} source - File path or URI
 * @param {string} [formatHint] - Explicit format (overrides detection)
 * @returns {{ format: string, config: Object }}
 */
function detectFormat(source, formatHint) {
  // Explicit format takes priority
  if (formatHint) {
    const key = formatHint.toLowerCase();
    if (FORMATS[key]) {
      return { format: key, config: FORMATS[key] };
    }
    throw new Error(`Unknown format: ${formatHint}`);
  }

  const lower = source.toLowerCase();

  // Check file extensions
  for (const [key, config] of Object.entries(FORMATS)) {
    for (const ext of config.extensions || []) {
      if (lower.endsWith(ext)) {
        return { format: key, config };
      }
    }
  }

  // Check URI patterns
  for (const [key, config] of Object.entries(FORMATS)) {
    for (const pattern of config.patterns || []) {
      if (pattern.test(source)) {
        return { format: key, config };
      }
    }
  }

  // Default to parquet
  return { format: 'parquet', config: FORMATS.parquet };
}

/**
 * Build the DuckDB scan expression for a source.
 *
 * @param {string} source - Raw source path/URI
 * @param {string} [formatHint] - Explicit format override
 * @param {Object} [opts] - Additional options
 * @param {string} [opts.table] - Table name (for sqlite, postgres)
 * @returns {{ scanExpr: string, format: string, duckdbExtensions: string[] }}
 */
function buildScanExpr(source, formatHint, opts = {}) {
  const safe = sanitizeSource(source);
  const { format, config } = detectFormat(source, formatHint);

  const scanExpr = config.scanFn(safe, opts.table);

  return {
    scanExpr,
    format,
    duckdbExtensions: config.duckdbExtensions || [],
  };
}

module.exports = { detectFormat, buildScanExpr, FORMATS };
