import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { commandOdooVersion } from '../src/environment-version.js';

describe('environment command Odoo version', () => {
  it('uses the environment metadata version when no explicit version is provided', async () => {
    const target = join(tmpdir(), `wpmoo-env-version-command-${Date.now()}`);
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo-dev.json'),
      JSON.stringify({
        tool: '@wpmoo/odoo-dev',
        version: '0.8.17',
        product: 'odoo_sample_module',
        odooVersion: '18.0',
        devRepo: 'odoo_sample_module_dev',
        devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
        sourceRepos: [],
      }),
    );

    await expect(commandOdooVersion(target)).resolves.toBe('18.0');
  });

  it('keeps an explicit command version when provided', async () => {
    await expect(commandOdooVersion(tmpdir(), '16.0')).resolves.toBe('16.0');
  });
});
