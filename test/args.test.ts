import { describe, expect, it } from 'vitest';

import { isVersionRequested, optionsFromArgs } from '../src/args.js';
import { renderHelp } from '../src/help.js';
import { supportedOdooVersions } from '../src/odoo-versions.js';
import { inferRepoPath } from '../src/repo-url.js';

describe('args', () => {
  it('defaults target directory to product_dev under the current directory', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
    ]);

    expect(options?.target).toMatch(/odoo_sample_module_dev$/);
    expect(options?.devRepoUrl).toBe('https://github.com/example-org/odoo_sample_module_dev.git');
  });

  it('offers Odoo 19 as the default selectable version', () => {
    expect(supportedOdooVersions[0]).toBe('19.0');
    expect(supportedOdooVersions).toContain('18.0');
  });

  it('parses url-first source repositories without requiring a pro repo', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--odoo-version',
      '19.0',
      '--dev-repo-url',
      'https://github.com/example-org/odoo_sample_module_dev.git',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
      '--source-addons',
      'odoo_sample_module,odoo_sample_module_portal',
    ]);

    expect(options?.devRepoUrl).toBe('https://github.com/example-org/odoo_sample_module_dev.git');
    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module', 'odoo_sample_module_portal'],
      },
    ]);
  });

  it('normalizes GitHub organization page URLs into cloneable repository URLs', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--dev-repo-url',
      'https://github.com/orgs/wpmoo-org/odoo_sample_module_dev',
      '--source-repo-url',
      'https://github.com/orgs/wpmoo-org/odoo_sample_module',
    ]);

    expect(options?.devRepoUrl).toBe('https://github.com/wpmoo-org/odoo_sample_module_dev.git');
    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/wpmoo-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
      },
    ]);
  });

  it('defaults source addons to the repo path when addons are not provided', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--dev-repo-url',
      'https://github.com/example-org/odoo_sample_module_dev.git',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
    ]);

    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
      },
    ]);
  });

  it('parses repeated source repo flags with optional path overrides', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
      '--source-addons',
      'odoo_sample_module',
      '--source-repo-url',
      'git@github.com:example-org/odoo_sample_module_reports.git',
      '--source-path',
      'reports',
      '--source-addons',
      'odoo_sample_module_reports',
    ]);

    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
      },
      {
        url: 'git@github.com:example-org/odoo_sample_module_reports.git',
        path: 'reports',
        addons: ['odoo_sample_module_reports'],
      },
    ]);
  });

  it('infers source paths from common repo URL forms', () => {
    expect(inferRepoPath('https://github.com/example-org/odoo_sample_module.git')).toBe('odoo_sample_module');
    expect(inferRepoPath('git@github.com:example-org/odoo_sample_module_reports.git')).toBe(
      'odoo_sample_module_reports',
    );
    expect(inferRepoPath('/tmp/remotes/odoo_sample_module_private.git')).toBe('odoo_sample_module_private');
  });

  it('keeps legacy community/pro flags as a compatibility fallback', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--org',
      'example-org',
      '--community-repo',
      'odoo_sample_module',
      '--pro-repo',
      'odoo_sample_module_reports',
      '--community-addons',
      'odoo_sample_module',
      '--pro-addons',
      'odoo_sample_module_reports',
    ]);

    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
      },
      {
        url: 'https://github.com/example-org/odoo_sample_module_reports.git',
        path: 'odoo_sample_module_reports',
        addons: ['odoo_sample_module_reports'],
      },
    ]);
  });

  it('does not invent legacy portal demo or pro repos from product alone', () => {
    expect(() => optionsFromArgs(['--product', 'odoo_sample_module'])).toThrow(
      '--source-repo-url',
    );
  });

  it('renders help for url-first usage', () => {
    expect(renderHelp()).toContain('--source-repo-url');
    expect(renderHelp()).toContain('--dev-repo-url');
    expect(renderHelp()).toContain('npx @wpmoo/odoo-dev');
    expect(renderHelp()).not.toContain('  odoo-dev ');
  });

  it('detects version requests', () => {
    expect(isVersionRequested(['--version'])).toBe(true);
    expect(isVersionRequested(['-v'])).toBe(true);
    expect(isVersionRequested(['--product', 'odoo_sample_module'])).toBe(false);
  });

  it('parses false boolean values explicitly', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
      '--init-empty-repos=false',
      '--stage=false',
    ]);

    expect(options?.initEmptyRepos).toBe(false);
    expect(options?.stage).toBe(false);
  });

  it('parses missing repository creation options', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
      '--create-missing-repos',
      '--repo-visibility',
      'public',
    ]);

    expect(options?.createMissingRepos).toBe(true);
    expect(options?.repoVisibility).toBe('public');
  });

  it('parses comma-separated addon lists', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
      '--community-addons',
      'odoo_sample_module,odoo_sample_module_portal',
      '--pro-addons',
      'odoo_sample_module_reports',
    ]);

    expect(options?.sourceRepos[0]?.addons).toEqual(['odoo_sample_module']);
  });
});
