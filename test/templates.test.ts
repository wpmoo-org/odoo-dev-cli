import { describe, expect, it } from 'vitest';

import {
  defaultCommunityAddons,
  defaultProAddons,
  renderBanner,
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
    devRepoUrl: 'https://github.com/cangir/moo_olympiad_dev.git',
    communityRepo: 'moo_olympiad',
    proRepo: 'moo_olympiad_pro',
    communityRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad.git',
    proRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad_pro.git',
    communityAddons: defaultCommunityAddons('moo_olympiad'),
    proAddons: defaultProAddons('moo_olympiad'),
    sourceRepos: [
      {
        url: 'https://github.com/wpmoo-org/moo_olympiad.git',
        path: 'moo_olympiad',
        addons: defaultCommunityAddons('moo_olympiad'),
      },
      {
        url: 'https://github.com/wpmoo-org/moo_olympiad_pro.git',
        path: 'moo_olympiad_pro',
        addons: defaultProAddons('moo_olympiad'),
      },
    ],
  };

  it('renders addons.yaml from source repos', () => {
    expect(renderAddonsYaml(options)).toContain('private/moo_olympiad:');
    expect(renderAddonsYaml(options)).toContain('  - moo_olympiad_portal');
    expect(renderAddonsYaml(options)).toContain('private/moo_olympiad_pro:');
    expect(renderAddonsYaml(options)).toContain('  - moo_olympiad_analytics');
  });

  it('keeps product submodules out of repos.yaml', () => {
    const yaml = renderReposYaml(options);

    expect(yaml).toContain('https://github.com/OCA/OCB.git');
    expect(yaml).toContain('private/moo_olympiad');
    expect(yaml).toContain('private/moo_olympiad_pro');
    expect(yaml).not.toContain('git@github.com:wpmoo-org/moo_olympiad.git');
    expect(yaml).not.toContain('https://github.com/wpmoo-org/moo_olympiad.git');
  });

  it('renders README with source repo submodule paths and dev clone URL', () => {
    const readme = renderReadme(options);

    expect(readme).toContain('Moo Olympiad Development Environment');
    expect(readme).toContain('git clone --recurse-submodules https://github.com/cangir/moo_olympiad_dev.git');
    expect(readme).toContain('odoo/custom/src/private/moo_olympiad_pro');
  });

  it('renders README without pro assumptions for one source repo', () => {
    const readme = renderReadme({
      ...options,
      sourceRepos: [options.sourceRepos[0]],
    });

    expect(readme).toContain('odoo/custom/src/private/moo_olympiad');
    expect(readme).not.toContain('Pro repository');
    expect(readme).not.toContain('private paid/pro modules');
  });

  it('renders a large ASCII WPMoo.org banner', () => {
    const banner = renderBanner();

    expect(banner).toContain('WPMoo.org');
    expect(banner.split('\n').length).toBeGreaterThan(4);
  });

  it('renders gitignore for Doodba and local files', () => {
    const gitignore = renderGitignore();

    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('odoo/custom/auto/');
    expect(gitignore).toContain('*.dump');
  });
});
