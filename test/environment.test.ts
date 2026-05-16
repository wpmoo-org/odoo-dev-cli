import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  detectDevelopmentEnvironment,
  environmentOdooVersion,
  markerPath,
  readEnvironmentMetadata,
} from '../src/environment.js';
import { scaffold } from '../src/scaffold.js';

async function writeLocalComposeFixture(root: string): Promise<string> {
  const compose = join(root, 'compose-fixture');
  await mkdir(join(compose, 'etc'), { recursive: true });
  await writeFile(join(compose, 'docker-compose_19.0.yml'), 'services:\n  odoo:\n    image: "${ODOO_IMAGE:-odoo:19}"\n');
  await writeFile(join(compose, 'README.md'), '# WPMoo Odoo Compose\n');
  await writeFile(join(compose, 'etc/odoo.conf'), '[options]\n');

  return compose;
}

async function scaffoldOptions(target: string) {
  return {
    product: 'odoo_sample_module',
    odooVersion: '19.0',
    composeTemplateUrl: await writeLocalComposeFixture(await mkdtemp(join(tmpdir(), 'wpmoo-compose-fixture-'))),
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
    stage: false,
    skipSubmodules: true,
  };
}

describe('development environment detection', () => {
  it('writes and detects the wpmoo environment marker', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-marker-'));

    await scaffold(await scaffoldOptions(target));

    await expect(readFile(join(target, markerPath), 'utf8')).resolves.toContain('"tool": "@wpmoo/toolkit"');
    await expect(readEnvironmentMetadata(target)).resolves.toMatchObject({
      tool: '@wpmoo/toolkit',
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      engine: 'compose',
    });
    await expect(readFile(join(target, markerPath), 'utf8')).resolves.not.toContain('"packs"');
    await expect(detectDevelopmentEnvironment(target)).resolves.toEqual({
      isEnvironment: true,
      source: 'marker',
    });
  });

  it('detects older scaffolded environments without a marker', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-legacy-'));

    await mkdir(join(target, 'odoo/custom/src/private'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/addons.yaml'), 'private/odoo_sample_module:\n  - odoo_sample_module\n');
    await writeFile(join(target, 'odoo/custom/src/repos.yaml'), 'odoo:\n');

    await expect(detectDevelopmentEnvironment(target)).resolves.toEqual({
      isEnvironment: true,
      source: 'layout',
    });
  });

  it('detects legacy environments with oca source directory', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-legacy-oca-'));

    await mkdir(join(target, 'odoo/custom/src/oca'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/addons.yaml'), 'oca/odoo_sample_module:\n  - odoo_sample_module\n');
    await writeFile(join(target, 'odoo/custom/src/repos.yaml'), 'odoo:\n');

    await expect(detectDevelopmentEnvironment(target)).resolves.toEqual({
      isEnvironment: true,
      source: 'layout',
    });
  });

  it('does not treat a plain directory as an environment', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-plain-'));

    await expect(detectDevelopmentEnvironment(target)).resolves.toEqual({
      isEnvironment: false,
      source: 'none',
    });
  });

  it('reads the Odoo version from environment metadata', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-version-'));

    await scaffold({
      ...(await scaffoldOptions(target)),
      odooVersion: '18.0',
    });

    await expect(environmentOdooVersion(target)).resolves.toBe('18.0');
  });

  it('falls back to Odoo 19 when metadata is missing', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-version-fallback-'));

    await expect(environmentOdooVersion(target)).resolves.toBe('19.0');
  });

  it('normalizes legacy metadata source repo entries without source type', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-source-repo-type-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, markerPath),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.8.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
              url: 'https://github.com/example-org/odoo_sample_module.git',
              path: 'odoo_sample_module',
              addons: ['odoo_sample_module'],
              sourceType: 'private',
            },
            {
              url: 'https://github.com/example-org/odoo_oca_module.git',
              path: 'odoo_oca_module',
              addons: ['odoo_oca_module'],
              sourceType: 'oca',
            },
            {
              url: 'https://github.com/example-org/legacy_repo.git',
              path: 'legacy_repo',
              addons: ['legacy_repo'],
              sourceType: 'legacy',
            },
          ],
        },
        null,
        2,
      ),
    );

    const metadata = await readEnvironmentMetadata(target);
    expect(metadata?.sourceRepos).toEqual([
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
        sourceType: 'private',
      },
      {
        url: 'https://github.com/example-org/odoo_oca_module.git',
        path: 'odoo_oca_module',
        addons: ['odoo_oca_module'],
        sourceType: 'oca',
      },
      {
        url: 'https://github.com/example-org/legacy_repo.git',
        path: 'legacy_repo',
        addons: ['legacy_repo'],
        sourceType: 'private',
      },
    ]);
  });
});
