export const POSTGRES_DIAGNOSTICS_CONTRACT_VERSION = 2;

export const POSTGRES_DIAGNOSTICS_QUERY = `
WITH
transaction_health AS (
  SELECT
    COALESCE(
      COUNT(*) FILTER (
        WHERE state = 'active'
          AND xact_start IS NOT NULL
          AND now() - xact_start > interval '5 minutes'
      ),
      0
    )::text AS long_transaction_count,
    COALESCE(
      MAX(
        EXTRACT(EPOCH FROM now() - xact_start)
      ) FILTER (
        WHERE state = 'active'
          AND xact_start IS NOT NULL
          AND now() - xact_start > interval '5 minutes'
      ),
      0
    )::bigint::text AS oldest_long_transaction_age_seconds,
    COALESCE(
      COUNT(*) FILTER (
        WHERE state = 'idle in transaction'
          AND xact_start IS NOT NULL
          AND now() - xact_start > interval '5 minutes'
      ),
      0
    )::text AS idle_in_transaction_count,
    COALESCE(
      MAX(
        EXTRACT(EPOCH FROM now() - xact_start)
      ) FILTER (
        WHERE state = 'idle in transaction'
          AND xact_start IS NOT NULL
          AND now() - xact_start > interval '5 minutes'
      ),
      0
    )::bigint::text AS oldest_idle_in_transaction_age_seconds
  FROM pg_stat_activity
  WHERE datname IS NOT NULL
),
table_health AS (
  SELECT
    COALESCE(
      COUNT(*) FILTER (
        WHERE n_live_tup > 0
          AND n_dead_tup::numeric > 0
          AND (n_dead_tup::numeric / NULLIF(n_live_tup::numeric, 0)) > 0.2
      ),
      0
    )::text AS table_health_risky_table_count,
    COALESCE(
      COUNT(*) FILTER (
        WHERE n_dead_tup::numeric > 0
          AND (n_dead_tup::numeric / NULLIF(n_live_tup::numeric, 0)) > 0.2
      ),
      0
    )::text AS table_health_requires_vacuum_count,
    COALESCE(
      COUNT(*) FILTER (WHERE n_mod_since_analyze > 1000),
      0
    )::text AS table_health_requires_analyze_count
  FROM pg_stat_user_tables
),
table_health_ranked AS (
  SELECT
    schemaname,
    relname,
    CASE
      WHEN n_live_tup > 0 THEN (n_dead_tup::numeric / NULLIF(n_live_tup::numeric, 0))
      ELSE 0
    END AS dead_tuple_ratio,
    n_dead_tup AS dead_tup_count,
    n_live_tup,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN n_live_tup > 0 THEN n_dead_tup::numeric / NULLIF(n_live_tup::numeric, 0) ELSE 0 END DESC,
        n_dead_tup DESC,
        n_live_tup DESC
    ) AS rn
  FROM pg_stat_user_tables
),
top_table_health AS (
  SELECT
    COALESCE(
      (SELECT format('%I.%I', schemaname, relname) FROM table_health_ranked WHERE rn = 1),
      'unavailable'
    ) AS table_health_top_risky_table,
    COALESCE(
      (
        SELECT dead_tuple_ratio
        FROM table_health_ranked
        WHERE rn = 1
      )::text,
      '0'
    ) AS table_health_top_risky_dead_tuple_ratio,
    COALESCE(
      (
        SELECT dead_tup_count
        FROM table_health_ranked
        WHERE rn = 1
      )::text,
      '0'
    ) AS table_health_top_risky_dead_tuple_count
  FROM (SELECT 1) AS _top_table_health_row
),
index_health AS (
  SELECT
    COALESCE(
      COUNT(*) FILTER (
        WHERE NOT idx.indisunique
          AND i.idx_scan = 0
          AND i.idx_tup_fetch = 0
      ),
      0
    )::text AS unused_index_candidates_count
  FROM pg_stat_user_indexes i
  LEFT JOIN pg_index idx ON idx.indexrelid = i.indexrelid
  WHERE i.schemaname NOT IN ('pg_catalog', 'information_schema')
),
wal_health AS (
  SELECT
    COALESCE((SELECT setting FROM pg_settings WHERE name = 'wal_level'), 'unavailable')::text AS wal_level,
    COALESCE((SELECT setting FROM pg_settings WHERE name = 'archive_mode'), 'unavailable')::text AS wal_archive_mode,
    COALESCE((SELECT COUNT(*) FROM pg_ls_waldir()), 0)::text AS wal_file_count,
    COALESCE((SELECT SUM(size) FROM pg_ls_waldir()), 0)::text AS wal_directory_size_bytes
),
capacity_health AS (
  SELECT
    COALESCE((SELECT pg_tablespace_size('pg_default')), 0)::text AS default_tablespace_size_bytes,
    COALESCE(
      (SELECT SUM(n_tup_ins + n_tup_upd + n_tup_del) FROM pg_stat_database WHERE datname IS NOT NULL),
      0
    )::text AS database_write_activity_rows
)
SELECT metric || '|' || value
FROM (
  SELECT 'database_count'::text AS metric, count(*)::text AS value
  FROM pg_database
  WHERE datistemplate = false
  UNION ALL
  SELECT 'active_connections', COUNT(*)::text
  FROM pg_stat_activity
  WHERE datname IS NOT NULL
    AND state = 'active'
  UNION ALL
  SELECT 'connection_count', COUNT(*)::text
  FROM pg_stat_activity
  WHERE datname IS NOT NULL
  UNION ALL
  SELECT 'max_connections', COALESCE(
    (SELECT setting FROM pg_settings WHERE name = 'max_connections'),
    'unavailable'
  )::text
  UNION ALL
  SELECT 'total_database_size_bytes', COALESCE(SUM(pg_database_size(datname)), 0)::text
  FROM pg_database
  WHERE datistemplate = false
  UNION ALL
  SELECT 'largest_database_name', COALESCE(
    (
      SELECT datname
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY pg_database_size(datname) DESC, datname
      LIMIT 1
    ),
    'unavailable'
  )
  UNION ALL
  SELECT 'largest_database_size_bytes', COALESCE(
    (
      SELECT pg_database_size(datname)::text
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY pg_database_size(datname) DESC, datname
      LIMIT 1
    ),
    '0'
  )
  UNION ALL
  SELECT 'slow_query_logging', COALESCE(
    (SELECT setting || COALESCE(unit, '') FROM pg_settings WHERE name = 'log_min_duration_statement'),
    'unavailable'
  )
  UNION ALL
  SELECT 'pg_stat_statements',
    CASE
      WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN 'installed'
      WHEN EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') THEN 'available'
      ELSE 'unavailable'
    END
  UNION ALL
  SELECT 'pg_stat_statements_available_version', COALESCE(
    (SELECT default_version FROM pg_available_extensions WHERE name = 'pg_stat_statements'),
    'unavailable'
  )
  UNION ALL
  SELECT 'pg_stat_statements_installed_version', COALESCE(
    (SELECT extversion FROM pg_extension WHERE extname = 'pg_stat_statements'),
    ''
  )
  UNION ALL
  SELECT 'shared_preload_libraries', COALESCE(
    (SELECT setting FROM pg_settings WHERE name = 'shared_preload_libraries'),
    'unavailable'
  )
  UNION ALL
  SELECT 'shared_buffers', COALESCE(
    (SELECT setting FROM pg_settings WHERE name = 'shared_buffers'),
    'unavailable'
  )
  UNION ALL
  SELECT 'work_mem', COALESCE(
    (SELECT setting || COALESCE(unit, '') FROM pg_settings WHERE name = 'work_mem'),
    'unavailable'
  )
  UNION ALL
  SELECT 'maintenance_work_mem', COALESCE(
    (SELECT setting || COALESCE(unit, '') FROM pg_settings WHERE name = 'maintenance_work_mem'),
    'unavailable'
  )
  UNION ALL
  SELECT 'effective_cache_size', COALESCE(
    (SELECT setting || COALESCE(unit, '') FROM pg_settings WHERE name = 'effective_cache_size'),
    'unavailable'
  )
  UNION ALL
  SELECT 'long_transaction_count', long_transaction_count FROM transaction_health
  UNION ALL
  SELECT 'oldest_long_transaction_age_seconds', oldest_long_transaction_age_seconds FROM transaction_health
  UNION ALL
  SELECT 'idle_in_transaction_count', idle_in_transaction_count FROM transaction_health
  UNION ALL
  SELECT 'oldest_idle_in_transaction_age_seconds', oldest_idle_in_transaction_age_seconds FROM transaction_health
  UNION ALL
  SELECT 'table_health_risky_table_count', table_health_risky_table_count FROM table_health
  UNION ALL
  SELECT 'table_health_requires_vacuum_count', table_health_requires_vacuum_count FROM table_health
  UNION ALL
  SELECT 'table_health_requires_analyze_count', table_health_requires_analyze_count FROM table_health
  UNION ALL
  SELECT 'table_health_top_risky_table', table_health_top_risky_table FROM top_table_health
  UNION ALL
  SELECT 'table_health_top_risky_dead_tuple_ratio', table_health_top_risky_dead_tuple_ratio FROM top_table_health
  UNION ALL
  SELECT 'table_health_top_risky_dead_tuple_count', table_health_top_risky_dead_tuple_count FROM top_table_health
  UNION ALL
  SELECT 'unused_index_candidates_count', unused_index_candidates_count FROM index_health
  UNION ALL
  SELECT 'wal_level', wal_level FROM wal_health
  UNION ALL
  SELECT 'wal_archive_mode', wal_archive_mode FROM wal_health
  UNION ALL
  SELECT 'wal_file_count', wal_file_count FROM wal_health
  UNION ALL
  SELECT 'wal_directory_size_bytes', wal_directory_size_bytes FROM wal_health
  UNION ALL
  SELECT 'default_tablespace_size_bytes', default_tablespace_size_bytes FROM capacity_health
  UNION ALL
  SELECT 'database_write_activity_rows', database_write_activity_rows FROM capacity_health
) metrics
ORDER BY metric;
`.trim();

