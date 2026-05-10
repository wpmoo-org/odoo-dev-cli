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
    const communityRemote = join(root, 'moo_olympiad.git');
    const proRemote = join(root, 'moo_olympiad_pro.git');
    const target = join(root, 'moo_olympiad_dev');

    await git(root, ['init', '--bare', communityRemote]);
    await git(root, ['init', '--bare', proRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await scaffold({
      product: 'moo_olympiad',
      org: 'wpmoo-org',
      odooVersion: '19.0',
      devRepo: 'moo_olympiad_dev',
      devRepoUrl: target,
      communityRepo: 'moo_olympiad',
      proRepo: 'moo_olympiad_pro',
      communityRepoUrl: communityRemote,
      proRepoUrl: proRemote,
      communityAddons: ['moo_olympiad', 'moo_olympiad_portal'],
      proAddons: ['moo_olympiad_payment'],
      sourceRepos: [
        {
          url: communityRemote,
          path: 'moo_olympiad',
          addons: ['moo_olympiad', 'moo_olympiad_portal'],
        },
        {
          url: proRemote,
          path: 'moo_olympiad_pro',
          addons: ['moo_olympiad_payment'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/moo_olympiad'))).resolves.toBeTruthy();
    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.toContain('branch = 19.0');

    const communityHeads = await git(communityRemote, ['show-ref', '--heads']);
    expect(communityHeads.stdout).toContain('refs/heads/19.0');

    const status = await git(target, ['status', '--short']);
    expect(status.stdout).toContain('A  .gitmodules');
    expect(status.stdout).toContain('A  README.md');
    expect(status.stdout).toContain('A  odoo/custom/src/private/moo_olympiad');
  });

  it('supports a single source repo without a pro repo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-single-'));
    const communityRemote = join(root, 'moo_olympiad.git');
    const target = join(root, 'moo_olympiad_dev');

    await git(root, ['init', '--bare', communityRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await scaffold({
      product: 'moo_olympiad',
      org: 'wpmoo-org',
      odooVersion: '19.0',
      devRepo: 'moo_olympiad_dev',
      devRepoUrl: target,
      communityRepo: 'moo_olympiad',
      proRepo: '',
      communityRepoUrl: communityRemote,
      proRepoUrl: '',
      communityAddons: ['moo_olympiad'],
      proAddons: [],
      sourceRepos: [
        {
          url: communityRemote,
          path: 'moo_olympiad',
          addons: ['moo_olympiad'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/moo_olympiad'))).resolves.toBeTruthy();
    await expect(stat(join(target, 'odoo/custom/src/private/moo_olympiad_pro'))).rejects.toThrow();
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.not.toContain(
      'private/moo_olympiad_pro:',
    );
  });

  it('clones the dev repo into the product_dev target when target is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-git-clone-dev-'));
    const devRemote = join(root, 'moo_test_dev.git');
    const sourceRemote = join(root, 'moo_test.git');
    const target = join(root, 'moo_test_dev');

    await git(root, ['init', '--bare', devRemote]);
    await git(root, ['init', '--bare', sourceRemote]);

    await scaffold({
      product: 'moo_test',
      odooVersion: '19.0',
      devRepo: 'moo_test_dev',
      devRepoUrl: devRemote,
      sourceRepos: [
        {
          url: sourceRemote,
          path: 'moo_test',
          addons: ['moo_test'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
    });

    await expect(stat(join(target, '.git'))).resolves.toBeTruthy();
    await expect(stat(join(target, 'odoo/custom/src/private/moo_test'))).resolves.toBeTruthy();
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      '  - moo_test',
    );
  });
});
