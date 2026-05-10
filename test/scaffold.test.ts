import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scaffold } from '../src/scaffold.js';

describe('scaffold', () => {
  it('dry-run reports planned files without writing them', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-dry-run-'));

    const result = await scaffold({
      product: 'odoo_sample_module',
      org: 'example-org',
      odooVersion: '19.0',
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      communityRepo: 'odoo_sample_module',
      proRepo: 'odoo_sample_module_reports',
      communityRepoUrl: 'https://github.com/example-org/odoo_sample_module.git',
      proRepoUrl: 'https://github.com/example-org/odoo_sample_module_reports.git',
      communityAddons: ['odoo_sample_module', 'odoo_sample_module_portal'],
      proAddons: ['odoo_sample_module_reports'],
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
      dryRun: true,
      initEmptyRepos: false,
      stage: false,
    });

    expect(result.plannedFiles).toContain('.gitignore');
    expect(result.plannedFiles).toContain('moo');
    await expect(stat(join(target, '.gitignore'))).rejects.toThrow();
  });

  it('writes overlay files when dry-run is disabled', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-scaffold-'));

    await scaffold({
      product: 'odoo_sample_module',
      org: 'example-org',
      odooVersion: '19.0',
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      communityRepo: 'odoo_sample_module',
      proRepo: 'odoo_sample_module_reports',
      communityRepoUrl: 'https://github.com/example-org/odoo_sample_module.git',
      proRepoUrl: 'https://github.com/example-org/odoo_sample_module_reports.git',
      communityAddons: ['odoo_sample_module', 'odoo_sample_module_portal'],
      proAddons: ['odoo_sample_module_reports'],
      sourceRepos: [
        {
          url: 'https://github.com/example-org/odoo_sample_module.git',
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module', 'odoo_sample_module_portal'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: false,
      stage: false,
      skipSubmodules: true,
    });

    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      'Odoo Sample Module Development Environment',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/odoo_sample_module:',
    );
    await expect(readFile(join(target, 'moo'), 'utf8')).resolves.toContain(
      'exec npx --yes @wpmoo/odoo-dev@latest "$@"',
    );
    expect((await stat(join(target, 'moo'))).mode & 0o111).not.toBe(0);
  });
});