export const POSTGRES_DIAGNOSTIC_KEYS = [
  'database_count',
  'active_connections',
  'connection_count',
  'max_connections',
  'total_database_size_bytes',
  'largest_database_name',
  'largest_database_size_bytes',
  'slow_query_logging',
  'pg_stat_statements',
  'pg_stat_statements_available_version',
  'pg_stat_statements_installed_version',
  'shared_preload_libraries',
  'shared_buffers',
  'work_mem',
  'maintenance_work_mem',
  'effective_cache_size',
  'long_transaction_count',
  'oldest_long_transaction_age_seconds',
  'idle_in_transaction_count',
  'oldest_idle_in_transaction_age_seconds',
  'table_health_risky_table_count',
  'table_health_requires_vacuum_count',
  'table_health_requires_analyze_count',
  'table_health_top_risky_table',
  'table_health_top_risky_dead_tuple_ratio',
  'table_health_top_risky_dead_tuple_count',
  'unused_index_candidates_count',
  'wal_level',
  'wal_archive_mode',
  'wal_file_count',
  'wal_directory_size_bytes',
  'default_tablespace_size_bytes',
  'database_write_activity_rows',
] as const;

export type PostgresDiagnosticKey = (typeof POSTGRES_DIAGNOSTIC_KEYS)[number];

