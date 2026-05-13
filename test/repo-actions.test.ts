import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { syncComposeOdooConfAddonsPath } from '../src/repo-actions.js';

describe('repo actions', () => {
  it('syncs compose addons_path from current private submodules', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-compose-addons-path-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'etc'), { recursive: true });

    await writeFile(
      join(target, '.wpmoo/odoo-dev.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/odoo-dev',
          version: '0.8.25',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          engine: 'compose',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [],
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/private/odoo_sample_module"]',
        '\tpath = odoo/custom/src/private/odoo_sample_module',
        '\turl = https://github.com/example-org/odoo_sample_module.git',
        '[submodule "odoo/custom/src/private/odoo_sample_module_pro"]',
        '\tpath = odoo/custom/src/private/odoo_sample_module_pro',
        '\turl = https://github.com/example-org/odoo_sample_module_pro.git',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(target, 'etc/odoo.conf'),
      '[options]\naddons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons/private/old\n',
    );

    await syncComposeOdooConfAddonsPath(target);

    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toContain(
      'addons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons,/mnt/wpmoo-addons',
    );
  });

  it('leaves non-compose environments untouched', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-doodba-addons-path-'));
    await mkdir(join(target, 'etc'), { recursive: true });
    await writeFile(join(target, 'etc/odoo.conf'), 'addons_path = old\n');

    await syncComposeOdooConfAddonsPath(target);

    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toBe('addons_path = old\n');
  });
});
