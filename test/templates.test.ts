import { describe, expect, it } from 'vitest';

import {
  renderBanner,
  renderAddonsYaml,
  renderGitignore,
  renderReadme,
  renderReposYaml,
} from '../src/templates.js';

describe('template rendering', () => {
  const options = {
    product: 'odoo_sample_module',
    org: 'example-org',
    odooVersion: '19.0',
    devRepo: 'odoo_sample_module_dev',
    devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
    communityRepo: 'odoo_sample_module',
    proRepo: 'odoo_sample_module_reports',
    communityRepoUrl: 'https://github.com/example-org/odoo_sample_module.git',
    proRepoUrl: 'https://github.com/example-org/odoo_sample_module_reports.git',
    communityAddons: ['odoo_sample_module', 'odoo_sample_module_portal'],
    proAddons: ['odoo_sample_module_reports'],
    sourceRepos: [
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module', 'odoo_sample_module_portal'],
      },
      {
        url: 'https://github.com/example-org/odoo_sample_module_reports.git',
        path: 'odoo_sample_module_reports',
        addons: ['odoo_sample_module_reports'],
      },
    ],
  };

  it('renders addons.yaml from source repos', () => {
    expect(renderAddonsYaml(options)).toContain('private/odoo_sample_module:');
    expect(renderAddonsYaml(options)).toContain('  - odoo_sample_module_portal');
    expect(renderAddonsYaml(options)).toContain('private/odoo_sample_module_reports:');
    expect(renderAddonsYaml(options)).toContain('  - odoo_sample_module_reports');
  });

  it('keeps product submodules out of repos.yaml', () => {
    const yaml = renderReposYaml(options);

    expect(yaml).toContain('https://github.com/OCA/OCB.git');
    expect(yaml).toContain('private/odoo_sample_module');
    expect(yaml).toContain('private/odoo_sample_module_reports');
    expect(yaml).not.toContain('git@github.com:example-org/odoo_sample_module.git');
    expect(yaml).not.toContain('https://github.com/example-org/odoo_sample_module.git');
  });

  it('renders README with source repo submodule paths and dev clone URL', () => {
    const readme = renderReadme(options);

    expect(readme).toContain('Odoo Sample Module Development Environment');
    expect(readme).toContain('git clone --recurse-submodules https://github.com/example-org/odoo_sample_module_dev.git');
    expect(readme).toContain('odoo/custom/src/private/odoo_sample_module_reports');
  });

  it('renders README without pro assumptions for one source repo', () => {
    const readme = renderReadme({
      ...options,
      sourceRepos: [options.sourceRepos[0]],
    });

    expect(readme).toContain('odoo/custom/src/private/odoo_sample_module');
    expect(readme).not.toContain('Pro repository');
    expect(readme).not.toContain('private paid/pro modules');
  });

  it('renders a large CLI banner', () => {
    const banner = renderBanner();

    expect(banner.trim()).not.toBe('');
    expect(banner.split('\n').length).toBeGreaterThan(4);
  });

  it('renders the CLI banner with Odoo-inspired ANSI color', () => {
    const banner = renderBanner();

    expect(banner).toContain('\u001B[1m\u001B[38;2;192;78;133m');
    expect(banner).toContain('\u001B[0m');
  });

  it('renders gitignore for Doodba and local files', () => {
    const gitignore = renderGitignore();

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('odoo/custom/auto/');
    expect(gitignore).toContain('*.dump');
  });
});
