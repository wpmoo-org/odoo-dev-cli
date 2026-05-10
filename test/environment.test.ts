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

function scaffoldOptions(target: string) {
  return {
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

    await scaffold(scaffoldOptions(target));

    await expect(readFile(join(target, markerPath), 'utf8')).resolves.toContain('"tool": "@wpmoo/odoo-dev"');
    await expect(readEnvironmentMetadata(target)).resolves.toMatchObject({
      tool: '@wpmoo/odoo-dev',
      product: 'odoo_sample_module',
      odooVersion: '19.0',
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
      ...scaffoldOptions(target),
      odooVersion: '18.0',
    });

    await expect(environmentOdooVersion(target)).resolves.toBe('18.0');
  });

  it('falls back to Odoo 19 when metadata is missing', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-env-version-fallback-'));

    await expect(environmentOdooVersion(target)).resolves.toBe('19.0');
  });
});
