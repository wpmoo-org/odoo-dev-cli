import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dailyActionScripts } from '../src/daily-actions.js';
import { getDoctorReport, runDoctor, type DoctorCommandRunner } from '../src/doctor.js';
import { POSTGRES_DIAGNOSTICS_CONTRACT_VERSION } from '../src/postgres-diagnostics.js';
import { markerPath } from '../src/environment.js';

const metadata = {
  tool: '@wpmoo/toolkit',
  version: '0.8.35',
  product: 'matrix_module',
  odooVersion: '19.0',
  devRepo: 'matrix_module_dev',
  devRepoUrl: 'https://github.com/example-org/matrix_module_dev.git',
  sourceRepos: [
    {
      url: 'https://github.com/example-org/matrix_module.git',
      path: 'matrix_module',
      addons: ['matrix_module'],
    },
  ],
};

type RunnerResponse = { stdout: string; stderr?: string } | Error;

function fakeRunner(responses: Record<string, RunnerResponse> = {}): DoctorCommandRunner {
  const defaults: Record<string, RunnerResponse> = {
    'docker version': { stdout: 'Docker version 27.0.0\n' },
    'docker compose version': { stdout: 'Docker Compose version v2.30.0\n' },
    'git submodule status --recursive': new Error('fatal: not a git repository'),
    'gh auth status': { stdout: 'github.com\n  Logged in\n' },
  };
  const table = { ...defaults, ...responses };

  return async (command, args) => {
    const response = table[[command, ...args].join(' ')];
    if (response instanceof Error) throw response;
    if (!response) throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    return { stdout: response.stdout, stderr: response.stderr ?? '' };
  };
}

async function makeGeneratedEnvironment(options: {
  composeVersions?: string[];
  compactEnv?: string;
  env?: string;
  scripts?: string[];
  sourcePaths?: string[];
  composeFiles?: Record<string, string>;
} = {}): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), 'wpmoo-generated-doctor-matrix-'));
  await mkdir(join(target, '.wpmoo'), { recursive: true });
  await writeFile(join(target, markerPath), JSON.stringify(metadata, null, 2), 'utf8');

  if (options.composeFiles && Object.keys(options.composeFiles).length > 0) {
    for (const [relativePath, content] of Object.entries(options.composeFiles)) {
      await mkdir(dirname(join(target, relativePath)), { recursive: true });
      await writeFile(join(target, relativePath), content, 'utf8');
    }
  } else {
    for (const version of options.composeVersions ?? ['19.0']) {
      await writeFile(
        join(target, `docker-compose_${version}.yml`),
        'services:\n  odoo:\n    image: odoo\n',
        'utf8',
      );
    }
    if (options.compactEnv) {
      await writeFile(join(target, 'compose.yaml'), 'services:\n  odoo:\n    image: odoo\n', 'utf8');
      await mkdir(join(target, 'compose'), { recursive: true });
      await writeFile(
        join(target, 'compose', `${options.compactEnv}.yaml`),
        'services:\n  odoo:\n    environment: []\n',
        'utf8',
      );
    }
  }

  if (options.env !== undefined) {
    await writeFile(join(target, '.env'), options.env, 'utf8');
  }

  await mkdir(join(target, 'scripts'), { recursive: true });
  for (const script of options.scripts ?? Object.values(dailyActionScripts)) {
    await writeFile(join(target, 'scripts', script), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  }

  for (const sourcePath of options.sourcePaths ?? ['matrix_module']) {
    await mkdir(join(target, 'odoo/custom/src/private', sourcePath), { recursive: true });
  }

  return target;
}

