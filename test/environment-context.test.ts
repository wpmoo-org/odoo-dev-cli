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
        product: 'moo_test',
        odooVersion: '19.0',
        devRepo: 'moo_test_dev',
        devRepoUrl: 'https://github.com/wpmoo-org/moo_test_dev.git',
        sourceRepos: [],
      }),
    );

    await expect(environmentGitHubOwner(target)).resolves.toBe('wpmoo-org');
    await expect(environmentProduct(target)).resolves.toBe('moo_test');
  });
});
