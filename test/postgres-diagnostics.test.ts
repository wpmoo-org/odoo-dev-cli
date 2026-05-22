import { describe, expect, it } from 'vitest';

import {
  LONG_TRANSACTION_AGE_WARNING_SECONDS,
  IDLE_IN_TRANSACTION_AGE_WARNING_SECONDS,
  POSTGRES_DIAGNOSTICS_OPTIONAL_QUERIES,
  POSTGRES_DIAGNOSTICS_QUERY,
  malformedPostgresDiagnosticKeys,
  missingPostgresDiagnosticKeys,
  parsePostgresDiagnostics,
  postgresCapacityWarning,
  postgresIdleInTransactionWarning,
  postgresLongTransactionWarning,
  postgresPostgresWarnings,
  postgresTableHealthWarning,
  postgresUnusedIndexWarning,
  postgresWalWarning,
  renderPostgresDiagnostics,
  structuredPostgresDiagnostics,
} from '../src/postgres-diagnostics.js';

describe('PostgreSQL diagnostics parsing', () => {
  it('parses valid metric rows and ignores unknown rows', () => {
    const diagnostics = parsePostgresDiagnostics([
      'database_count|4',
      'active_connections|8',
      'database_count|not-a-number',
      'active_connections|',
      'pg_stat_statements|installed',
      'table_health_top_risky_dead_tuple_ratio|0.18',
      'garbage|value',
      '',
      'unused_index_candidates_count|21',
    ].join('\n'));

    expect(diagnostics).toEqual({
      database_count: 'not-a-number',
      active_connections: '8',
      pg_stat_statements: 'installed',
      table_health_top_risky_dead_tuple_ratio: '0.18',
      unused_index_candidates_count: '21',
    });
  });

  it('renders full diagnostics string with utilization when max_connections is present', () => {
    const diagnostics = parsePostgresDiagnostics([
      'database_count|4',
      'connection_count|42',
      'max_connections|100',
      'total_database_size_bytes|10',
      'pg_stat_statements|installed',
      'shared_buffers|128MB',
    ].join('\n'));

    expect(renderPostgresDiagnostics(diagnostics)).toContain('connection_utilization_pct=42');
  });
});

describe('PostgreSQL diagnostics structured output', () => {
  it('maps parsed metric values into diagnostics report', () => {
    const diagnostics = parsePostgresDiagnostics([
      'database_count|4',
      'active_connections|8',
      'connection_count|42',
      'max_connections|100',
      'total_database_size_bytes|5368709120',
      'largest_database_name|postgres',
      'largest_database_size_bytes|1073741824',
      'slow_query_logging|500ms',
      'pg_stat_statements|installed',
      'pg_stat_statements_available_version|1.10',
      'pg_stat_statements_installed_version|1.10',
      'shared_preload_libraries|pg_stat_statements',
      'shared_buffers|128MB',
      'work_mem|4MB',
      'maintenance_work_mem|64MB',
      'effective_cache_size|4GB',
      'long_transaction_count|3',
      'oldest_long_transaction_age_seconds|420',
      'idle_in_transaction_count|2',
      'oldest_idle_in_transaction_age_seconds|350',
      'table_health_risky_table_count|4',
      'table_health_requires_vacuum_count|4',
      'table_health_requires_analyze_count|1',
      'table_health_top_risky_table|public.partner',
      'table_health_top_risky_dead_tuple_ratio|0.31',
      'table_health_top_risky_dead_tuple_count|1234',
      'unused_index_candidates_count|21',
      'wal_level|replica',
      'wal_archive_mode|on',
      'wal_file_count|12',
      'wal_directory_size_bytes|1099511627',
      'default_tablespace_size_bytes|268435456',
      'database_write_activity_rows|12345',
    ].join('\n'));

    const structured = structuredPostgresDiagnostics(diagnostics);

    expect(structured).toEqual({
      schemaVersion: 2,
      databaseCount: 4,
      activeConnections: 8,
      connectionCount: 42,
      maxConnections: 100,
      connectionUtilizationPct: 42,
      totalDatabaseSizeBytes: 5368709120,
      largestDatabaseName: 'postgres',
      largestDatabaseSizeBytes: 1073741824,
      slowQueryLogging: '500ms',
      pgStatStatements: 'installed',
      pgStatStatementsAvailableVersion: '1.10',
      pgStatStatementsInstalledVersion: '1.10',
      sharedPreloadLibraries: 'pg_stat_statements',
      sharedBuffers: '128MB',
      workMem: '4MB',
      maintenanceWorkMem: '64MB',
      effectiveCacheSize: '4GB',
      longTransactionCount: 3,
      oldestLongTransactionAgeSeconds: 420,
      idleInTransactionCount: 2,
      oldestIdleInTransactionAgeSeconds: 350,
      tableHealthRiskyTableCount: 4,
      tableHealthRequiresVacuumCount: 4,
      tableHealthRequiresAnalyzeCount: 1,
      tableHealthTopRiskyTable: 'public.partner',
      tableHealthTopRiskyDeadTupleRatio: 0.31,
      tableHealthTopRiskyDeadTupleCount: 1234,
      unusedIndexCandidatesCount: 21,
      walLevel: 'replica',
      walArchiveMode: 'on',
      walFileCount: 12,
      walDirectorySizeBytes: 1099511627,
      defaultTablespaceSizeBytes: 268435456,
      databaseWriteActivityRows: 12345,
    });
  });
});

