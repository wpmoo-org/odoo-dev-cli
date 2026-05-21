import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getDoctorReport, runDoctor, type DoctorCommandRunner } from '../src/doctor.js';
import { dailyActionScripts } from '../src/daily-actions.js';
import { markerPath } from '../src/environment.js';

const baseMetadata = {
  tool: '@wpmoo/toolkit',
  version: '0.8.35',
  product: 'odoo_sample_module',
  odooVersion: '19.0',
  devRepo: 'odoo_sample_module_dev',
  devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
  sourceRepos: [
    {
      url: 'https://github.com/example-org/odoo_sample_module.git',
      path: 'odoo_sample_module',
      addons: ['odoo_sample_module'],
    },
  ],
};

type RunnerResponse =
  | { stdout: string; stderr?: string }
  | Error;

function makeEnvironment(options: {
  metadata?: unknown;
  composeVersions?: string[];
  compactEnv?: string;
  env?: string;
  scripts?: string[];
  sourcePaths?: string[];
  composeFiles?: Record<string, string>;
} = {}): Promise<string> {
  return (async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-doctor-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(join(target, markerPath), JSON.stringify(options.metadata ?? baseMetadata, null, 2));

    if (options.composeFiles && Object.keys(options.composeFiles).length > 0) {
      for (const [relativePath, content] of Object.entries(options.composeFiles)) {
        await mkdir(dirname(join(target, relativePath)), { recursive: true });
        await writeFile(join(target, relativePath), content);
      }
    } else {
      for (const version of options.composeVersions ?? ['19.0']) {
        await writeFile(
          join(target, `docker-compose_${version}.yml`),
          'services:\n  odoo:\n    image: odoo\n',
        );
      }
      if (options.compactEnv) {
        await writeFile(join(target, 'compose.yaml'), 'services:\n  odoo:\n    image: odoo\n');
        await mkdir(join(target, 'compose'), { recursive: true });
        await writeFile(
          join(target, 'compose', `${options.compactEnv}.yaml`),
          'services:\n  odoo:\n    environment: []\n',
        );
      }
    }

    if (options.env !== undefined) {
      await writeFile(join(target, '.env'), options.env);
    }

    await mkdir(join(target, 'scripts'), { recursive: true });
    for (const script of options.scripts ?? Object.values(dailyActionScripts)) {
      await writeFile(join(target, 'scripts', script), '#!/usr/bin/env bash\n');
    }

    for (const sourcePath of options.sourcePaths ?? ['odoo_sample_module']) {
      await mkdir(join(target, 'odoo/custom/src/private', sourcePath), { recursive: true });
    }

    return target;
  })();
}

function doctorRunner(
  options: {
    calls?: string[][];
    responses?: Record<string, RunnerResponse>;
  } = {},
): DoctorCommandRunner {
  const responses: Record<string, RunnerResponse> = {
    'docker version': { stdout: 'Docker version 27.0.0\n' },
    'docker compose version': { stdout: 'Docker Compose version v2.30.0\n' },
    'git submodule status --recursive': new Error('fatal: not a git repository'),
    'gh auth status': { stdout: 'github.com\n  Logged in\n' },
    ...options.responses,
  };

  return async (command, args) => {
    options.calls?.push([command, ...args]);
    const response = responses[[command, ...args].join(' ')];
    if (response instanceof Error) {
      throw response;
    }
    if (!response) {
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    }
    return { stdout: response.stdout, stderr: response.stderr ?? '' };
  };
}