describe('generated environment doctor matrix', () => {
  it('passes a complete generated-like compose environment', async () => {
    const target = await makeGeneratedEnvironment({
      env: 'ODOO_VERSION=19.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, fakeRunner())).resolves.toBe(
      [
        'WPMoo doctor',
        'Generated files',
        'OK metadata .wpmoo/odoo.json',
        'OK engine compose',
        'OK Odoo version 19.0',
        'OK scripts 14 checked',
        'Compose',
        'OK compose files docker-compose_19.0.yml',
        'OK .env ports HTTP_PORT=10019 GEVENT_PORT=20019',
        'Source repositories',
        'OK source repos 1 checked',
        'OK git submodules skipped (not a git checkout)',
        'OK GitHub CLI auth',
        'Module quality',
        'OK module quality 0 modules scanned',
        'Host tools',
        'OK docker CLI',
        'OK docker compose',
        'Doctor checks passed.',
      ].join('\n'),
    );
  });

  it('requires compose file matching ODOO_VERSION from .env', async () => {
    const target = await makeGeneratedEnvironment({
      composeVersions: ['19.0'],
      env: 'ODOO_VERSION=18.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, fakeRunner())).rejects.toThrow(
      'Missing compose file: docker-compose_18.0.yml',
    );
  });

  it('rejects invalid .env ODOO_VERSION before checking generated legacy compose paths', async () => {
    const target = await makeGeneratedEnvironment({
      env: 'ODOO_VERSION=../18.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, fakeRunner())).rejects.toThrow(
      'Invalid Odoo version for compose file: ../18.0',
    );
  });

  it('passes a generated-like compact compose environment', async () => {
    const target = await makeGeneratedEnvironment({
      composeVersions: [],
      compactEnv: 'dev',
      env: 'ODOO_VERSION=18.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, fakeRunner())).resolves.toContain(
      'OK compose files compose.yaml, compose/dev.yaml',
    );
  });

  it('requires the WPMOO_ENV selected compact compose overlay', async () => {
    const target = await makeGeneratedEnvironment({
      composeVersions: [],
      compactEnv: 'dev',
      env: 'WPMOO_ENV=stage\nODOO_VERSION=19.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, fakeRunner())).rejects.toThrow(
      'Missing compact compose overlay for WPMOO_ENV=stage: compose/stage.yaml',
    );
  });

  it('fails generated environments with PostgreSQL 18 bad mounts in compose overlays', async () => {
    const target = await makeGeneratedEnvironment({
      composeVersions: [],
      compactEnv: 'dev',
      env: [
        'ODOO_VERSION=19.0',
        'POSTGRES_IMAGE=postgres:18',
        'HTTP_PORT=10019',
        'GEVENT_PORT=20019',
      ].join('\n'),
      composeFiles: {
        'compose.yaml':
          'services:\n  odoo:\n    image: odoo:19\n',
        'compose/dev.yaml':
          'services:\n  db:\n    volumes:\n      - pg-data:/var/lib/postgresql/18/docker\n',
      },
    });

    await expect(runDoctor(target, fakeRunner())).rejects.toThrow(
      "PostgreSQL 18 compatibility issue in 'compose/dev.yaml': mount target '/var/lib/postgresql/18/docker' is invalid",
    );
  });

  it('fails invalid and equal HTTP/GEVENT .env ports', async () => {
    const invalid = await makeGeneratedEnvironment({
      env: 'HTTP_PORT=nope\nGEVENT_PORT=20019\n',
    });
    await expect(runDoctor(invalid, fakeRunner())).rejects.toThrow(
      'Invalid HTTP_PORT in .env: expected a non-empty numeric value',
    );

    const equal = await makeGeneratedEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=10019\n',
    });
    await expect(runDoctor(equal, fakeRunner())).rejects.toThrow(
      'HTTP_PORT and GEVENT_PORT in .env must not be equal',
    );
  });

  it('fails when a required daily script is missing', async () => {
    const scripts = Object.values(dailyActionScripts).filter((name) => name !== 'snapshot.sh');
    const target = await makeGeneratedEnvironment({ scripts });

    await expect(runDoctor(target, fakeRunner())).rejects.toThrow(
      'Missing daily action script: scripts/snapshot.sh',
    );
  });

  it('treats GitHub auth failure as warning without failing doctor', async () => {
    const target = await makeGeneratedEnvironment();
    const runner = fakeRunner({
      'gh auth status': new Error('not logged in'),
    });

    await expect(runDoctor(target, runner)).resolves.toContain('WARN GitHub CLI auth: not logged in');
    await expect(runDoctor(target, runner)).resolves.toContain('Doctor checks passed.');
  });

  it('reports incomplete Train 7 PostgreSQL diagnostic rows as non-fatal and stable', async () => {
    const target = await makeGeneratedEnvironment({
      env: 'ODOO_VERSION=19.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = fakeRunner();
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: 'database_count|1\nshared_buffers|128MB\n',
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });
    const diagnostics = report.postgres?.diagnostics as Record<string, unknown>;

    expect(report.ok).toBe(true);
    expect(report.postgres).toEqual({
      requested: true,
      contractVersion: POSTGRES_DIAGNOSTICS_CONTRACT_VERSION,
      available: false,
      diagnostics: {
        schemaVersion: POSTGRES_DIAGNOSTICS_CONTRACT_VERSION,
        databaseCount: 1,
        sharedBuffers: '128MB',
      },
      warning:
        'incomplete diagnostic rows: missing active_connections, connection_count, max_connections, total_database_size_bytes, slow_query_logging, pg_stat_statements',
    });
    expect(diagnostics).toMatchObject({
      databaseCount: 1,
      sharedBuffers: '128MB',
    });
    expect(report.warnings).toEqual([
      'PostgreSQL diagnostics unavailable: incomplete diagnostic rows: missing active_connections, connection_count, max_connections, total_database_size_bytes, slow_query_logging, pg_stat_statements',
    ]);
    expect(report.errors).toEqual([]);
  });

  it('accepts full Train 7 diagnostic rows with expanded structured output', async () => {
    const target = await makeGeneratedEnvironment({
      env: 'ODOO_VERSION=19.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|4',
            'active_connections|3',
            'connection_count|12',
            'max_connections|100',
            'total_database_size_bytes|512000',
            'largest_database_name|postgres',
            'largest_database_size_bytes|10240',
            'slow_query_logging|250ms',
            'pg_stat_statements|installed',
            'pg_stat_statements_available_version|1.10',
            'pg_stat_statements_installed_version|1.10',
            'shared_preload_libraries|pg_stat_statements',
            'shared_buffers|128MB',
            'long_transaction_count|2',
            'oldest_long_transaction_age_seconds|420',
            'idle_in_transaction_count|1',
            'oldest_idle_in_transaction_age_seconds|240',
            'table_health_risky_table_count|4',
            'table_health_requires_vacuum_count|3',
            'table_health_requires_analyze_count|1',
            'table_health_top_risky_table|public.partner',
            'table_health_top_risky_dead_tuple_ratio|0.37',
            'table_health_top_risky_dead_tuple_count|512',
            'unused_index_candidates_count|11',
            'wal_level|logical',
            'wal_archive_mode|on',
            'wal_file_count|14',
            'wal_directory_size_bytes|65536',
            'default_tablespace_size_bytes|20480',
            'database_write_activity_rows|300',
          ].join('\n'),
          stderr: '',
        };
      }

      return fakeRunner()(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });
    const diagnostics = report.postgres?.diagnostics as Record<string, unknown>;

    expect(report.ok).toBe(true);
    expect(report.postgres).toEqual(
      expect.objectContaining({
        requested: true,
        available: true,
      }),
    );
    expect(report.postgres?.warning).toBeUndefined();
    expect(report.warnings).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(diagnostics).toMatchObject({
      schemaVersion: POSTGRES_DIAGNOSTICS_CONTRACT_VERSION,
      databaseCount: 4,
      activeConnections: 3,
      connectionCount: 12,
      maxConnections: 100,
      connectionUtilizationPct: 12,
      totalDatabaseSizeBytes: 512000,
      largestDatabaseName: 'postgres',
      largestDatabaseSizeBytes: 10240,
      longTransactionCount: 2,
      oldestLongTransactionAgeSeconds: 420,
      tableHealthRiskyTableCount: 4,
      tableHealthRequiresVacuumCount: 3,
      tableHealthTopRiskyTable: 'public.partner',
      unusedIndexCandidatesCount: 11,
      defaultTablespaceSizeBytes: 20480,
      databaseWriteActivityRows: 300,
    });
  });

  it('fails when source submodule status reports an uninitialized repo', async () => {
    const sha = 'a'.repeat(40);
    const target = await makeGeneratedEnvironment();
    const runner = fakeRunner({
      'git submodule status --recursive': {
        stdout: `-${sha} odoo/custom/src/private/matrix_module`,
      },
    });

    await expect(runDoctor(target, runner)).rejects.toThrow(
      'Uninitialized Git submodule: odoo/custom/src/private/matrix_module',
    );
  });
});