export type RawPostgresDiagnostics = Partial<Record<PostgresDiagnosticKey, string>>;

export const REQUIRED_POSTGRES_DIAGNOSTIC_KEYS: PostgresDiagnosticKey[] = [
  'database_count',
  'active_connections',
  'connection_count',
  'max_connections',
  'total_database_size_bytes',
  'slow_query_logging',
  'pg_stat_statements',
  'shared_buffers',
] as const;

const INTEGER_POSTGRES_DIAGNOSTIC_KEYS: readonly PostgresDiagnosticKey[] = [
  'database_count',
  'active_connections',
  'connection_count',
  'max_connections',
  'total_database_size_bytes',
  'largest_database_size_bytes',
  'long_transaction_count',
  'oldest_long_transaction_age_seconds',
  'idle_in_transaction_count',
  'oldest_idle_in_transaction_age_seconds',
  'table_health_risky_table_count',
  'table_health_requires_vacuum_count',
  'table_health_requires_analyze_count',
  'table_health_top_risky_dead_tuple_count',
  'unused_index_candidates_count',
  'wal_file_count',
  'wal_directory_size_bytes',
  'default_tablespace_size_bytes',
  'database_write_activity_rows',
] as const;

const DECIMAL_POSTGRES_DIAGNOSTIC_KEYS: readonly PostgresDiagnosticKey[] = [
  'table_health_top_risky_dead_tuple_ratio',
] as const;

