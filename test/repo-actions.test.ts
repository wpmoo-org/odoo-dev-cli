import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GitRunner } from '../src/git.js';
import { addModuleRepo, listModuleRepos, removeModuleRepo, syncComposeOdooConfAddonsPath } from '../src/repo-actions.js';

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

  it('exits quietly when compose metadata exists but etc/odoo.conf is missing', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-compose-missing-conf-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify({ tool: '@wpmoo/odoo', version: '0.8.0', engine: 'compose' }, null, 2),
    );

    await expect(syncComposeOdooConfAddonsPath(target)).resolves.toBeUndefined();
  });

  it('appends addons_path line when compose config has no addons_path setting', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-compose-append-addons-path-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'etc'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify({ tool: '@wpmoo/odoo', version: '0.8.0', engine: 'compose' }, null, 2),
    );
    await writeFile(join(target, 'etc/odoo.conf'), '[options]\nproxy_mode = True\n');

    await syncComposeOdooConfAddonsPath(target);

    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toBe(
      '[options]\nproxy_mode = True\naddons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons,/mnt/wpmoo-addons\n',
    );
  });

  it('fails when submodule add succeeds but .gitmodules does not register the repo path', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-add-repo-unregistered-'));
    const git: GitRunner = {
      async run(_cwd, args) {
        if (args[0] === 'ls-remote' && args[1] === '--heads') {
          return { stdout: 'abc123 refs/heads/19.0\n', stderr: '' };
        }
        if (args[0] === 'ls-files') {
          throw new Error('not tracked');
        }
        return { stdout: '', stderr: '' };
      },
    };

    await expect(
      addModuleRepo(
        {
          target,
          repoUrl: 'https://github.com/example-org/odoo_sample_module_reports.git',
          repoPath: 'odoo_sample_module_reports',
          odooVersion: '19.0',
          initEmptyRepos: false,
          stage: false,
        },
        git,
      ),
    ).rejects.toThrow('Source repo was added but is not registered in .gitmodules: odoo_sample_module_reports');
  });

  it('stages repo changes when addModuleRepo runs with stage=true', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-add-repo-stage-'));
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/private/odoo_sample_module_reports"]',
        '\tpath = odoo/custom/src/private/odoo_sample_module_reports',
        '\turl = https://github.com/example-org/odoo_sample_module_reports.git',
        '',
      ].join('\n'),
    );
    const gitCalls: string[][] = [];
    const git: GitRunner = {
      async run(_cwd, args) {
        gitCalls.push(args);
        if (args[0] === 'ls-remote' && args[1] === '--heads' && args.length === 3) {
          return { stdout: 'abc123 refs/heads/main\n', stderr: '' };
        }
        if (args[0] === 'ls-remote' && args[1] === '--heads' && args.length === 4) {
          return { stdout: 'abc123 refs/heads/19.0\n', stderr: '' };
        }
        if (args[0] === 'ls-files') {
          return { stdout: 'odoo/custom/src/private/odoo_sample_module_reports\n', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    };

    await addModuleRepo(
      {
        target,
        repoUrl: 'https://github.com/example-org/odoo_sample_module_reports.git',
        repoPath: 'odoo_sample_module_reports',
        odooVersion: '19.0',
        initEmptyRepos: false,
        stage: true,
      },
      git,
    );

    expect(gitCalls).toContainEqual(['add', '.']);
  });

  it('removes repo from addons.yaml in non-compose environments', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-remove-repo-non-compose-'));
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      [
        'private/odoo_sample_module:',
        '  - odoo_sample_module',
        'private/odoo_sample_module_reports:',
        '  - odoo_sample_module_reports',
        '',
      ].join('\n'),
    );

    const git: GitRunner = {
      async run(_cwd, args) {
        if (args[0] === 'status' && args[1] === '--porcelain') {
          return { stdout: '', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    };

    await removeModuleRepo(
      {
        target,
        repoPath: 'odoo_sample_module_reports',
        stage: false,
      },
      git,
    );

    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/odoo_sample_module:',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.not.toContain(
      'private/odoo_sample_module_reports:',
    );
  });
});
