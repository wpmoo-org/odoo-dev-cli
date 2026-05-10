import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

import { scaffold } from '../src/scaffold.js';

async function git(cwd: string, args: string[]) {
  return execa('git', args, { cwd });
}

describe('git integration', () => {
  it('initializes empty local remotes, adds submodules, and stages generated files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-'));
    const communityRemote = join(root, 'odoo_sample_module.git');
    const reportsRemote = join(root, 'odoo_sample_module_reports.git');
    const target = join(root, 'odoo_sample_module_dev');

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

    await git(root, ['init', '--bare', communityRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await scaffold({
      product: 'odoo_sample_module',
      org: 'example-org',
      odooVersion: '19.0',
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
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.not.toContain(
      'private/odoo_sample_module_reports:',
    );
  });

  it('clones the dev repo into the product_dev target when target is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-clone-dev-'));
    const devRemote = join(root, 'odoo_sample_module_dev.git');
    const sourceRemote = join(root, 'odoo_sample_module.git');
    const target = join(root, 'odoo_sample_module_dev');

    await git(root, ['init', '--bare', devRemote]);
    await git(root, ['init', '--bare', sourceRemote]);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
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
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      '  - odoo_sample_module',
    );
  });
});