export const LONG_TRANSACTION_AGE_WARNING_SECONDS = 5 * 60;
export const LONG_TRANSACTION_COUNT_WARNING_THRESHOLD = 3;
export const IDLE_IN_TRANSACTION_AGE_WARNING_SECONDS = 5 * 60;
export const IDLE_IN_TRANSACTION_COUNT_WARNING_THRESHOLD = 2;
export const TABLE_HEALTH_DEAD_TUPLE_RATIO_WARNING = 0.2;
export const TABLE_HEALTH_DEAD_TUPLE_COUNT_WARNING = 1000;
export const UNUSED_INDEX_CANDIDATES_WARNING = 20;
export const WAL_DIRECTORY_SIZE_WARNING_BYTES = 5 * 1024 * 1024 * 1024;
export const TOTAL_DATABASE_SIZE_WARNING_BYTES = 50 * 1024 * 1024 * 1024;

export type PostgresDiagnosticsReport = {
  schemaVersion: number;
  databaseCount?: number;
  activeConnections?: number;
  connectionCount?: number;
  maxConnections?: number;
  connectionUtilizationPct?: number;
  totalDatabaseSizeBytes?: number;
  largestDatabaseName?: string;
  largestDatabaseSizeBytes?: number;
  slowQueryLogging?: string;
  pgStatStatements?: string;
  pgStatStatementsAvailableVersion?: string;
  pgStatStatementsInstalledVersion?: string;
  sharedPreloadLibraries?: string;
  sharedBuffers?: string;
  workMem?: string;
  maintenanceWorkMem?: string;
  effectiveCacheSize?: string;
  longTransactionCount?: number;
  oldestLongTransactionAgeSeconds?: number;
  idleInTransactionCount?: number;
  oldestIdleInTransactionAgeSeconds?: number;
  tableHealthRiskyTableCount?: number;
  tableHealthRequiresVacuumCount?: number;
  tableHealthRequiresAnalyzeCount?: number;
  tableHealthTopRiskyTable?: string;
  tableHealthTopRiskyDeadTupleRatio?: number;
  tableHealthTopRiskyDeadTupleCount?: number;
  unusedIndexCandidatesCount?: number;
  walLevel?: string;
  walArchiveMode?: string;
  walFileCount?: number;
  walDirectorySizeBytes?: number;
  defaultTablespaceSizeBytes?: number;
  databaseWriteActivityRows?: number;
};

const allowedKeys = new Set<string>(POSTGRES_DIAGNOSTIC_KEYS);

export function parsePostgresDiagnostics(output: string): RawPostgresDiagnostics {
  const diagnostics: RawPostgresDiagnostics = {};

  for (const rawLine of output.split(/\r?\n/iu)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf('|');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!value || !allowedKeys.has(key)) {
      continue;
    }

    diagnostics[key as PostgresDiagnosticKey] = value;
  }

  return diagnostics;
}

export function renderPostgresDiagnostics(diagnostics: RawPostgresDiagnostics): string | undefined {
  const connectionUtilizationPct = postgresConnectionUtilizationPct(diagnostics);
  const parts = POSTGRES_DIAGNOSTIC_KEYS.flatMap((key) => {
    const value = diagnostics[key];
    const rendered = value ? [`${key}=${value}`] : [];
    if (key === 'max_connections' && connectionUtilizationPct !== undefined) {
      rendered.push(`connection_utilization_pct=${connectionUtilizationPct}`);
    }

    return rendered;
  });

  return parts.length > 0 ? `OK PostgreSQL diagnostics ${parts.join(' ')}` : undefined;
}

