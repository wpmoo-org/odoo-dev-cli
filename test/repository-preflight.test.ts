import { describe, expect, it } from 'vitest';

import {
  checkGitHubRepositories,
  createGitHubRepositories,
  findInaccessibleGitHubRepositories,
  manualCreateCommands,
  repositoryPreflightAvailable,
  repositoryRequirements,
} from '../src/repository-preflight.js';
import type { GitHubRunner } from '../src/github.js';

describe('repository preflight', () => {
  const options = {
    product: 'odoo_sample_module',
    odooVersion: '19.0',
    devRepo: 'odoo_sample_module_dev',
    devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
    sourceRepos: [
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
      },
    ],
    target: '/tmp/odoo_sample_module_dev',
    dryRun: false,
    initEmptyRepos: true,
    stage: true,
  };

  it('includes the dev repo and every source repo', () => {
    expect(repositoryRequirements(options)).toEqual([
      {
        label: 'Dev environment repo',
        url: 'https://github.com/example-org/odoo_sample_module_dev.git',
        defaultVisibility: 'private',
      },
      {
        label: 'Source repo: odoo_sample_module',
        url: 'https://github.com/example-org/odoo_sample_module.git',
        defaultVisibility: 'private',
      },
    ]);
  });

  it('separates accessible and inaccessible GitHub repositories', async () => {
    const runner: GitHubRunner = {
      async run(args) {
        if (args.includes('example-org/odoo_sample_module')) {
          throw new Error('not found');
        }
        return { stdout: 'ok', stderr: '' };
      },
    };

    await expect(checkGitHubRepositories(options, runner)).resolves.toEqual({
      accessible: [
        {
          label: 'Dev environment repo',
          url: 'https://github.com/example-org/odoo_sample_module_dev.git',
          defaultVisibility: 'private',
          slug: 'example-org/odoo_sample_module_dev',
        },
      ],
      inaccessible: [
        {
          label: 'Source repo: odoo_sample_module',
          url: 'https://github.com/example-org/odoo_sample_module.git',
          defaultVisibility: 'private',
          slug: 'example-org/odoo_sample_module',
        },
      ],
    });
  });

  it('returns only inaccessible repositories from preflight checks', async () => {
    const runner: GitHubRunner = {
      async run(args) {
        if (args.includes('example-org/odoo_sample_module')) {
          throw new Error('not found');
        }
        return { stdout: 'ok', stderr: '' };
      },
    };

    await expect(findInaccessibleGitHubRepositories(options, runner)).resolves.toEqual([
      {
        label: 'Source repo: odoo_sample_module',
        url: 'https://github.com/example-org/odoo_sample_module.git',
        defaultVisibility: 'private',
        slug: 'example-org/odoo_sample_module',
      },
    ]);
  });

  it('creates each missing repository with selected visibility', async () => {
    const calls: string[][] = [];
    const runner: GitHubRunner = {
      async run(args) {
        calls.push(args);
        return { stdout: 'ok', stderr: '' };
      },
    };

    await createGitHubRepositories(
      [
        {
          label: 'Dev environment repo',
          url: 'https://github.com/example-org/odoo_sample_module_dev.git',
          defaultVisibility: 'private',
          slug: 'example-org/odoo_sample_module_dev',
        },
        {
          label: 'Source repo: odoo_sample_module',
          url: 'https://github.com/example-org/odoo_sample_module.git',
          defaultVisibility: 'private',
          slug: 'example-org/odoo_sample_module',
        },
      ],
      'public',
      runner,
    );

    expect(calls).toEqual([
      ['repo', 'create', 'example-org/odoo_sample_module_dev', '--public'],
      ['repo', 'create', 'example-org/odoo_sample_module', '--public'],
    ]);
  });

  it('reports unavailable when gh cli is missing', async () => {
    const runner: GitHubRunner = {
      async run() {
        throw new Error('spawn gh ENOENT');
      },
    };

    await expect(repositoryPreflightAvailable(runner)).resolves.toBe(false);
  });

  it('reports unavailable when gh is present but unauthenticated', async () => {
    const runner: GitHubRunner = {
      async run(args) {
        if (args[0] === '--version') {
          return { stdout: 'gh version 2.0.0', stderr: '' };
        }
        throw new Error('gh api auth failed');
      },
    };

    await expect(repositoryPreflightAvailable(runner)).resolves.toBe(false);
  });

  it('reports available when gh is present and authenticated', async () => {
    const runner: GitHubRunner = {
      async run(args) {
        if (args[0] === '--version') {
          return { stdout: 'gh version 2.0.0', stderr: '' };
        }
        if (args[0] === 'api' && args[1] === 'user') {
          return { stdout: 'wpmoo-org\n', stderr: '' };
        }
        throw new Error(`Unexpected command: ${args.join(' ')}`);
      },
    };

    await expect(repositoryPreflightAvailable(runner)).resolves.toBe(true);
  });

  it('ignores unsupported repository urls in preflight grouping', async () => {
    const runner: GitHubRunner = {
      async run() {
        return { stdout: 'ok', stderr: '' };
      },
    };
    const mixedOptions = {
      ...options,
      sourceRepos: [
        ...options.sourceRepos,
        {
          url: 'https://gitlab.com/example-org/odoo_sample_module_private.git',
          path: 'odoo_sample_module_private',
          addons: ['odoo_sample_module_private'],
        },
      ],
    };

    const result = await checkGitHubRepositories(mixedOptions, runner);
    expect(result.accessible).toHaveLength(2);
    expect(result.inaccessible).toEqual([]);
  });

  it('builds manual gh create commands for github and non-github urls', () => {
    expect(
      manualCreateCommands([
        {
          label: 'Dev environment repo',
          url: 'https://github.com/example-org/odoo_sample_module_dev.git',
          defaultVisibility: 'private',
          slug: 'example-org/odoo_sample_module_dev',
        },
        {
          label: 'Source repo: custom',
          url: 'https://gitlab.com/example-org/odoo_sample_module_private.git',
          defaultVisibility: 'public',
          slug: 'example-org/odoo_sample_module_private',
        },
      ]),
    ).toEqual([
      'gh repo create example-org/odoo_sample_module_dev --private',
      'gh repo create https://gitlab.com/example-org/odoo_sample_module_private.git --public',
    ]);
  });
});
