import { describe, expect, it } from 'vitest';

import {
  createGitHubRepository,
  getGitHubRepositoryStatus,
  parseGitHubRepoUrl,
  type GitHubRunner,
} from '../src/github.js';

function fakeRunner(failures: string[] = []): GitHubRunner & { calls: string[][] } {
  const calls: string[][] = [];

  return {
    calls,
    async run(args) {
      calls.push(args);
      if (failures.some((failure) => args.join(' ').includes(failure))) {
        throw new Error('not found');
      }
      return { stdout: 'ok', stderr: '' };
    },
  };
}

describe('github helpers', () => {
  it('parses GitHub HTTPS and SSH repository URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/example-org/odoo_sample_module.git')).toEqual({
      owner: 'example-org',
      name: 'odoo_sample_module',
    });
    expect(parseGitHubRepoUrl('git@github.com:example-org/odoo_sample_module_dev.git')).toEqual({
      owner: 'example-org',
      name: 'odoo_sample_module_dev',
    });
    expect(parseGitHubRepoUrl('/tmp/odoo_sample_module.git')).toBeUndefined();
  });

  it('checks repository accessibility with gh repo view', async () => {
    const runner = fakeRunner();

    await expect(
      getGitHubRepositoryStatus(runner, 'https://github.com/example-org/odoo_sample_module.git'),
    ).resolves.toEqual({ status: 'accessible', slug: 'example-org/odoo_sample_module' });
    expect(runner.calls).toEqual([['repo', 'view', 'example-org/odoo_sample_module', '--json', 'name']]);
  });

  it('reports inaccessible GitHub repositories without assuming they do not exist', async () => {
    const runner = fakeRunner(['repo view']);

    await expect(
      getGitHubRepositoryStatus(runner, 'https://github.com/example-org/odoo_sample_module.git'),
    ).resolves.toEqual({ status: 'inaccessible', slug: 'example-org/odoo_sample_module' });
  });

  it('creates missing repositories through gh using selected visibility', async () => {
    const runner = fakeRunner();

    await createGitHubRepository(runner, 'https://github.com/example-org/odoo_sample_module.git', 'private');

    expect(runner.calls).toEqual([['repo', 'create', 'example-org/odoo_sample_module', '--private']]);
  });
});