export function missingPostgresDiagnosticKeys(diagnostics: RawPostgresDiagnostics): PostgresDiagnosticKey[] {
  return REQUIRED_POSTGRES_DIAGNOSTIC_KEYS.filter((key) => diagnostics[key] === undefined);
}

function integerDiagnostic(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/u.test(value)) {
    return undefined;
  }
  return Number.parseInt(value, 10);
}

function decimalDiagnostic(value: string | undefined): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?$/u.test(value)) {
    return undefined;
  }
  return Number.parseFloat(value);
}

export function malformedPostgresDiagnosticKeys(diagnostics: RawPostgresDiagnostics): PostgresDiagnosticKey[] {
  const malformed: PostgresDiagnosticKey[] = [];

  for (const key of INTEGER_POSTGRES_DIAGNOSTIC_KEYS) {
    const value = diagnostics[key];
    if (value !== undefined && integerDiagnostic(value) === undefined) {
      malformed.push(key);
    }
  }

  for (const key of DECIMAL_POSTGRES_DIAGNOSTIC_KEYS) {
    const value = diagnostics[key];
    if (value !== undefined && decimalDiagnostic(value) === undefined) {
      malformed.push(key);
    }
  }

  return malformed;
}

export function unavailablePostgresDiagnosticsWarning(
  diagnostics: RawPostgresDiagnostics,
  missingKeys: PostgresDiagnosticKey[],
): string {
  return Object.keys(diagnostics).length === 0
    ? 'no diagnostic rows returned'
    : `incomplete diagnostic rows: missing ${missingKeys.join(', ')}`;
}

export function postgresConnectionUtilizationPct(diagnostics: RawPostgresDiagnostics): number | undefined {
  const connectionCount = integerDiagnostic(diagnostics.connection_count);
  const maxConnections = integerDiagnostic(diagnostics.max_connections);
  if (connectionCount === undefined || maxConnections === undefined || maxConnections <= 0) {
    return undefined;
  }

  return Math.round((connectionCount / maxConnections) * 100);
}

export function postgresConnectionUtilizationWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const connectionCount = integerDiagnostic(diagnostics.connection_count);
  const maxConnections = integerDiagnostic(diagnostics.max_connections);
  const utilizationPct = postgresConnectionUtilizationPct(diagnostics);
  if (
    connectionCount === undefined ||
    maxConnections === undefined ||
    utilizationPct === undefined ||
    utilizationPct < 80
  ) {
    return undefined;
  }

  return `PostgreSQL connection utilization is high: ${utilizationPct}% of max_connections used (${connectionCount}/${maxConnections}).`;
}

export function postgresSlowQueryLoggingWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const slowQueryLogging = diagnostics.slow_query_logging?.trim();
  if (!slowQueryLogging || (!/^-1\s*(?:ms)?$/iu.test(slowQueryLogging) && !/^off$/iu.test(slowQueryLogging))) {
    return undefined;
  }

  return `PostgreSQL slow-query logging is disabled (log_min_duration_statement=${slowQueryLogging}). Enable it before performance triage.`;
}

export function postgresExtensionVisibilityWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  if (
    diagnostics.pg_stat_statements === 'available' &&
    diagnostics.pg_stat_statements_available_version &&
    !diagnostics.pg_stat_statements_installed_version
  ) {
    return 'PostgreSQL pg_stat_statements is available but not installed. Install it before query-level performance triage.';
  }

  return undefined;
}

export function postgresLongTransactionWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const longTransactionCount = integerDiagnostic(diagnostics.long_transaction_count);
  const oldestAgeSeconds = integerDiagnostic(diagnostics.oldest_long_transaction_age_seconds);
  if (
    longTransactionCount === undefined ||
    oldestAgeSeconds === undefined ||
    longTransactionCount < LONG_TRANSACTION_COUNT_WARNING_THRESHOLD ||
    oldestAgeSeconds < LONG_TRANSACTION_AGE_WARNING_SECONDS
  ) {
    return undefined;
  }

  return `PostgreSQL has ${longTransactionCount} long transaction(s) running longer than ${LONG_TRANSACTION_AGE_WARNING_SECONDS / 60} minutes (oldest ${oldestAgeSeconds}s).`;
}