describe('PostgreSQL diagnostics warnings', () => {
  it('warns on long transactions', () => {
    expect(
      postgresLongTransactionWarning({
        long_transaction_count: '3',
        oldest_long_transaction_age_seconds: `${LONG_TRANSACTION_AGE_WARNING_SECONDS}`,
      }),
    ).toContain('long transaction(s)');
  });

  it('warns on idle in transaction duration and count', () => {
    expect(
      postgresIdleInTransactionWarning({
        idle_in_transaction_count: '2',
        oldest_idle_in_transaction_age_seconds: `${IDLE_IN_TRANSACTION_AGE_WARNING_SECONDS}`,
      }),
    ).toContain('idle in transaction');
  });

  it('warns on table health risk', () => {
    expect(
      postgresTableHealthWarning({
        table_health_risky_table_count: '3',
        table_health_requires_vacuum_count: '3',
        table_health_requires_analyze_count: '1',
        table_health_top_risky_dead_tuple_ratio: '0.22',
        table_health_top_risky_dead_tuple_count: '1200',
        table_health_top_risky_table: 'public.partner',
      }),
    ).toContain('table health risk');
  });

  it('warns for unused index candidates', () => {
    expect(postgresUnusedIndexWarning({ unused_index_candidates_count: '20' })).toContain('unused index candidates');
  });

  it('warns on large WAL directory and large database size', () => {
    expect(
      postgresWalWarning({
        wal_directory_size_bytes: `${5 * 1024 * 1024 * 1024}`,
      }),
    ).toBeDefined();
    expect(
      postgresCapacityWarning({
        total_database_size_bytes: `${50 * 1024 * 1024 * 1024}`,
      }),
    ).toContain('capacity risk');
  });

  it('aggregates all warnings in stable order', () => {
    expect(
      postgresPostgresWarnings({
        connection_count: '100',
        max_connections: '100',
        slow_query_logging: '-1',
        long_transaction_count: '3',
        oldest_long_transaction_age_seconds: `${LONG_TRANSACTION_AGE_WARNING_SECONDS}`,
        idle_in_transaction_count: '2',
        oldest_idle_in_transaction_age_seconds: `${IDLE_IN_TRANSACTION_AGE_WARNING_SECONDS}`,
        table_health_risky_table_count: '3',
        table_health_requires_vacuum_count: '3',
        table_health_requires_analyze_count: '2',
        table_health_top_risky_dead_tuple_ratio: '0.25',
        table_health_top_risky_dead_tuple_count: '1500',
        table_health_top_risky_table: 'public.partner',
        pg_stat_statements: 'available',
        pg_stat_statements_available_version: '1.10',
        unused_index_candidates_count: '40',
        wal_directory_size_bytes: `${5 * 1024 * 1024 * 1024 + 1}`,
        total_database_size_bytes: `${50 * 1024 * 1024 * 1024 + 1}`,
      }),
    ).toEqual([
      'PostgreSQL connection utilization is high: 100% of max_connections used (100/100).',
      'PostgreSQL slow-query logging is disabled (log_min_duration_statement=-1). Enable it before performance triage.',
      'PostgreSQL pg_stat_statements is available but not installed. Install it before query-level performance triage.',
      'PostgreSQL has 3 long transaction(s) running longer than 5 minutes (oldest 300s).',
      'PostgreSQL has 2 transaction(s) idle in transaction for longer than 5 minutes (oldest 300s).',
      'PostgreSQL table health risk: 3 table(s) have high dead-tuple ratio; 3 table(s) need vacuum and 2 need analyze. Top risk: public.partner (25% dead tuples, 1500 dead tuples).',
      'PostgreSQL has 40 unused index candidates with no index scans. Review indexing strategy before adding new indexes.',
      'PostgreSQL WAL visibility warning: WAL directory is 5368709121 bytes, which is high and can increase disk pressure.',
      'PostgreSQL capacity risk: total database size is 53687091201 bytes. Monitor growth and WAL retention settings before disk becomes constrained.',
    ]);
  });
});

