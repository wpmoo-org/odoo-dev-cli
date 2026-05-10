import { describe, expect, it } from 'vitest';

import { repositoryRequirements } from '../src/repository-preflight.js';

describe('repository preflight', () => {
  it('includes the dev repo and every source repo', () => {
    expect(
      repositoryRequirements({
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
      }),
    ).toEqual([
      {
        label: 'Dev environment repo',
        url: 'https://github.com/example-org/odoo_sample_module_dev.git',
        defaultVisibility: 'private',
      },
      {
        label: 'Module source repo: odoo_sample_module',
        url: 'https://github.com/example-org/odoo_sample_module.git',
        defaultVisibility: 'private',
      },
    ]);
  });
});