export function postgresIdleInTransactionWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const idleTransactionCount = integerDiagnostic(diagnostics.idle_in_transaction_count);
  const oldestAgeSeconds = integerDiagnostic(diagnostics.oldest_idle_in_transaction_age_seconds);
  if (
    idleTransactionCount === undefined ||
    oldestAgeSeconds === undefined ||
    idleTransactionCount < IDLE_IN_TRANSACTION_COUNT_WARNING_THRESHOLD ||
    oldestAgeSeconds < IDLE_IN_TRANSACTION_AGE_WARNING_SECONDS
  ) {
    return undefined;
  }

  return `PostgreSQL has ${idleTransactionCount} transaction(s) idle in transaction for longer than ${
    IDLE_IN_TRANSACTION_AGE_WARNING_SECONDS / 60
  } minutes (oldest ${oldestAgeSeconds}s).`;
}

export function postgresTableHealthWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const riskyTables = integerDiagnostic(diagnostics.table_health_risky_table_count);
  const vacuumNeeded = integerDiagnostic(diagnostics.table_health_requires_vacuum_count);
  const analyzeNeeded = integerDiagnostic(diagnostics.table_health_requires_analyze_count);
  const deadTupleRatio = decimalDiagnostic(diagnostics.table_health_top_risky_dead_tuple_ratio);
  const deadTupleCount = integerDiagnostic(diagnostics.table_health_top_risky_dead_tuple_count);

  if (
    riskyTables === undefined ||
    vacuumNeeded === undefined ||
    analyzeNeeded === undefined ||
    deadTupleRatio === undefined ||
    deadTupleCount === undefined
  ) {
    return undefined;
  }

  if (deadTupleRatio < TABLE_HEALTH_DEAD_TUPLE_RATIO_WARNING || deadTupleCount < TABLE_HEALTH_DEAD_TUPLE_COUNT_WARNING) {
    return undefined;
  }

  const maxRiskyRatioPercent = Math.round(deadTupleRatio * 100);
  return `PostgreSQL table health risk: ${riskyTables} table(s) have high dead-tuple ratio; ${vacuumNeeded} table(s) need vacuum and ${analyzeNeeded} need analyze. Top risk: ${diagnostics.table_health_top_risky_table ?? 'unavailable'} (${maxRiskyRatioPercent}% dead tuples, ${deadTupleCount} dead tuples).`;
}

export function postgresUnusedIndexWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const candidates = integerDiagnostic(diagnostics.unused_index_candidates_count);
  if (candidates === undefined || candidates < UNUSED_INDEX_CANDIDATES_WARNING) {
    return undefined;
  }

  return `PostgreSQL has ${candidates} unused index candidates with no index scans. Review indexing strategy before adding new indexes.`;
}

export function postgresWalWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const walSizeBytes = integerDiagnostic(diagnostics.wal_directory_size_bytes);
  if (walSizeBytes !== undefined && walSizeBytes >= WAL_DIRECTORY_SIZE_WARNING_BYTES) {
    return `PostgreSQL WAL visibility warning: WAL directory is ${walSizeBytes} bytes, which is high and can increase disk pressure.`;
  }

  return undefined;
}

export function postgresCapacityWarning(diagnostics: RawPostgresDiagnostics): string | undefined {
  const totalDatabaseSizeBytes = integerDiagnostic(diagnostics.total_database_size_bytes);
  if (totalDatabaseSizeBytes === undefined || totalDatabaseSizeBytes < TOTAL_DATABASE_SIZE_WARNING_BYTES) {
    return undefined;
  }

  return `PostgreSQL capacity risk: total database size is ${totalDatabaseSizeBytes} bytes. Monitor growth and WAL retention settings before disk becomes constrained.`;
}

