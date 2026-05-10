import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { environmentGitHubOwner, environmentProduct } from '../src/environment-context.js';

describe('environment context', () => {
  it('reads the default GitHub owner from the environment dev repo URL', async () => {
    const target = join(tmpdir(), `wpmoo-env-context-${Date.now()}`);
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo-dev.json'),
      JSON.stringify({
        tool: '@wpmoo/odoo-dev',
        version: '0.8.18',
        product: 'odoo_sample_module',
        odooVersion: '19.0',
        devRepo: 'odoo_sample_module_dev',
        devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
        sourceRepos: [],
      }),
    );

    await expect(environmentGitHubOwner(target)).resolves.toBe('example-org');
    await expect(environmentProduct(target)).resolves.toBe('odoo_sample_module');
  });
});