describe('PostgreSQL diagnostics validation and SQL safety', () => {
  it('returns missing required metric keys', () => {
    expect(
      missingPostgresDiagnosticKeys({
        database_count: '4',
      }),
    ).toEqual([
      'active_connections',
      'connection_count',
      'max_connections',
      'total_database_size_bytes',
      'slow_query_logging',
      'pg_stat_statements',
      'shared_buffers',
    ]);
  });

  it('detects malformed diagnostics for numeric and decimal metrics', () => {
    expect(
      malformedPostgresDiagnosticKeys({
        database_count: 'two',
        table_health_top_risky_dead_tuple_ratio: '0,33',
      }),
    ).toEqual(['database_count', 'table_health_top_risky_dead_tuple_ratio']);
  });

  it('rejects destructive SQL verbs in the diagnostic query', () => {
    const uppercaseQuery = [
      POSTGRES_DIAGNOSTICS_QUERY,
      ...POSTGRES_DIAGNOSTICS_OPTIONAL_QUERIES.map((probe) => probe.query),
    ].join('\n').toUpperCase();
    const forbiddenVerbs = ['ALTER', 'CREATE', 'DELETE', 'DROP', 'INSERT', 'UPDATE', 'TRUNCATE', 'REINDEX', 'VACUUM', 'ANALYZE'];
    for (const verb of forbiddenVerbs) {
      expect(uppercaseQuery).not.toMatch(new RegExp(`\\\\b${verb}\\\\b`));
    }
  });

  it('keeps privileged probes outside the core diagnostics query', () => {
    expect(POSTGRES_DIAGNOSTICS_QUERY).not.toContain('pg_ls_waldir');
    expect(POSTGRES_DIAGNOSTICS_QUERY).not.toContain('pg_tablespace_size');
    expect(POSTGRES_DIAGNOSTICS_OPTIONAL_QUERIES.map((probe) => probe.id)).toEqual([
      'wal-directory',
      'default-tablespace',
    ]);
    expect(POSTGRES_DIAGNOSTICS_OPTIONAL_QUERIES.map((probe) => probe.query).join('\n')).toContain('pg_ls_waldir');
    expect(POSTGRES_DIAGNOSTICS_OPTIONAL_QUERIES.map((probe) => probe.query).join('\n')).toContain('pg_tablespace_size');
  });
});
