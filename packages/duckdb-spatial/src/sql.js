/**
 * SQL utilities with injection protection.
 *
 * DuckDB's @duckdb/node-api supports parameterized queries for values,
 * but table names, column names, and scan expressions must be built
 * as SQL strings. This module provides safe escaping for each context.
 */

/**
 * Escape a string literal for use inside single quotes in SQL.
 * Doubles single quotes and strips null bytes.
 *
 * ONLY use this for values inside SQL string literals ('...').
 * For identifiers use quoteIdent(). For WHERE clauses from
 * user input use sanitizeWhere().
 */
function escapeSql(str) {
  return String(str).replace(/\0/g, '').replace(/'/g, "''");
}

/**
 * Quote a SQL identifier (column name, table alias).
 * Wraps in double quotes and escapes embedded double quotes.
 */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Sanitize a file path or URI for use in read_parquet() / iceberg_scan().
 *
 * Rejects paths that contain SQL injection patterns:
 *   - Single quotes (would break out of the string literal)
 *   - Semicolons (statement termination)
 *   - Comment markers (--, /*)
 *
 * @param {string} source - File path or URI
 * @returns {string} Escaped source safe for SQL string literal
 * @throws {Error} If the source contains suspicious patterns
 */
function sanitizeSource(source) {
  const s = String(source);

  if (/[;]/.test(s)) {
    throw makeInjectionError('Source path contains semicolon');
  }
  if (/--/.test(s)) {
    throw makeInjectionError('Source path contains comment marker');
  }
  if (/\/\*/.test(s)) {
    throw makeInjectionError('Source path contains comment marker');
  }

  return escapeSql(s);
}

/**
 * Sanitize a WHERE clause from user input.
 *
 * The ArcGIS FeatureServer query spec allows SQL-like WHERE clauses.
 * We allow basic predicates but block dangerous patterns:
 *   - Statement terminators (;)
 *   - Multiple statements
 *   - DDL/DML keywords (DROP, DELETE, INSERT, UPDATE, ALTER, CREATE, EXEC)
 *   - Comment markers
 *   - COPY/ATTACH/DETACH (DuckDB-specific exfiltration)
 *
 * This is defense-in-depth — DuckDB's read-only scan functions
 * already prevent writes, but we block the patterns anyway.
 *
 * @param {string} where - User-supplied WHERE clause
 * @returns {string} The sanitized WHERE clause
 * @throws {Error} If the clause contains dangerous patterns
 */
function sanitizeWhere(where) {
  if (!where || where === '1=1' || where === '1 = 1') {
    return where;
  }

  const s = String(where);

  // Block statement terminators
  if (/;/.test(s)) {
    throw makeInjectionError('WHERE clause contains semicolon');
  }

  // Block comment markers
  if (/--/.test(s) || /\/\*/.test(s)) {
    throw makeInjectionError('WHERE clause contains comment');
  }

  // Block dangerous keywords (word-boundary match, case-insensitive)
  const blocked = [
    'DROP',
    'DELETE',
    'INSERT',
    'UPDATE',
    'ALTER',
    'CREATE',
    'EXEC',
    'EXECUTE',
    'TRUNCATE',
    'GRANT',
    'REVOKE',
    'COPY',
    'ATTACH',
    'DETACH',
    'EXPORT',
    'IMPORT',
    'CALL',
    'PRAGMA',
    'SET',
  ];
  const pattern = new RegExp(`\\b(${blocked.join('|')})\\b`, 'i');
  if (pattern.test(s)) {
    throw makeInjectionError('WHERE clause contains disallowed keyword');
  }

  return s;
}

/**
 * Sanitize column names from user input (outFields parameter).
 * Each column name must match identifier pattern — alphanumeric,
 * underscores, and dots (for qualified names).
 *
 * @param {string} outFields - Comma-separated field names or "*"
 * @returns {string[]} Array of safe column names
 */
function sanitizeOutFields(outFields) {
  if (!outFields || outFields === '*') return [];

  return outFields.split(',').map((f) => {
    const trimmed = f.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmed)) {
      throw makeInjectionError(`Invalid field name: ${trimmed}`);
    }
    return trimmed;
  });
}

function makeInjectionError(message) {
  const err = new Error(`SQL injection blocked: ${message}`);
  err.code = 400;
  return err;
}

module.exports = {
  escapeSql,
  quoteIdent,
  sanitizeSource,
  sanitizeWhere,
  sanitizeOutFields,
};
