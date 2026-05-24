import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

import { ensureRemoteHasBranch, ensureSubmodule, getOriginUrl, removeSubmodule, type GitRunner } from '../src/git.js';
import { addModuleRepo, listModuleRepos, removeModuleRepo } from '../src/repo-actions.js';
import { scaffold } from '../src/scaffold.js';

async function git(cwd: string, args: string[]) {
  return execa('git', args, { cwd });
}

async function writeLocalComposeFixture(root: string): Promise<string> {
  const compose = join(root, 'compose-fixture');
  await mkdir(join(compose, 'etc'), { recursive: true });
  await writeFile(join(compose, 'docker-compose_19.0.yml'), 'services:\n  odoo:\n    image: "${ODOO_IMAGE:-odoo:19}"\n');
  await writeFile(join(compose, 'README.md'), '# WPMoo Odoo Compose\n');
  await writeFile(
    join(compose, 'etc/odoo.conf'),
    '[options]\naddons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons,/mnt/wpmoo-addons\n',
  );

  return compose;
}

describe('git integration', () => {
  it('throws when adding from an empty remote and initEmptyRepos=false', async () => {
    const git: GitRunner = {
      async run(_cwd, args) {
        if (args[0] === 'ls-remote' && args[1] === '--heads' && args.length === 3) {
          return { stdout: '', stderr: '' };
        }

        throw new Error(`Unexpected git command: ${args.join(' ')}`);
      },
    };

    await expect(
      ensureRemoteHasBranch(git, '/tmp', 'https://github.com/example-org/empty.git', '19.0', false),
    ).rejects.toThrow('Repository has no commits: https://github.com/example-org/empty.git');
  });

  it('throws when remote exists but requested branch is missing', async () => {
    const git: GitRunner = {
      async run(_cwd, args) {
        if (args[0] === 'ls-remote' && args[1] === '--heads' && args.length === 3) {
          return { stdout: 'abcd1234\trefs/heads/main\n', stderr: '' };
        }
        if (args[0] === 'ls-remote' && args[1] === '--heads' && args.length === 4) {
          return { stdout: '', stderr: '' };
        }

        throw new Error(`Unexpected git command: ${args.join(' ')}`);
      },
    };

    await expect(
      ensureRemoteHasBranch(git, '/tmp', 'https://github.com/example-org/source.git', '19.0', false),
    ).rejects.toThrow('Repository https://github.com/example-org/source.git does not have branch 19.0');
  });

  it('falls back to submodule add when tracked-path lookup fails', async () => {
    const calls: string[][] = [];
    const git: GitRunner = {
      async run(_cwd, args) {
        calls.push(args);
        if (args[0] === 'ls-files') {
          throw new Error('path not tracked');
        }
        return { stdout: '', stderr: '' };
      },
    };

    await ensureSubmodule(
      git,
      '/tmp/dev',
      'https://github.com/example-org/odoo_sample_module.git',
      '19.0',
      'odoo/custom/src/private/odoo_sample_module',
    );

    expect(calls).toContainEqual(['ls-files', '--error-unmatch', 'odoo/custom/src/private/odoo_sample_module']);
    expect(calls).toContainEqual([
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      '-b',
      '19.0',
      'https://github.com/example-org/odoo_sample_module.git',
      'odoo/custom/src/private/odoo_sample_module',
    ]);
  });

  it('continues submodule removal when deinit fails', async () => {
    const calls: string[][] = [];
    const git: GitRunner = {
      async run(_cwd, args) {
        calls.push(args);
        if (args[0] === 'submodule' && args[1] === 'deinit') {
          throw new Error('not initialized');
        }
        return { stdout: '', stderr: '' };
      },
    };

    await removeSubmodule(git, '/tmp/dev', 'odoo/custom/src/private/odoo_sample_module');

    expect(calls).toContainEqual(['submodule', 'deinit', '-f', 'odoo/custom/src/private/odoo_sample_module']);
    expect(calls).toContainEqual(['rm', '-f', 'odoo/custom/src/private/odoo_sample_module']);
  });

  it('returns undefined when origin URL cannot be resolved', async () => {
    const git: GitRunner = {
      async run() {
        throw new Error('no origin');
      },
    };

    await expect(getOriginUrl(git, '/tmp/dev')).resolves.toBeUndefined();
  });

  it('initializes empty local remotes, adds submodules, and stages generated files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-'));
    const communityRemote = join(root, 'odoo_sample_module.git');
    const reportsRemote = join(root, 'odoo_sample_module_reports.git');
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeLocalComposeFixture(root);

    await git(root, ['init', '--bare', communityRemote]);
    await git(root, ['init', '--bare', reportsRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await scaffold({
      product: 'odoo_sample_module',
      org: 'example-org',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: target,
      communityRepo: 'odoo_sample_module',
      proRepo: 'odoo_sample_module_reports',
      communityRepoUrl: communityRemote,
      proRepoUrl: reportsRemote,
      communityAddons: ['odoo_sample_module', 'odoo_sample_module_portal'],
      proAddons: ['odoo_sample_module_reports'],
      sourceRepos: [
        {
          url: communityRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module', 'odoo_sample_module_portal'],
        },
        {
          url: reportsRemote,
          path: 'odoo_sample_module_reports',
          addons: ['odoo_sample_module_reports'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module'))).resolves.toBeTruthy();
    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.toContain('branch = 19.0');

    const communityHeads = await git(communityRemote, ['show-ref', '--heads']);
    expect(communityHeads.stdout).toContain('refs/heads/19.0');

    const status = await git(target, ['status', '--short']);
    expect(status.stdout).toContain('A  .gitmodules');
    expect(status.stdout).toContain('A  README.md');
    expect(status.stdout).toContain('A  odoo/custom/src/private/odoo_sample_module');
  });

  it('supports a single source repo without a pro repo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-single-'));
    const communityRemote = join(root, 'odoo_sample_module.git');
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeLocalComposeFixture(root);

    await git(root, ['init', '--bare', communityRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await scaffold({
      product: 'odoo_sample_module',
      org: 'example-org',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: target,
      communityRepo: 'odoo_sample_module',
      proRepo: '',
      communityRepoUrl: communityRemote,
      proRepoUrl: '',
      communityAddons: ['odoo_sample_module'],
      proAddons: [],
      sourceRepos: [
        {
          url: communityRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module'))).resolves.toBeTruthy();
    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module_reports'))).rejects.toThrow();
    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.not.toContain('odoo_sample_module_reports');
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('ODOO_TEST_MODULE=odoo_sample_module');
  });

  it('clones the dev repo into the product_dev target when target is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-clone-dev-'));
    const devRemote = join(root, 'odoo_sample_module_dev.git');
    const sourceRemote = join(root, 'odoo_sample_module.git');
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeLocalComposeFixture(root);

    await git(root, ['init', '--bare', devRemote]);
    await git(root, ['init', '--bare', sourceRemote]);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: devRemote,
      sourceRepos: [
        {
          url: sourceRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, '.git'))).resolves.toBeTruthy();
    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module'))).resolves.toBeTruthy();
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('ODOO_TEST_MODULE=odoo_sample_module');
  });

  it('reuses already tracked submodules when cloning an existing dev repo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-existing-submodule-'));
    const devRemote = join(root, 'odoo_sample_module_dev.git');
    const sourceRemote = join(root, 'odoo_sample_module.git');
    const seed = join(root, 'seed-dev');
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeLocalComposeFixture(root);

    await git(root, ['init', '--bare', devRemote]);
    await git(root, ['init', '--bare', sourceRemote]);
    await git(root, ['clone', devRemote, seed]);
    await git(seed, ['config', 'user.name', 'Test User']);
    await git(seed, ['config', 'user.email', 'test@example.com']);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: devRemote,
      sourceRepos: [
        {
          url: sourceRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target: seed,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });
    await git(seed, ['commit', '-m', 'Initial scaffold']);
    await git(seed, ['push', 'origin', 'HEAD:main']);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: devRemote,
      sourceRepos: [
        {
          url: sourceRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module'))).resolves.toBeTruthy();
  });

  it('adds and removes a module repo after initial scaffold', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-add-remove-'));
    const baseRemote = join(root, 'odoo_sample_module.git');
    const reportsRemote = join(root, 'odoo_sample_module_reports.git');
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeLocalComposeFixture(root);

    await git(root, ['init', '--bare', baseRemote]);
    await git(root, ['init', '--bare', reportsRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: target,
      sourceRepos: [
        {
          url: baseRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });
    await git(target, ['commit', '-m', 'Initial scaffold']);

    await addModuleRepo({
      target,
      repoUrl: reportsRemote,
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module_reports'))).resolves.toBeTruthy();
    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.toContain(
      'path = odoo/custom/src/private/odoo_sample_module_reports',
    );
    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toContain(
      '/mnt/wpmoo-addons',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();

    await git(target, ['commit', '-m', 'Add reports repo']);

    await removeModuleRepo({
      target,
      repoPath: 'odoo_sample_module_reports',
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module_reports'))).rejects.toThrow();
    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.not.toContain('odoo_sample_module_reports');
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();
  });

  it('re-adds a source repo after removal leaves a local submodule gitdir', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-readd-'));
    const reportsRemote = join(root, 'odoo_sample_module_reports.git');
    const target = join(root, 'odoo_sample_module_dev');

    await git(root, ['init', '--bare', reportsRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await addModuleRepo({
      target,
      repoUrl: reportsRemote,
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });
    await git(target, ['commit', '-m', 'Add reports repo']);

    await removeModuleRepo({
      target,
      repoPath: 'odoo_sample_module_reports',
      stage: true,
    });
    await git(target, ['commit', '-m', 'Remove reports repo']);

    await addModuleRepo({
      target,
      repoUrl: reportsRemote,
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module_reports'))).resolves.toBeTruthy();
    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.toContain(
      'path = odoo/custom/src/private/odoo_sample_module_reports',
    );
  });

  it('lists a module repo added before the first dev environment commit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-add-before-commit-'));
    const baseRemote = join(root, 'odoo_sample_module.git');
    const reportsRemote = join(root, 'odoo_sample_module_reports.git');
    const target = join(root, 'odoo_sample_module_dev');
    const composeTemplateUrl = await writeLocalComposeFixture(root);

    await git(root, ['init', '--bare', baseRemote]);
    await git(root, ['init', '--bare', reportsRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: target,
      sourceRepos: [
        {
          url: baseRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await addModuleRepo({
      target,
      repoUrl: reportsRemote,
      repoPath: 'odoo_sample_module_reports',
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });

    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.toContain(
      'path = odoo/custom/src/private/odoo_sample_module_reports',
    );
    await expect(listModuleRepos(target)).resolves.toEqual(['odoo_sample_module', 'odoo_sample_module_reports']);
    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toContain('/mnt/wpmoo-addons');
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();
  });

  it('refuses to remove a dirty module submodule', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-dirty-remove-'));
    const reportsRemote = join(root, 'odoo_sample_module_reports.git');
    const target = join(root, 'odoo_sample_module_dev');

    await git(root, ['init', '--bare', reportsRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await addModuleRepo({
      target,
      repoUrl: reportsRemote,
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });
    await git(target, ['commit', '-m', 'Add reports repo']);
    await writeFile(join(target, 'odoo/custom/src/private/odoo_sample_module_reports/dirty.txt'), 'dirty\n', 'utf8');

    await expect(
      removeModuleRepo({
        target,
        repoPath: 'odoo_sample_module_reports',
        stage: true,
      }),
    ).rejects.toThrow('uncommitted changes');
  });
});
