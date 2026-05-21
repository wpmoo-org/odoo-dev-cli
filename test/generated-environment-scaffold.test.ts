import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dailyActionScripts } from '../src/daily-actions.js';
import { scaffold } from '../src/scaffold.js';

async function writeLegacyComposeFixture(root: string): Promise<string> {
  const fixture = join(root, 'compose-fixture');
  await mkdir(join(fixture, 'scripts'), { recursive: true });
  await mkdir(join(fixture, 'etc'), { recursive: true });
  await writeFile(join(fixture, 'docker-compose_19.0.yml'), 'services:\n  odoo:\n    image: odoo:19\n', 'utf8');
  await writeFile(join(fixture, 'docker-compose_18.0.yml'), 'services:\n  odoo:\n    image: odoo:18\n', 'utf8');
  await writeFile(
    join(fixture, 'etc/odoo.conf'),
    '[options]\naddons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/wpmoo-addons\n',
    'utf8',
  );
  await writeFile(join(fixture, 'README.md'), '# Compose Fixture\nLocal compose fixture content.\n', 'utf8');

  for (const script of Object.values(dailyActionScripts)) {
    await writeFile(join(fixture, 'scripts', script), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await chmod(join(fixture, 'scripts', script), 0o755);
  }

  return fixture;
}

async function writeCompactComposeFixture(root: string): Promise<string> {
  const fixture = join(root, 'compose-fixture');
  const compact = join(fixture, 'resources/generated-env');

  await mkdir(join(compact, 'compose'), { recursive: true });
  await mkdir(join(compact, 'scripts'), { recursive: true });
  await mkdir(join(compact, 'config/odoo'), { recursive: true });
  await mkdir(join(compact, 'resources/odoo'), { recursive: true });
  await mkdir(join(fixture, '.github/workflows'), { recursive: true });
  await mkdir(join(fixture, 'docs/assets'), { recursive: true });
  await mkdir(join(fixture, 'test'), { recursive: true });
  await writeFile(join(compact, 'compose.yaml'), 'services:\n  odoo:\n    image: odoo:19\n', 'utf8');
  await writeFile(join(compact, 'compose/dev.yaml'), 'services:\n  odoo-dev:\n    image: odoo:19\n', 'utf8');
  await writeFile(join(compact, 'scripts/up.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  await writeFile(
    join(compact, 'config/odoo/odoo.conf'),
    '[options]\naddons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/wpmoo-addons\n',
    'utf8',
  );
  await writeFile(join(compact, 'resources/odoo/entrypoint.sh'), '#!/usr/bin/env bash\nexec odoo\n', 'utf8');
  await writeFile(join(compact, 'README.md'), '# Compact Compose Fixture\nLocal compact compose fixture content.\n', 'utf8');
  await writeFile(join(fixture, 'README.md'), '# Legacy Compose Fixture\nUse docker-compose_19.0.yml.\n', 'utf8');
  await writeFile(join(fixture, '.github/workflows/ci.yml'), 'name: ci\n', 'utf8');
  await writeFile(join(fixture, 'docs/assets/diagram.png'), 'asset\n', 'utf8');
  await writeFile(join(fixture, 'test/compose.test.ts'), 'test\n', 'utf8');
  await writeFile(join(fixture, 'package.json'), '{}\n', 'utf8');
  await writeFile(join(fixture, 'docker-compose_19.0.yml'), 'legacy compose\n', 'utf8');

  return fixture;
}

describe('generated environment scaffold output matrix', () => {
  it('writes expected scaffold assets and metadata from a local compose fixture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-generated-scaffold-'));
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeLegacyComposeFixture(root);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      engine: 'compose',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      sourceRepos: [
        {
          url: 'https://github.com/example-org/odoo_sample_module.git',
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module', 'odoo_sample_module_portal'],
        },
        {
          url: 'https://github.com/example-org/odoo_sample_module_reports.git',
          path: 'odoo_sample_module_reports',
          addons: ['odoo_sample_module_reports'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: false,
      skipSubmodules: true,
      stage: false,
    });

    const expectedFiles = [
      '.wpmoo/odoo.json',
      'moo',
      'README.md',
      'AGENTS.md',
      'docs/appstore-release.md',
      '.env.example',
      'docker-compose_19.0.yml',
      'docs/compose.md',
      'etc/odoo.conf',
    ];
    for (const relativePath of expectedFiles) {
      await expect(stat(join(target, relativePath))).resolves.toBeTruthy();
    }

    for (const script of Object.values(dailyActionScripts)) {
      const scriptStat = await stat(join(target, 'scripts', script));
      expect(scriptStat.mode & 0o111).toBeTruthy();
    }

    const statusScriptStat = await stat(join(target, 'scripts', 'status.sh'));
    expect(statusScriptStat.mode & 0o111).toBeTruthy();
    const doctorScriptStat = await stat(join(target, 'scripts', 'doctor.sh'));
    expect(doctorScriptStat.mode & 0o111).toBeTruthy();

    expect((await stat(join(target, 'moo'))).mode & 0o100).toBeTruthy();

    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('ODOO_VERSION=19.0');
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('POSTGRES_IMAGE=postgres:18');
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain(
      'ODOO_TEST_MODULE=odoo_sample_module',
    );
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.toContain('Compose Fixture');
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.toContain(
      'Local compose fixture content.',
    );

    const metadata = JSON.parse(await readFile(join(target, '.wpmoo/odoo.json'), 'utf8')) as {
      engine: string;
      odooVersion: string;
      composeTemplateUrl: string;
      sourceRepos: Array<{ url: string; addons: string[] }>;
    };
    expect(metadata.engine).toBe('compose');
    expect(metadata.odooVersion).toBe('19.0');
    expect(metadata.composeTemplateUrl).toBe(composeTemplateUrl);
    expect(metadata.sourceRepos.map((repo) => repo.url)).toEqual([
      'https://github.com/example-org/odoo_sample_module.git',
      'https://github.com/example-org/odoo_sample_module_reports.git',
    ]);
    expect(metadata.sourceRepos.map((repo) => repo.addons)).toEqual([
      ['odoo_sample_module', 'odoo_sample_module_portal'],
      ['odoo_sample_module_reports'],
    ]);
  });

  it('writes compact compose assets and skips bulky source repository files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-generated-compact-scaffold-'));
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeCompactComposeFixture(root);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      engine: 'compose',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      sourceRepos: [
        {
          url: 'https://github.com/example-org/odoo_sample_module.git',
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: false,
      skipSubmodules: true,
      stage: false,
    });

    const expectedFiles = [
      'compose.yaml',
      'compose/dev.yaml',
      'scripts/up.sh',
      'config/odoo/odoo.conf',
      'resources/odoo/entrypoint.sh',
      'docs/compose.md',
      '.env.example',
      '.wpmoo/odoo.json',
      'moo',
      'README.md',
      'AGENTS.md',
    ];
    for (const relativePath of expectedFiles) {
      await expect(stat(join(target, relativePath))).resolves.toBeTruthy();
    }

    const omittedFiles = [
      'docker-compose_19.0.yml',
      '.github/workflows/ci.yml',
      'docs/assets/diagram.png',
      'test/compose.test.ts',
      'package.json',
    ];
    for (const relativePath of omittedFiles) {
      await expect(stat(join(target, relativePath))).rejects.toThrow();
    }

    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.toContain('Local compact compose');
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.not.toContain('docker-compose_19.0.yml');
  });
});