export function postgresPostgresWarnings(diagnostics: RawPostgresDiagnostics): string[] {
  const warnings: string[] = [];

  const connectionWarning = postgresConnectionUtilizationWarning(diagnostics);
  if (connectionWarning) {
    warnings.push(connectionWarning);
  }

  const slowQueryWarning = postgresSlowQueryLoggingWarning(diagnostics);
  if (slowQueryWarning) {
    warnings.push(slowQueryWarning);
  }

  const extensionWarning = postgresExtensionVisibilityWarning(diagnostics);
  if (extensionWarning) {
    warnings.push(extensionWarning);
  }

  const longTransactionWarning = postgresLongTransactionWarning(diagnostics);
  if (longTransactionWarning) {
    warnings.push(longTransactionWarning);
  }

  const idleTransactionWarning = postgresIdleInTransactionWarning(diagnostics);
  if (idleTransactionWarning) {
    warnings.push(idleTransactionWarning);
  }

  const tableHealthWarning = postgresTableHealthWarning(diagnostics);
  if (tableHealthWarning) {
    warnings.push(tableHealthWarning);
  }

  const indexWarning = postgresUnusedIndexWarning(diagnostics);
  if (indexWarning) {
    warnings.push(indexWarning);
  }

  const walWarning = postgresWalWarning(diagnostics);
  if (walWarning) {
    warnings.push(walWarning);
  }

  const capacityWarning = postgresCapacityWarning(diagnostics);
  if (capacityWarning) {
    warnings.push(capacityWarning);
  }

  return warnings;
}

