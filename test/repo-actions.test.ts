import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GitRunner } from '../src/git.js';
import { addModuleRepo, listModuleRepos, syncComposeOdooConfAddonsPath } from '../src/repo-actions.js';

function failingGit(): GitRunner {
  return {
    async run() {
      throw new Error('git should not be called');
    },
  };
}

describe('repo actions', () => {
  it('syncs compose addons_path from current private submodules', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-compose-addons-path-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'etc'), { recursive: true });

    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/odoo',
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

  it('leaves environments without compose metadata untouched', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-addons-path-'));
    await mkdir(join(target, 'etc'), { recursive: true });
    await writeFile(join(target, 'etc/odoo.conf'), 'addons_path = old\n');

    await syncComposeOdooConfAddonsPath(target);

    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toBe('addons_path = old\n');
  });

  it('ignores traversal paths in gitmodules when listing module repos', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-gitmodules-traversal-'));
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/private/../../../../../outside_target"]',
        '\tpath = odoo/custom/src/private/../../../../../outside_target',
        '\turl = https://github.com/example-org/outside_target.git',
        '[submodule "odoo/custom/src/private/odoo_sample_module"]',
        '\tpath = odoo/custom/src/private/odoo_sample_module',
        '\turl = https://github.com/example-org/odoo_sample_module.git',
        '',
      ].join('\n'),
    );

    await expect(listModuleRepos(target)).resolves.toEqual(['odoo_sample_module']);
  });

  it('rejects traversal source paths before running git', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-add-repo-traversal-'));

    await expect(
      addModuleRepo(
        {
          target,
          repoUrl: 'https://github.com/example-org/outside_target.git',
          repoPath: '../outside_target',
          odooVersion: '19.0',
          initEmptyRepos: false,
          stage: false,
        },
        failingGit(),
      ),
    ).rejects.toThrow('Invalid repo path');
  });
});
