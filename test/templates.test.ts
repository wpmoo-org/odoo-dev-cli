import { describe, expect, it } from 'vitest';

import {
  renderBanner,
  renderAddonsYaml,
  renderGitignore,
  renderMooDelegationScript,
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
    expect(readme).toContain('./moo add-module');
  });

  it('renders an executable bash delegation for the local moo shortcut', () => {
    const script = renderMooDelegationScript();

    expect(script).toContain('#!/usr/bin/env bash');
    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('cd "$script_dir"');
    expect(script).toContain('exec npx --yes @wpmoo/odoo-dev@latest "$@"');
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

  it('renders optional Agent Skills instructions when a skills resource is configured', () => {
    const readme = renderReadme({
      ...options,
      agentSkillsTemplateUrl: 'gh:wpmoo-org/odoo-skills',
      agentSkillsTemplateRef: 'v0.1.0',
    });

    expect(readme).toContain('Agent Skills');
    expect(readme).toContain('gh:wpmoo-org/odoo-skills#v0.1.0');
    expect(readme).toContain('.agents/skills/');
  });

  it('renders a large CLI banner', () => {
    const banner = renderBanner();

    expect(banner.trim()).not.toBe('');
    expect(banner.split('\n').length).toBeGreaterThan(4);
  });

  it('renders the CLI banner with the requested blue-to-pink gradient', () => {
    const banner = renderBanner();

    expect(banner).toContain('\u001B[1m');
    expect(banner).toContain('\u001B[38;2;31;151;231m');
    expect(banner).toContain('\u001B[38;2;209;95;127m');
    expect(banner).not.toContain('\u001B[38;2;192;78;133m');
    expect(banner).toContain('\u001B[0m');
  });

  it('renders gitignore for Docker, Odoo, and local files', () => {
    const gitignore = renderGitignore();

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('odoo/custom/auto/');
    expect(gitignore).toContain('*.dump');
  });
});
