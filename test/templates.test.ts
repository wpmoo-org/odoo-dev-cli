import { describe, expect, it } from 'vitest';

import {
  defaultCommunityAddons,
  defaultProAddons,
  renderAddonsYaml,
  renderGitignore,
  renderReadme,
  renderReposYaml,
} from '../src/templates.js';

describe('template rendering', () => {
  const options = {
    product: 'moo_olympiad',
    org: 'wpmoo-org',
    odooVersion: '19.0',
    devRepo: 'moo_olympiad_dev',
    communityRepo: 'moo_olympiad',
    proRepo: 'moo_olympiad_pro',
    communityRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad.git',
    proRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad_pro.git',
    communityAddons: defaultCommunityAddons('moo_olympiad'),
    proAddons: defaultProAddons('moo_olympiad'),
  };

  it('renders addons.yaml with community and pro suite paths', () => {
    expect(renderAddonsYaml(options)).toContain('private/moo_olympiad:');
    expect(renderAddonsYaml(options)).toContain('  - moo_olympiad_portal');
    expect(renderAddonsYaml(options)).toContain('private/moo_olympiad_pro:');
    expect(renderAddonsYaml(options)).toContain('  - moo_olympiad_analytics');
  });

  it('keeps product submodules out of repos.yaml', () => {
    const yaml = renderReposYaml(options);

    expect(yaml).toContain('https://github.com/OCA/OCB.git');
    expect(yaml).toContain('private/moo_olympiad');
    expect(yaml).not.toContain('git@github.com:wpmoo-org/moo_olympiad.git');
    expect(yaml).not.toContain('https://github.com/wpmoo-org/moo_olympiad.git');
  });

  it('renders README with product-specific submodule paths and clone command', () => {
    const readme = renderReadme(options);

    expect(readme).toContain('Moo Olympiad Development Environment');
    expect(readme).toContain('git clone --recurse-submodules https://github.com/wpmoo-org/moo_olympiad_dev.git');
    expect(readme).toContain('odoo/custom/src/private/moo_olympiad_pro');
  });

  it('renders gitignore for Doodba and local files', () => {
    const gitignore = renderGitignore();

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('odoo/custom/auto/');
    expect(gitignore).toContain('*.dump');
  });
});