describe('doctor --postgres diagnostics depth', () => {
  it('includes a PostgreSQL diagnostics contract version in JSON report', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const runner = doctorRunner();
    const postgresRunner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|4',
            'connection_count|35',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'largest_database_name|devel',
            'largest_database_size_bytes|7340032',
            'slow_query_logging|500ms',
            'pg_stat_statements|installed',
            'pg_stat_statements_available_version|1.10',
            'pg_stat_statements_installed_version|1.10',
            'shared_preload_libraries|pg_stat_statements',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }

      return runner(command, args, options);
    };

    const report = await getDoctorReport(target, postgresRunner, { postgres: true });

    expect(report.postgres?.available).toBe(true);
    const rawPostgres = JSON.parse(JSON.stringify(report.postgres));
    expect(
      typeof rawPostgres?.contractVersion === 'number' ||
        typeof rawPostgres?.diagnostics?.schemaVersion === 'number',
    ).toBe(true);
  });

  it('warns on long-running transactions and retains structured long-transaction diagnostics', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const postgresRunner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|44',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'largest_database_name|devel',
            'largest_database_size_bytes|7340032',
            'slow_query_logging|500ms',
            'pg_stat_statements|installed',
            'pg_stat_statements_available_version|1.10',
            'pg_stat_statements_installed_version|1.10',
            'shared_preload_libraries|pg_stat_statements',
            'shared_buffers|128MB',
            'long_transaction_count|3',
            'oldest_long_transaction_age_seconds|400',
          ].join('\n'),
          stderr: '',
        };
      }

      return doctorRunner()(command, args, options);
    };

    const report = await getDoctorReport(target, postgresRunner, { postgres: true });

    expect(report.warnings.join(' ')).toContain('long transaction');
    const raw = JSON.parse(JSON.stringify(report.postgres?.diagnostics ?? {}));
    expect(raw.longTransactionCount).toBe(3);
    expect(raw.oldestLongTransactionAgeSeconds).toBe(400);
  });

  it('warns on idle-in-transaction sessions and retains structured idle diagnostics', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const postgresRunner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|10',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'largest_database_name|devel',
            'largest_database_size_bytes|7340032',
            'slow_query_logging|500ms',
            'pg_stat_statements|installed',
            'pg_stat_statements_available_version|1.10',
            'pg_stat_statements_installed_version|1.10',
            'shared_preload_libraries|pg_stat_statements',
            'shared_buffers|128MB',
            'idle_in_transaction_count|5',
            'oldest_idle_in_transaction_age_seconds|600',
          ].join('\n'),
          stderr: '',
        };
      }
      return doctorRunner()(command, args, options);
    };

    const report = await getDoctorReport(target, postgresRunner, { postgres: true });

    expect(report.warnings.join(' ')).toContain('idle in transaction');
    const raw = JSON.parse(JSON.stringify(report.postgres?.diagnostics ?? {}));
    expect(raw.idleInTransactionCount).toBe(5);
    expect(raw.oldestIdleInTransactionAgeSeconds).toBe(600);
  });

  it('warns on table health risks and surfaces top risky table diagnostics', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const postgresRunner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|42',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'largest_database_name|devel',
            'largest_database_size_bytes|7340032',
            'slow_query_logging|500ms',
            'pg_stat_statements|installed',
            'pg_stat_statements_available_version|1.10',
            'pg_stat_statements_installed_version|1.10',
            'shared_preload_libraries|pg_stat_statements',
            'shared_buffers|128MB',
            'table_health_risky_table_count|4',
            'table_health_requires_vacuum_count|4',
            'table_health_requires_analyze_count|2',
            'table_health_top_risky_table|public.sales_order',
            'table_health_top_risky_dead_tuple_ratio|0.42',
            'table_health_top_risky_dead_tuple_count|2500',
          ].join('\n'),
          stderr: '',
        };
      }
      return doctorRunner()(command, args, options);
    };

    const report = await getDoctorReport(target, postgresRunner, { postgres: true });

    expect(report.warnings.join(' ')).toContain('table health risk');
    const diagnostics = JSON.parse(JSON.stringify(report.postgres?.diagnostics ?? {}));
    expect(diagnostics.tableHealthRiskyTableCount).toBe(4);
    expect(diagnostics.tableHealthRequiresVacuumCount).toBe(4);
    expect(
      diagnostics.topRiskyTables ?? diagnostics.tableHealthTopRiskyTable,
    ).toBeTruthy();
  });

  it('warns on unused index candidates and keeps guidance non-prescriptive', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const postgresRunner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|10',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'largest_database_name|devel',
            'largest_database_size_bytes|7340032',
            'slow_query_logging|500ms',
            'pg_stat_statements|installed',
            'pg_stat_statements_available_version|1.10',
            'pg_stat_statements_installed_version|1.10',
            'shared_preload_libraries|pg_stat_statements',
            'shared_buffers|128MB',
            'unused_index_candidates_count|25',
          ].join('\n'),
          stderr: '',
        };
      }
      return doctorRunner()(command, args, options);
    };

    const report = await getDoctorReport(target, postgresRunner, { postgres: true });

    expect(report.warnings.join(' ')).toContain('unused index candidates');
    const joinedWarnings = report.warnings.join(' ');
    expect(joinedWarnings).not.toMatch(/\b(?:CREATE|DROP|ALTER|INSERT|UPDATE|DELETE)\b/);

    const diagnostics = JSON.parse(JSON.stringify(report.postgres?.diagnostics ?? {}));
    expect(diagnostics.unusedIndexCandidatesCount).toBe(25);
  });

  it('surfaces WAL and capacity rows and emits warning when high utilization is detected', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const postgresRunner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|90',
            'max_connections|100',
            'total_database_size_bytes|60000000000',
            'largest_database_name|devel',
            'largest_database_size_bytes|7340032',
            'slow_query_logging|500ms',
            'pg_stat_statements|installed',
            'pg_stat_statements_available_version|1.10',
            'pg_stat_statements_installed_version|1.10',
            'shared_preload_libraries|pg_stat_statements',
            'shared_buffers|128MB',
            'wal_level|replica',
            'wal_archive_mode|on',
            'wal_file_count|42',
            'wal_directory_size_bytes|6000000000',
            'default_tablespace_size_bytes|12000000000',
            'database_write_activity_rows|2400000',
          ].join('\n'),
          stderr: '',
        };
      }
      return doctorRunner()(command, args, options);
    };

    const report = await getDoctorReport(target, postgresRunner, { postgres: true });

    expect(report.warnings.join(' ')).toContain('WAL');
    expect(report.warnings.join(' ')).toContain('capacity risk');
    const diagnostics = JSON.parse(JSON.stringify(report.postgres?.diagnostics ?? {}));
    expect(diagnostics.walDirectorySizeBytes).toBe(6000000000);
    expect(diagnostics.walFileCount).toBe(42);
    expect(diagnostics.totalDatabaseSizeBytes).toBe(60000000000);
  });

  it('keeps partial PostgreSQL diagnostics non-fatal and marks postgres unavailable', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const postgresRunner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|1',
            'largest_database_name|devel',
          ].join('\n'),
          stderr: '',
        };
      }
      return doctorRunner()(command, args, options);
    };

    const report = await getDoctorReport(target, postgresRunner, { postgres: true });
    expect(report.ok).toBe(true);
    expect(report.postgres?.requested).toBe(true);
    expect(report.postgres?.available).toBe(false);
    expect(report.postgres?.warning).toContain('incomplete diagnostic rows');

    const output = await runDoctor(target, postgresRunner, { postgres: true });
    expect(output).toContain('WARN PostgreSQL diagnostics unavailable:');
  });
});
