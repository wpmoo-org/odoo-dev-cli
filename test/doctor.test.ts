import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getDoctorReport, runDoctor, type DoctorCommandRunner } from '../src/doctor.js';
import { dailyActionScripts } from '../src/daily-actions.js';
import { markerPath } from '../src/environment.js';
import { sourceManifestPath } from '../src/source-manifest.js';

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

async function makeEnvironment(options: {
  metadata?: unknown;
  composeVersions?: string[];
  compactEnv?: string;
  env?: string;
  scripts?: string[];
  sourcePaths?: string[];
  composeFiles?: Record<string, string>;
} = {}): Promise<string> {
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
}

type RunnerResponse =
  | { stdout: string; stderr?: string }
  | Error;

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

function passingDockerRunner(calls: string[][] = []): DoctorCommandRunner {
  return doctorRunner({ calls });
}

describe('doctor', () => {
  it('passes a generated compose environment with defaulted engine metadata', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'ODOO_VERSION=19.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, passingDockerRunner(calls))).resolves.toBe(
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
    expect(calls).toEqual([
      ['docker', 'version'],
      ['docker', 'compose', 'version'],
      ['git', 'submodule', 'status', '--recursive'],
      ['gh', 'auth', 'status'],
    ]);
  });

  it('requires the metadata file to exist and parse', async () => {
    const missingMetadata = await mkdtemp(join(tmpdir(), 'wpmoo-doctor-missing-'));
    await expect(runDoctor(missingMetadata, passingDockerRunner())).rejects.toThrow(
      'Missing metadata file: .wpmoo/odoo.json',
    );

    const invalidMetadata = await mkdtemp(join(tmpdir(), 'wpmoo-doctor-invalid-'));
    await mkdir(join(invalidMetadata, '.wpmoo'), { recursive: true });
    await writeFile(join(invalidMetadata, markerPath), '{invalid');
    await expect(runDoctor(invalidMetadata, passingDockerRunner())).rejects.toThrow(
      'Invalid metadata JSON in .wpmoo/odoo.json',
    );
  });

  it('explains migration steps for legacy generated environments without metadata', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-doctor-legacy-metadata-'));
    await writeFile(join(target, 'docker-compose_19.0.yml'), 'services:\n  odoo:\n    image: odoo\n');
    await mkdir(join(target, 'odoo/custom/src/legacy_repo'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/repos.yaml'), 'odoo:\n');
    await writeFile(join(target, 'odoo/custom/src/addons.yaml'), 'legacy_repo:\n  - moo_test\n');

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Legacy WPMoo environment is missing .wpmoo/odoo.json; run ./moo reset --dry-run to preview generated metadata migration.',
    );
    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Legacy source layout detected: odoo/custom/src/legacy_repo will be registered as private/legacy_repo.',
    );
  });

  it('accepts legacy source folders registered as private after migration', async () => {
    const target = await makeEnvironment({
      metadata: {
        ...baseMetadata,
        sourceRepos: [
          {
            url: 'https://github.com/example-org/legacy_repo.git',
            path: 'legacy_repo',
            sourceType: 'private',
            addons: ['moo_test'],
          },
        ],
      },
      sourcePaths: [],
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    await mkdir(join(target, 'odoo/custom/src/legacy_repo'), { recursive: true });

    await expect(runDoctor(target, passingDockerRunner())).resolves.toContain(
      'WARN Legacy private source path in use: odoo/custom/src/legacy_repo; move it to odoo/custom/src/private/legacy_repo when ready.',
    );
  });

  it('surfaces module quality findings as advisory warnings without failing doctor', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module/demo_module');
    await mkdir(modulePath, { recursive: true });
    await writeFile(
      join(modulePath, '__manifest__.py'),
      [
        '{',
        "  'name': 'Demo',",
        "  'installable': True,",
        "  'depends': ['base'],",
        "  'data': [],",
        '}',
        '',
      ].join('\n'),
    );

    const report = await getDoctorReport(target, passingDockerRunner());

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        'Module quality advisory: odoo/custom/src/private/odoo_sample_module/demo_module: missing license in __manifest__.py',
      ]),
    );
    expect(report.errors).toEqual([]);
    expect(await runDoctor(target, passingDockerRunner())).toContain(
      'WARN Module quality advisory: odoo/custom/src/private/odoo_sample_module/demo_module: missing license in __manifest__.py',
    );
  });

  it('fails doctor when duplicate addon technical names are found', async () => {
    const target = await makeEnvironment({
      metadata: {
        ...baseMetadata,
        sourceRepos: [
          { url: 'https://github.com/example-org/repo_a.git', path: 'repo_a', addons: [] },
          { url: 'https://github.com/example-org/repo_b.git', path: 'repo_b', addons: [] },
        ],
      },
      sourcePaths: ['repo_a', 'repo_b'],
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    for (const repo of ['repo_a', 'repo_b']) {
      const modulePath = join(target, 'odoo/custom/src/private', repo, 'demo_duplicate');
      await mkdir(join(modulePath, 'views'), { recursive: true });
      await mkdir(join(modulePath, 'security'), { recursive: true });
      await mkdir(join(modulePath, 'tests'), { recursive: true });
      await writeFile(
        join(modulePath, '__manifest__.py'),
        [
          '{',
          "  'name': 'Demo',",
          "  'installable': True,",
          "  'version': '1.0.0',",
          "  'license': 'LGPL-3',",
          "  'depends': ['base'],",
          "  'data': ['security/ir.model.access.csv', 'views/demo_views.xml'],",
          '}',
          '',
        ].join('\n'),
      );
      await writeFile(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
      await writeFile(
        join(modulePath, 'views', 'demo_views.xml'),
        '<odoo><record id="action_demo" model="ir.actions.act_window"/><menuitem id="menu_demo" action="action_demo"/></odoo>\n',
      );
    }

    const report = await getDoctorReport(target, passingDockerRunner());

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Module quality error: odoo/custom/src/private/repo_a/demo_duplicate: duplicate addon technical name: demo_duplicate'),
      ]),
    );
    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Module quality error: odoo/custom/src/private/repo_a/demo_duplicate: duplicate addon technical name: demo_duplicate',
    );
  });

  it('fails doctor when configured dependency policy is violated', async () => {
    const target = await makeEnvironment({
      metadata: {
        ...baseMetadata,
        sourceRepos: [{ url: 'https://github.com/example-org/policy_repo.git', path: 'policy_repo', addons: [] }],
      },
      sourcePaths: ['policy_repo'],
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    await writeFile(
      join(target, '.wpmoo/policy.yaml'),
      [
        'addonGroups:',
        '  community:',
        '    - community_core',
        '  pro:',
        '    - pro_account',
        'rules:',
        '  - from: community',
        '    mustNotDependOn: pro',
        '',
      ].join('\n'),
    );

    const modulePath = join(target, 'odoo/custom/src/private/policy_repo/community_core');
    await mkdir(join(modulePath, 'views'), { recursive: true });
    await mkdir(join(modulePath, 'security'), { recursive: true });
    await mkdir(join(modulePath, 'tests'), { recursive: true });
    await writeFile(
      join(modulePath, '__manifest__.py'),
      [
        '{',
        "  'name': 'Community Core',",
        "  'installable': True,",
        "  'version': '1.0.0',",
        "  'license': 'LGPL-3',",
        "  'depends': ['base', 'pro_account'],",
        "  'data': ['security/ir.model.access.csv', 'views/demo_views.xml'],",
        '}',
        '',
      ].join('\n'),
    );
    await writeFile(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
    await writeFile(
      join(modulePath, 'views', 'demo_views.xml'),
      '<odoo><record id="action_demo" model="ir.actions.act_window"/><menuitem id="menu_demo" action="action_demo"/></odoo>\n',
    );

    const report = await getDoctorReport(target, passingDockerRunner());

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'Module quality error: odoo/custom/src/private/policy_repo/community_core: dependency policy violation: community_core (community) must not depend on pro_account (pro)',
      ]),
    );
    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Module quality error: odoo/custom/src/private/policy_repo/community_core: dependency policy violation: community_core (community) must not depend on pro_account (pro)',
    );
  });

  it('surfaces configured Odoo policy lint findings as doctor advisories', async () => {
    const target = await makeEnvironment({
      metadata: {
        ...baseMetadata,
        sourceRepos: [{ url: 'https://github.com/example-org/policy_repo.git', path: 'policy_repo', addons: [] }],
      },
      sourcePaths: ['policy_repo'],
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    await writeFile(join(target, '.wpmoo/policy.yaml'), ['odoo:', '  version: "19.0"', ''].join('\n'));

    const modulePath = join(target, 'odoo/custom/src/private/policy_repo/demo_module');
    await mkdir(join(modulePath, 'models'), { recursive: true });
    await mkdir(join(modulePath, 'views'), { recursive: true });
    await mkdir(join(modulePath, 'security'), { recursive: true });
    await mkdir(join(modulePath, 'tests'), { recursive: true });
    await writeFile(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeFile(join(modulePath, 'models', '__init__.py'), 'from . import demo_model\n');
    await writeFile(
      join(modulePath, 'models', 'demo_model.py'),
      [
        'from odoo import models',
        '',
        'class Demo(models.Model):',
        "    _name = 'demo.model'",
        '    _sql_constraints = []',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(modulePath, '__manifest__.py'),
      [
        '{',
        "  'name': 'Demo',",
        "  'installable': True,",
        "  'version': '1.0.0',",
        "  'license': 'LGPL-3',",
        "  'depends': ['base'],",
        "  'data': ['security/ir.model.access.csv', 'views/demo_views.xml'],",
        '}',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(modulePath, 'security', 'ir.model.access.csv'),
      'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink\naccess_demo,demo,model_demo_model,,1,1,1,1\n',
    );
    await writeFile(
      join(modulePath, 'views', 'demo_views.xml'),
      '<odoo><record id="action_demo" model="ir.actions.act_window"><field name="res_model">demo.model</field></record><menuitem id="menu_demo" action="action_demo"/></odoo>\n',
    );

    const report = await getDoctorReport(target, passingDockerRunner());

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        'Module quality advisory: odoo/custom/src/private/policy_repo/demo_module/models/demo_model.py: Odoo policy warning: _sql_constraints found; prefer models.Constraint for configured Odoo 19 policy',
      ]),
    );
    expect(await runDoctor(target, passingDockerRunner())).toContain(
      'WARN Module quality advisory: odoo/custom/src/private/policy_repo/demo_module/models/demo_model.py: Odoo policy warning: _sql_constraints found; prefer models.Constraint for configured Odoo 19 policy',
    );
  });

  it('can fail doctor when warnings are present in strict mode', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module/demo_module');
    await mkdir(modulePath, { recursive: true });
    await writeFile(
      join(modulePath, '__manifest__.py'),
      [
        '{',
        "  'name': 'Demo',",
        "  'installable': True,",
        "  'depends': ['base'],",
        "  'data': [],",
        '}',
        '',
      ].join('\n'),
    );

    const report = await getDoctorReport(target, passingDockerRunner(), { failOnWarning: true });

    expect(report.ok).toBe(false);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        'Module quality advisory: odoo/custom/src/private/odoo_sample_module/demo_module: missing license in __manifest__.py',
      ]),
    );
    expect(report.errors).toEqual(['Warnings present and --fail-on-warning is enabled.']);
    await expect(runDoctor(target, passingDockerRunner(), { failOnWarning: true })).rejects.toThrow(
      'Warnings present and --fail-on-warning is enabled.',
    );
  });

  it('rejects non-object metadata and invalid source repo entries', async () => {
    const nonObjectMetadata = await makeEnvironment({ metadata: [] });
    await expect(runDoctor(nonObjectMetadata, passingDockerRunner())).rejects.toThrow(
      'Invalid metadata JSON in .wpmoo/odoo.json: metadata is not an object',
    );

    const invalidSourceRepoMetadata = {
      ...baseMetadata,
      sourceRepos: [{ url: 'https://github.com/example-org/repo.git', path: '   ', addons: [] }],
    };
    const invalidSourceRepoTarget = await makeEnvironment({
      metadata: invalidSourceRepoMetadata,
      sourcePaths: [],
    });
    await expect(runDoctor(invalidSourceRepoTarget, passingDockerRunner())).rejects.toThrow(
      'Invalid sourceRepos entry in .wpmoo/odoo.json at index 0',
    );
  });

  it('checks metadata and .env selected compose files', async () => {
    const target = await makeEnvironment({
      composeVersions: ['19.0'],
      env: 'ODOO_VERSION=18.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Missing compose file: docker-compose_18.0.yml',
    );
  });

  it('rejects invalid .env ODOO_VERSION before checking legacy compose paths', async () => {
    const target = await makeEnvironment({
      composeVersions: ['19.0'],
      env: 'ODOO_VERSION=../18.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Invalid Odoo version for compose file: ../18.0',
    );
  });

  it('passes compact compose layout using the default dev overlay', async () => {
    const target = await makeEnvironment({
      composeVersions: [],
      compactEnv: 'dev',
      env: 'ODOO_VERSION=18.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, passingDockerRunner())).resolves.toContain(
      'OK compose files compose.yaml, compose/dev.yaml',
    );
  });

  it('honors WPMOO_ENV when selecting compact compose overlays', async () => {
    const target = await makeEnvironment({
      composeVersions: [],
      compactEnv: 'stage',
      env: 'WPMOO_ENV=stage\nODOO_VERSION=19.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, passingDockerRunner())).resolves.toContain(
      'OK compose files compose.yaml, compose/stage.yaml',
    );
  });

  it('flags incompatible PostgreSQL 18 DB mount targets in legacy compose files', async () => {
    const target = await makeEnvironment({
      composeVersions: ['19.0'],
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
      composeFiles: {
        'docker-compose_19.0.yml':
          'services:\n  db:\n    image: postgres:18\n    volumes:\n      - pg-data:/var/lib/postgresql/data\n',
      },
    });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      "PostgreSQL 18 compatibility issue in 'docker-compose_19.0.yml': mount target '/var/lib/postgresql/data' is invalid",
    );
    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      "recommend using '/var/lib/postgresql'",
    );
  });

  it('passes when PostgreSQL 18 mounts use /var/lib/postgresql in compose files', async () => {
    const target = await makeEnvironment({
      composeVersions: ['19.0'],
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
      composeFiles: {
        'docker-compose_19.0.yml':
          'services:\n  db:\n    image: postgres:18\n    volumes:\n      - pg-data:/var/lib/postgresql\n',
      },
    });

    await expect(runDoctor(target, passingDockerRunner())).resolves.toContain(
      'OK compose files docker-compose_19.0.yml',
    );
  });

  it('inspects compact compose overlays for PostgreSQL 18 mount compatibility', async () => {
    const target = await makeEnvironment({
      composeVersions: [],
      compactEnv: 'dev',
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\nPOSTGRES_IMAGE=postgres:18\n',
      composeFiles: {
        'compose.yaml':
          'services:\n  odoo:\n    image: odoo:19\n    volumes: []\n',
        'compose/dev.yaml':
          'services:\n  db:\n    image: postgres:18\n    tmpfs:\n      - /var/lib/postgresql/18/docker\n',
      },
    });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      "PostgreSQL 18 compatibility issue in 'compose/dev.yaml': mount target '/var/lib/postgresql/18/docker' is invalid",
    );
  });

  it('fixes incompatible PostgreSQL 18 mount targets without adding blank lines', async () => {
    const composeContent = 'services:\n  db:\n    image: postgres:18\n    volumes:\n      - pg-data:/var/lib/postgresql/data\n';
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
      composeFiles: {
        'docker-compose_19.0.yml': composeContent,
      },
    });

    const output = await runDoctor(target, passingDockerRunner(), { fix: true });

    expect(output).toContain('Applied safe doctor fixes:');
    expect(output).toContain(
      "Normalized PostgreSQL 18 mount target in 'docker-compose_19.0.yml': replaced '/var/lib/postgresql/data' -> '/var/lib/postgresql'",
    );
    await expect(readFile(join(target, 'docker-compose_19.0.yml'), 'utf8')).resolves.toBe(
      'services:\n  db:\n    image: postgres:18\n    volumes:\n      - pg-data:/var/lib/postgresql\n',
    );
  });

  it('fixes a missing source manifest from metadata', async () => {
    const target = await makeEnvironment();

    const output = await runDoctor(target, passingDockerRunner(), { fix: true });

    expect(output).toContain('Applied safe doctor fixes:');
    expect(output).toContain('Synced source manifest and metadata with current metadata/.gitmodules state.');
    await expect(readFile(join(target, sourceManifestPath), 'utf8')).resolves.toContain(
      '    url: "https://github.com/example-org/odoo_sample_module.git"',
    );
  });

  it('fixes an unreadable source manifest from metadata instead of failing the sync', async () => {
    const target = await makeEnvironment();
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(
      join(target, sourceManifestPath),
      'sources:\n  - type: "private"\n    path: "odoo_sample_module"\n    url:\n',
      'utf8',
    );

    const output = await runDoctor(target, passingDockerRunner(), { fix: true });

    expect(output).toContain('Applied safe doctor fixes:');
    expect(output).toContain('Will regenerate source manifest and metadata after repairing source manifest read failure.');
    await expect(readFile(join(target, sourceManifestPath), 'utf8')).resolves.toContain(
      '    url: "https://github.com/example-org/odoo_sample_module.git"',
    );
  });

  it('fails compact compose layout when the selected WPMOO_ENV overlay is missing', async () => {
    const target = await makeEnvironment({
      composeVersions: [],
      compactEnv: 'dev',
      env: 'WPMOO_ENV=stage\nODOO_VERSION=19.0\nHTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Missing compact compose overlay for WPMOO_ENV=stage: compose/stage.yaml',
    );
  });

  it('requires every fixed daily action script including maintenance scripts', async () => {
    const scripts = Object.values(dailyActionScripts).filter((script) => script !== 'pot.sh');
    const target = await makeEnvironment({ scripts });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Missing daily action script: scripts/pot.sh',
    );
  });

  it('requires listed source repo paths to exist', async () => {
    const target = await makeEnvironment({ sourcePaths: [] });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Missing source repo path: odoo/custom/src/private/odoo_sample_module',
    );
  });

  it('validates .env HTTP and gevent ports when .env exists', async () => {
    const invalidNumber = await makeEnvironment({
      env: 'HTTP_PORT=abc\nGEVENT_PORT=20019\n',
    });
    await expect(runDoctor(invalidNumber, passingDockerRunner())).rejects.toThrow(
      'Invalid HTTP_PORT in .env: expected a non-empty numeric value',
    );

    const equalPorts = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=10019\n',
    });
    await expect(runDoctor(equalPorts, passingDockerRunner())).rejects.toThrow(
      'HTTP_PORT and GEVENT_PORT in .env must not be equal',
    );
  });

  it('parses quoted .env values and ignores comments plus malformed lines', async () => {
    const target = await makeEnvironment({
      composeVersions: ['19.0', '18.0'],
      env: [
        '# comment',
        'MALFORMED_LINE',
        "ODOO_VERSION='18.0'",
        'HTTP_PORT="10019"',
        'GEVENT_PORT=20018',
      ].join('\n'),
    });

    await expect(runDoctor(target, passingDockerRunner())).resolves.toContain(
      'OK .env ports HTTP_PORT=10019 GEVENT_PORT=20018',
    );
  });

  it('reports multiple missing files in one failure output', async () => {
    const scripts = Object.values(dailyActionScripts).filter((script) => script !== 'pot.sh');
    const target = await makeEnvironment({
      composeVersions: [],
      scripts,
    });

    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Missing compose file: docker-compose_19.0.yml',
    );
    await expect(runDoctor(target, passingDockerRunner())).rejects.toThrow(
      'Missing daily action script: scripts/pot.sh',
    );
  });

  it('fails when Docker cannot be called', async () => {
    const target = await makeEnvironment();
    const runner: DoctorCommandRunner = async () => {
      throw new Error('docker unavailable');
    };

    await expect(runDoctor(target, runner)).rejects.toThrow('Docker CLI check failed: docker unavailable');
  });

  it('fails when Docker Compose cannot be called', async () => {
    const target = await makeEnvironment();
    const runner = doctorRunner({
      responses: {
        'docker compose version': new Error('compose unavailable'),
      },
    });

    await expect(runDoctor(target, runner)).rejects.toThrow('Docker Compose check failed: compose unavailable');
  });

  it('fails when git reports uninitialized or conflicted source submodules', async () => {
    const sha = 'a'.repeat(40);
    const metadata = {
      ...baseMetadata,
      sourceRepos: [
        ...baseMetadata.sourceRepos,
        {
          url: 'https://github.com/example-org/odoo_sample_module_extra.git',
          path: 'odoo_sample_module_extra',
          addons: ['odoo_sample_module_extra'],
        },
      ],
    };
    const target = await makeEnvironment({
      metadata,
      sourcePaths: ['odoo_sample_module', 'odoo_sample_module_extra'],
    });
    const runner = doctorRunner({
      responses: {
        'git submodule status --recursive': {
          stdout: [
            `-${sha} odoo/custom/src/private/odoo_sample_module`,
            `U${sha} odoo/custom/src/private/odoo_sample_module_extra`,
          ].join('\n'),
        },
      },
    });

    await expect(runDoctor(target, runner)).rejects.toThrow(
      'Uninitialized Git submodule: odoo/custom/src/private/odoo_sample_module',
    );
    await expect(runDoctor(target, runner)).rejects.toThrow(
      'Conflicted Git submodule: odoo/custom/src/private/odoo_sample_module_extra',
    );
  });

  it('fails when git submodule status errors for reasons other than non-checkout', async () => {
    const target = await makeEnvironment();
    const runner = doctorRunner({
      responses: {
        'git submodule status --recursive': new Error('submodule check failed'),
      },
    });

    await expect(runDoctor(target, runner)).rejects.toThrow(
      'Git submodule status check failed: submodule check failed',
    );
  });

  it('skips git submodule checks when git reports not-a-repository in stderr text', async () => {
    const target = await makeEnvironment();
    const notRepoError = Object.assign(new Error('git exited with status 128'), {
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    });
    const runner = doctorRunner({
      responses: {
        'git submodule status --recursive': notRepoError,
      },
    });

    await expect(runDoctor(target, runner)).resolves.toContain('OK git submodules skipped (not a git checkout)');
  });

  it('warns without failing when GitHub CLI auth is unavailable', async () => {
    const target = await makeEnvironment();
    const runner = doctorRunner({
      responses: {
        'gh auth status': new Error('not logged in'),
      },
    });

    await expect(runDoctor(target, runner)).resolves.toContain('WARN GitHub CLI auth: not logged in');
  });

  it('returns a structured report for a passing environment', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });

    const report = await getDoctorReport(target, passingDockerRunner());

    expect(report).toMatchObject({
      schemaVersion: 1,
      command: 'doctor',
      ok: true,
      target,
      checks: expect.arrayContaining(['OK metadata .wpmoo/odoo.json']),
      warnings: [],
      errors: [],
      appliedFixes: [],
    });
    expect(report.checks).toContain('OK source repos 1 checked');
    expect(report.sections).toEqual([
      {
        id: 'generated-files',
        title: 'Generated files',
        checks: [
          'OK metadata .wpmoo/odoo.json',
          'OK engine compose',
          'OK Odoo version 19.0',
          'OK scripts 14 checked',
        ],
        warnings: [],
        errors: [],
      },
      {
        id: 'compose',
        title: 'Compose',
        checks: [
          'OK compose files docker-compose_19.0.yml',
          'OK .env ports HTTP_PORT=10019 GEVENT_PORT=20019',
        ],
        warnings: [],
        errors: [],
      },
      {
        id: 'source-repositories',
        title: 'Source repositories',
        checks: [
          'OK source repos 1 checked',
          'OK git submodules skipped (not a git checkout)',
          'OK GitHub CLI auth',
        ],
        warnings: [],
        errors: [],
      },
      {
        id: 'module-quality',
        title: 'Module quality',
        checks: ['OK module quality 0 modules scanned'],
        warnings: [],
        errors: [],
      },
      {
        id: 'host-tools',
        title: 'Host tools',
        checks: ['OK docker CLI', 'OK docker compose'],
        warnings: [],
        errors: [],
      },
    ]);
  });

  it('returns ok=true with populated warnings when GitHub CLI auth is unavailable', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const runner = doctorRunner({
      responses: {
        'gh auth status': new Error('not logged in'),
      },
    });

    const report = await getDoctorReport(target, runner);

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([expect.stringContaining('GitHub CLI auth: not logged in')]);
    expect(report.errors).toEqual([]);
  });

  it('captures failures in structured errors instead of throwing', async () => {
    const target = await makeEnvironment({
      composeVersions: ['19.0'],
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
      composeFiles: {
        'docker-compose_19.0.yml':
          'services:\n  db:\n    image: postgres:18\n    volumes:\n      - pg-data:/var/lib/postgresql/data\n',
      },
    });

    const report = await getDoctorReport(target, passingDockerRunner());

    expect(report.ok).toBe(false);
    expect(report.errors).toContain(
      "PostgreSQL 18 compatibility issue in 'docker-compose_19.0.yml': mount target '/var/lib/postgresql/data' is invalid; recommend using '/var/lib/postgresql'",
    );
  });

  it('adds opt-in PostgreSQL diagnostics from fixed read-only queries', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
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
            'work_mem|4MB',
            'maintenance_work_mem|64MB',
            'effective_cache_size|4GB',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
    expect(report.checks).toContain(
      'OK PostgreSQL diagnostics database_count=2 active_connections=3 connection_count=42 max_connections=100 connection_utilization_pct=42 total_database_size_bytes=10485760 largest_database_name=devel largest_database_size_bytes=7340032 slow_query_logging=500ms pg_stat_statements=installed pg_stat_statements_available_version=1.10 pg_stat_statements_installed_version=1.10 shared_preload_libraries=pg_stat_statements shared_buffers=128MB work_mem=4MB maintenance_work_mem=64MB effective_cache_size=4GB',
    );
    expect(report.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'postgresql',
        checks: [
          'OK PostgreSQL diagnostics database_count=2 active_connections=3 connection_count=42 max_connections=100 connection_utilization_pct=42 total_database_size_bytes=10485760 largest_database_name=devel largest_database_size_bytes=7340032 slow_query_logging=500ms pg_stat_statements=installed pg_stat_statements_available_version=1.10 pg_stat_statements_installed_version=1.10 shared_preload_libraries=pg_stat_statements shared_buffers=128MB work_mem=4MB maintenance_work_mem=64MB effective_cache_size=4GB',
        ],
        warnings: [],
        errors: [],
      }),
    ]));
    expect(report.postgres).toEqual({
      requested: true,
      contractVersion: 2,
      available: true,
      diagnostics: {
        schemaVersion: 2,
        databaseCount: 2,
        activeConnections: 3,
        connectionCount: 42,
        maxConnections: 100,
        connectionUtilizationPct: 42,
        totalDatabaseSizeBytes: 10485760,
        largestDatabaseName: 'devel',
        largestDatabaseSizeBytes: 7340032,
        slowQueryLogging: '500ms',
        pgStatStatements: 'installed',
        pgStatStatementsAvailableVersion: '1.10',
        pgStatStatementsInstalledVersion: '1.10',
        sharedPreloadLibraries: 'pg_stat_statements',
        sharedBuffers: '128MB',
        workMem: '4MB',
        maintenanceWorkMem: '64MB',
        effectiveCacheSize: '4GB',
      },
    });
    const postgresCall = calls.find(([command]) => command === 'bash');
    expect(postgresCall?.[2]).toContain('pg_stat_activity');
    expect(postgresCall?.[2]).toMatch(/\bstate\s*=\s*'active'/u);
    expect(postgresCall?.[2]).toContain('max_connections');
    expect(postgresCall?.[2]).toContain('pg_database_size');
    expect(postgresCall?.[2]).toContain('largest_database_name');
    expect(postgresCall?.[2]).toContain('pg_available_extensions');
    expect(postgresCall?.[2]).not.toMatch(/\b(ALTER|CREATE|DELETE|DROP|INSERT|UPDATE)\b/u);
  });

  it('warns when PostgreSQL slow-query logging is off', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner();
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|42',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'slow_query_logging|off',
            'pg_stat_statements|installed',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([
      'PostgreSQL slow-query logging is disabled (log_min_duration_statement=off). Enable it before performance triage.',
    ]);
    expect(report.postgres?.available).toBe(true);
  });

  it('warns when pg_stat_statements is available but not installed', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner();
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|42',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'slow_query_logging|500ms',
            'pg_stat_statements|available',
            'pg_stat_statements_available_version|1.10',
            'shared_preload_libraries|',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([
      'PostgreSQL pg_stat_statements is available but not installed. Install it before query-level performance triage.',
    ]);
    expect(report.postgres?.diagnostics.pgStatStatementsAvailableVersion).toBe('1.10');
  });

  it('warns when PostgreSQL slow-query logging is disabled', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|42',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'slow_query_logging|-1ms',
            'pg_stat_statements|available',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([
      'PostgreSQL slow-query logging is disabled (log_min_duration_statement=-1ms). Enable it before performance triage.',
    ]);
    expect(report.checks).toContain(
      'OK PostgreSQL diagnostics database_count=2 active_connections=3 connection_count=42 max_connections=100 connection_utilization_pct=42 total_database_size_bytes=10485760 slow_query_logging=-1ms pg_stat_statements=available shared_buffers=128MB',
    );
    expect(report.postgres?.available).toBe(true);
    expect(report.postgres?.diagnostics.slowQueryLogging).toBe('-1ms');
    expect(report.errors).toEqual([]);
  });

  it('warns when PostgreSQL connection utilization is high', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
        return {
          stdout: [
            'database_count|2',
            'active_connections|4',
            'connection_count|90',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'slow_query_logging|500ms',
            'pg_stat_statements|available',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(['PostgreSQL connection utilization is high: 90% of max_connections used (90/100).']);
    expect(report.postgres?.available).toBe(true);
    expect(report.postgres?.diagnostics.connectionUtilizationPct).toBe(90);
    expect(report.errors).toEqual([]);
  });

  it('keeps warning order stable when PostgreSQL connection utilization is high and slow-query logging is disabled', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
        return {
          stdout: [
            'database_count|2',
            'active_connections|4',
            'connection_count|90',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'slow_query_logging|-1',
            'pg_stat_statements|available',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([
      'PostgreSQL connection utilization is high: 90% of max_connections used (90/100).',
      'PostgreSQL slow-query logging is disabled (log_min_duration_statement=-1). Enable it before performance triage.',
    ]);
    expect(report.postgres?.available).toBe(true);
    expect(report.postgres?.diagnostics.connectionUtilizationPct).toBe(90);
    expect(report.postgres?.diagnostics.slowQueryLogging).toBe('-1');
    expect(report.errors).toEqual([]);
  });

  it('warns without failing when opt-in PostgreSQL diagnostics are unavailable', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
        throw new Error('database unavailable');
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(['PostgreSQL diagnostics unavailable: database unavailable']);
    expect(report.postgres).toEqual({
      requested: true,
      contractVersion: 2,
      available: false,
      diagnostics: {},
      warning: 'database unavailable',
    });
    expect(report.errors).toEqual([]);
  });

  it('keeps core PostgreSQL diagnostics available when optional privileged probes fail', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
            'connection_count|42',
            'max_connections|100',
            'total_database_size_bytes|10485760',
            'slow_query_logging|500ms',
            'pg_stat_statements|installed',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_ls_waldir')) {
        calls.push([command, ...args]);
        throw new Error('permission denied for function pg_ls_waldir');
      }
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_tablespace_size')) {
        calls.push([command, ...args]);
        throw new Error('permission denied for function pg_tablespace_size');
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });
    const postgresCommands = calls.filter(([command]) => command === 'bash').map((call) => call.slice(1).join(' '));

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
    expect(report.postgres?.available).toBe(true);
    expect(report.postgres?.diagnostics.totalDatabaseSizeBytes).toBe(10485760);
    expect(report.postgres?.diagnostics.walFileCount).toBeUndefined();
    expect(report.postgres?.diagnostics.defaultTablespaceSizeBytes).toBeUndefined();
    expect(report.postgres?.optionalProbeFailures).toEqual([
      { id: 'wal-directory', warning: 'permission denied for function pg_ls_waldir' },
      { id: 'default-tablespace', warning: 'permission denied for function pg_tablespace_size' },
    ]);
    expect(postgresCommands[0]).not.toContain('pg_ls_waldir');
    expect(postgresCommands[0]).not.toContain('pg_tablespace_size');
    expect(postgresCommands.some((command) => command.includes('pg_ls_waldir'))).toBe(true);
    expect(postgresCommands.some((command) => command.includes('pg_tablespace_size'))).toBe(true);
  });

  it('times out PostgreSQL diagnostics without failing doctor', async () => {
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner();
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        return new Promise<{ stdout: string; stderr: string }>(() => undefined);
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true, postgresTimeoutMs: 1 });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(['PostgreSQL diagnostics unavailable: PostgreSQL diagnostics timed out after 1ms']);
    expect(report.postgres).toEqual({
      requested: true,
      contractVersion: 2,
      available: false,
      diagnostics: {},
      warning: 'PostgreSQL diagnostics timed out after 1ms',
    });
    expect(report.errors).toEqual([]);
  });

  it('marks partial PostgreSQL diagnostics as unavailable without failing doctor', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
        return {
          stdout: [
            'database_count|2',
            'active_connections|3',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.checks).not.toContain(expect.stringContaining('OK PostgreSQL diagnostics'));
    expect(report.warnings).toEqual([
      'PostgreSQL diagnostics unavailable: incomplete diagnostic rows: missing connection_count, max_connections, total_database_size_bytes, slow_query_logging, pg_stat_statements, shared_buffers',
    ]);
    expect(report.postgres).toEqual({
      requested: true,
      contractVersion: 2,
      available: false,
      diagnostics: {
        schemaVersion: 2,
        databaseCount: 2,
        activeConnections: 3,
      },
      warning:
        'incomplete diagnostic rows: missing connection_count, max_connections, total_database_size_bytes, slow_query_logging, pg_stat_statements, shared_buffers',
    });
    expect(report.errors).toEqual([]);
  });

  it('marks malformed PostgreSQL numeric diagnostics as unavailable without failing doctor', async () => {
    const calls: string[][] = [];
    const target = await makeEnvironment({
      env: 'HTTP_PORT=10019\nGEVENT_PORT=20019\n',
    });
    const baseRunner = passingDockerRunner(calls);
    const runner: DoctorCommandRunner = async (command, args, options) => {
      if (command === 'bash' && args[0] === '-lc' && args[1]?.includes('pg_database_size')) {
        calls.push([command, ...args]);
        return {
          stdout: [
            'database_count|two',
            'active_connections|3',
            'connection_count|42',
            'max_connections|many',
            'total_database_size_bytes|10485760',
            'slow_query_logging|500ms',
            'pg_stat_statements|available',
            'shared_buffers|128MB',
          ].join('\n'),
          stderr: '',
        };
      }

      return baseRunner(command, args, options);
    };

    const report = await getDoctorReport(target, runner, { postgres: true });

    expect(report.ok).toBe(true);
    expect(report.checks).not.toContain(expect.stringContaining('OK PostgreSQL diagnostics'));
    expect(report.warnings).toEqual([
      'PostgreSQL diagnostics unavailable: malformed diagnostic values: database_count, max_connections',
    ]);
    expect(report.postgres).toEqual({
      requested: true,
      contractVersion: 2,
      available: false,
      diagnostics: {
        schemaVersion: 2,
        activeConnections: 3,
        connectionCount: 42,
        totalDatabaseSizeBytes: 10485760,
        slowQueryLogging: '500ms',
        pgStatStatements: 'available',
        sharedBuffers: '128MB',
      },
      warning: 'malformed diagnostic values: database_count, max_connections',
    });
    expect(report.errors).toEqual([]);
  });
});