export function structuredPostgresDiagnostics(diagnostics: RawPostgresDiagnostics): PostgresDiagnosticsReport {
  const connectionUtilizationPct = postgresConnectionUtilizationPct(diagnostics);
  const databaseCount = integerDiagnostic(diagnostics.database_count);
  const activeConnections = integerDiagnostic(diagnostics.active_connections);
  const connectionCount = integerDiagnostic(diagnostics.connection_count);
  const maxConnections = integerDiagnostic(diagnostics.max_connections);
  const totalDatabaseSizeBytes = integerDiagnostic(diagnostics.total_database_size_bytes);
  const largestDatabaseSizeBytes = integerDiagnostic(diagnostics.largest_database_size_bytes);
  const tableHealthRiskyTableCount = integerDiagnostic(diagnostics.table_health_risky_table_count);
  const tableHealthRequiresVacuumCount = integerDiagnostic(diagnostics.table_health_requires_vacuum_count);
  const tableHealthRequiresAnalyzeCount = integerDiagnostic(diagnostics.table_health_requires_analyze_count);
  const tableHealthTopRiskyDeadTupleRatio = decimalDiagnostic(diagnostics.table_health_top_risky_dead_tuple_ratio);
  const tableHealthTopRiskyDeadTupleCount = integerDiagnostic(diagnostics.table_health_top_risky_dead_tuple_count);
  const longTransactionCount = integerDiagnostic(diagnostics.long_transaction_count);
  const oldestLongTransactionAgeSeconds = integerDiagnostic(diagnostics.oldest_long_transaction_age_seconds);
  const idleInTransactionCount = integerDiagnostic(diagnostics.idle_in_transaction_count);
  const oldestIdleInTransactionAgeSeconds = integerDiagnostic(diagnostics.oldest_idle_in_transaction_age_seconds);
  const unusedIndexCandidatesCount = integerDiagnostic(diagnostics.unused_index_candidates_count);
  const walFileCount = integerDiagnostic(diagnostics.wal_file_count);
  const walDirectorySizeBytes = integerDiagnostic(diagnostics.wal_directory_size_bytes);
  const defaultTablespaceSizeBytes = integerDiagnostic(diagnostics.default_tablespace_size_bytes);
  const databaseWriteActivityRows = integerDiagnostic(diagnostics.database_write_activity_rows);

  const structured: PostgresDiagnosticsReport = {
    schemaVersion: POSTGRES_DIAGNOSTICS_CONTRACT_VERSION,
  };

  if (databaseCount !== undefined) structured.databaseCount = databaseCount;
  if (activeConnections !== undefined) structured.activeConnections = activeConnections;
  if (connectionCount !== undefined) structured.connectionCount = connectionCount;
  if (maxConnections !== undefined) structured.maxConnections = maxConnections;
  if (connectionUtilizationPct !== undefined) structured.connectionUtilizationPct = connectionUtilizationPct;
  if (totalDatabaseSizeBytes !== undefined) structured.totalDatabaseSizeBytes = totalDatabaseSizeBytes;
  if (diagnostics.largest_database_name) {
    structured.largestDatabaseName = diagnostics.largest_database_name;
  }
  if (largestDatabaseSizeBytes !== undefined) structured.largestDatabaseSizeBytes = largestDatabaseSizeBytes;
  if (diagnostics.slow_query_logging) {
    structured.slowQueryLogging = diagnostics.slow_query_logging;
  }
  if (diagnostics.pg_stat_statements) {
    structured.pgStatStatements = diagnostics.pg_stat_statements;
  }
  if (diagnostics.pg_stat_statements_available_version) {
    structured.pgStatStatementsAvailableVersion = diagnostics.pg_stat_statements_available_version;
  }
  if (diagnostics.pg_stat_statements_installed_version) {
    structured.pgStatStatementsInstalledVersion = diagnostics.pg_stat_statements_installed_version;
  }
  if (diagnostics.shared_preload_libraries) {
    structured.sharedPreloadLibraries = diagnostics.shared_preload_libraries;
  }
  if (diagnostics.shared_buffers) {
    structured.sharedBuffers = diagnostics.shared_buffers;
  }
  if (diagnostics.work_mem) {
    structured.workMem = diagnostics.work_mem;
  }
  if (diagnostics.maintenance_work_mem) {
    structured.maintenanceWorkMem = diagnostics.maintenance_work_mem;
  }
  if (diagnostics.effective_cache_size) {
    structured.effectiveCacheSize = diagnostics.effective_cache_size;
  }
  if (longTransactionCount !== undefined) {
    structured.longTransactionCount = longTransactionCount;
  }
  if (oldestLongTransactionAgeSeconds !== undefined) {
    structured.oldestLongTransactionAgeSeconds = oldestLongTransactionAgeSeconds;
  }
  if (idleInTransactionCount !== undefined) {
    structured.idleInTransactionCount = idleInTransactionCount;
  }
  if (oldestIdleInTransactionAgeSeconds !== undefined) {
    structured.oldestIdleInTransactionAgeSeconds = oldestIdleInTransactionAgeSeconds;
  }
  if (tableHealthRiskyTableCount !== undefined) {
    structured.tableHealthRiskyTableCount = tableHealthRiskyTableCount;
  }
  if (tableHealthRequiresVacuumCount !== undefined) {
    structured.tableHealthRequiresVacuumCount = tableHealthRequiresVacuumCount;
  }
  if (tableHealthRequiresAnalyzeCount !== undefined) {
    structured.tableHealthRequiresAnalyzeCount = tableHealthRequiresAnalyzeCount;
  }
  if (diagnostics.table_health_top_risky_table) {
    structured.tableHealthTopRiskyTable = diagnostics.table_health_top_risky_table;
  }
  if (tableHealthTopRiskyDeadTupleRatio !== undefined) {
    structured.tableHealthTopRiskyDeadTupleRatio = tableHealthTopRiskyDeadTupleRatio;
  }
  if (tableHealthTopRiskyDeadTupleCount !== undefined) {
    structured.tableHealthTopRiskyDeadTupleCount = tableHealthTopRiskyDeadTupleCount;
  }
  if (unusedIndexCandidatesCount !== undefined) {
    structured.unusedIndexCandidatesCount = unusedIndexCandidatesCount;
  }
  if (diagnostics.wal_level) {
    structured.walLevel = diagnostics.wal_level;
  }
  if (diagnostics.wal_archive_mode) {
    structured.walArchiveMode = diagnostics.wal_archive_mode;
  }
  if (walFileCount !== undefined) {
    structured.walFileCount = walFileCount;
  }
  if (walDirectorySizeBytes !== undefined) {
    structured.walDirectorySizeBytes = walDirectorySizeBytes;
  }
  if (defaultTablespaceSizeBytes !== undefined) {
    structured.defaultTablespaceSizeBytes = defaultTablespaceSizeBytes;
  }
  if (databaseWriteActivityRows !== undefined) {
    structured.databaseWriteActivityRows = databaseWriteActivityRows;
  }

  return structured;
}
