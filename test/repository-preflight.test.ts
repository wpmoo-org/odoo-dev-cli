import { describe, expect, it } from 'vitest';

import { checkGitHubRepositories, repositoryRequirements } from '../src/repository-preflight.js';
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
});
