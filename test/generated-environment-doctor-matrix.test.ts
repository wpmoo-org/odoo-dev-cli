import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dailyActionScripts } from '../src/daily-actions.js';
import { runDoctor, type DoctorCommandRunner } from '../src/doctor.js';
import { markerPath } from '../src/environment.js';

const metadata = {
  tool: '@wpmoo/odoo',
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
        'OK metadata .wpmoo/odoo.json',
        'OK engine compose',
        'OK Odoo version 19.0',
        'OK compose files docker-compose_19.0.yml',
        'OK scripts 14 checked',
        'OK source repos 1 checked',
        'OK .env ports HTTP_PORT=10019 GEVENT_PORT=20019',
        'OK docker CLI',
        'OK docker compose',
        'OK git submodules skipped (not a git checkout)',
        'OK GitHub CLI auth',
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
