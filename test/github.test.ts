import { describe, expect, it } from 'vitest';

import {
  createGitHubRepository,
  getAuthenticatedGitHubLogin,
  getGitHubAccounts,
  getGitHubRepositoryStatus,
  githubRepositoryUrl,
  isGitHubCliAvailable,
  isGitHubAuthenticated,
  listGitHubOrganizations,
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

function outputRunner(outputs: Record<string, string>, failures: string[] = []): GitHubRunner & { calls: string[][] } {
  const calls: string[][] = [];

  return {
    calls,
    async run(args) {
      calls.push(args);
      const key = args.join(' ');
      if (failures.includes(key)) {
        throw new Error('failed');
      }
      return { stdout: outputs[key] ?? '', stderr: '' };
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

  it('builds cloneable GitHub repository URLs', () => {
    expect(githubRepositoryUrl('cangir', 'odoo_sample_module_dev')).toBe(
      'https://github.com/cangir/odoo_sample_module_dev.git',
    );
  });

  it('reads the authenticated GitHub user and organizations', async () => {
    const runner = outputRunner({
      'api user --jq .login': 'cangir\n',
      'api user/orgs --jq .[].login': 'wpmoo-org\nexample-org\n',
    });

    await expect(getAuthenticatedGitHubLogin(runner)).resolves.toBe('cangir');
    await expect(listGitHubOrganizations(runner)).resolves.toEqual(['wpmoo-org', 'example-org']);
    await expect(getGitHubAccounts(runner)).resolves.toEqual([
      { login: 'cangir', type: 'user' },
      { login: 'wpmoo-org', type: 'organization' },
      { login: 'example-org', type: 'organization' },
    ]);
  });

  it('treats gh api user failure as not authenticated', async () => {
    const runner = outputRunner({}, ['api user --jq .login']);

    await expect(isGitHubAuthenticated(runner)).resolves.toBe(false);
  });

  it('treats missing gh binary as unavailable', async () => {
    const runner: GitHubRunner = {
      async run() {
        throw new Error('spawn gh ENOENT');
      },
    };

    await expect(isGitHubCliAvailable(runner)).resolves.toBe(false);
  });

  it('treats thrown authentication checks as unauthenticated', async () => {
    const runner: GitHubRunner = {
      async run() {
        throw new Error('gh auth error');
      },
    };

    await expect(isGitHubAuthenticated(runner)).resolves.toBe(false);
  });

  it('rejects login reads that only return whitespace', async () => {
    const runner = outputRunner({
      'api user --jq .login': '   \n\t',
    });

    await expect(getAuthenticatedGitHubLogin(runner)).rejects.toThrow('GitHub CLI is not authenticated');
  });

  it('returns unsupported status for non-github repository urls', async () => {
    const runner = fakeRunner();

    await expect(getGitHubRepositoryStatus(runner, 'https://not-github.example/repo.git')).resolves.toEqual({
      status: 'unsupported',
    });
    expect(runner.calls).toEqual([]);
  });

  it('rejects create requests for non-github repository urls', async () => {
    const runner = fakeRunner();

    await expect(createGitHubRepository(runner, 'https://not-github.example/repo.git', 'private')).rejects.toThrow(
      'Only GitHub repository URLs can be created automatically',
    );
    expect(runner.calls).toEqual([]);
  });
});
