import { describe, expect, it } from 'vitest';

import { optionsFromArgs } from '../src/args.js';
import { renderHelp } from '../src/help.js';
import { supportedOdooVersions } from '../src/odoo-versions.js';
import { inferRepoPath } from '../src/repo-url.js';

describe('args', () => {
  it('defaults target directory to product_dev under the current directory', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_test',
      '--source-repo-url',
      'https://github.com/wpmoo-org/moo_test.git',
    ]);

    expect(options?.target).toMatch(/moo_test_dev$/);
    expect(options?.devRepoUrl).toBe('https://github.com/wpmoo-org/moo_test_dev.git');
  });

  it('offers Odoo 19 as the default selectable version', () => {
    expect(supportedOdooVersions[0]).toBe('19.0');
    expect(supportedOdooVersions).toContain('18.0');
  });

  it('parses url-first source repositories without requiring a pro repo', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_olympiad',
      '--odoo-version',
      '19.0',
      '--dev-repo-url',
      'https://github.com/cangir/moo_olympiad_dev.git',
      '--source-repo-url',
      'https://github.com/wpmoo-org/moo_olympiad.git',
      '--source-addons',
      'moo_olympiad,moo_olympiad_portal',
    ]);

    expect(options?.devRepoUrl).toBe('https://github.com/cangir/moo_olympiad_dev.git');
    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/wpmoo-org/moo_olympiad.git',
        path: 'moo_olympiad',
        addons: ['moo_olympiad', 'moo_olympiad_portal'],
      },
    ]);
  });

  it('defaults source addons to the repo path when addons are not provided', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_socialmedia_monitor',
      '--dev-repo-url',
      'https://github.com/cangir/moo_socialmedia_monitor_dev.git',
      '--source-repo-url',
      'https://github.com/wpmoo-org/moo_socialmedia_monitor.git',
    ]);

    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/wpmoo-org/moo_socialmedia_monitor.git',
        path: 'moo_socialmedia_monitor',
        addons: ['moo_socialmedia_monitor'],
      },
    ]);
  });

  it('parses repeated source repo flags with optional path overrides', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_olympiad',
      '--source-repo-url',
      'https://github.com/wpmoo-org/moo_olympiad.git',
      '--source-addons',
      'moo_olympiad',
      '--source-repo-url',
      'git@github.com:wpmoo-org/moo_olympiad_pro.git',
      '--source-path',
      'paid',
      '--source-addons',
      'moo_olympiad_payment,moo_olympiad_reports',
    ]);

    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/wpmoo-org/moo_olympiad.git',
        path: 'moo_olympiad',
        addons: ['moo_olympiad'],
      },
      {
        url: 'git@github.com:wpmoo-org/moo_olympiad_pro.git',
        path: 'paid',
        addons: ['moo_olympiad_payment', 'moo_olympiad_reports'],
      },
    ]);
  });

  it('infers source paths from common repo URL forms', () => {
    expect(inferRepoPath('https://github.com/wpmoo-org/moo_olympiad.git')).toBe('moo_olympiad');
    expect(inferRepoPath('git@github.com:wpmoo-org/moo_olympiad_pro.git')).toBe('moo_olympiad_pro');
    expect(inferRepoPath('/tmp/remotes/moo_olympiad_private.git')).toBe('moo_olympiad_private');
  });

  it('keeps legacy community/pro flags as a compatibility fallback', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_olympiad',
      '--org',
      'wpmoo-org',
      '--community-repo',
      'moo_olympiad',
      '--pro-repo',
      'moo_olympiad_pro',
      '--community-addons',
      'moo_olympiad',
      '--pro-addons',
      'moo_olympiad_payment',
    ]);

    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/wpmoo-org/moo_olympiad.git',
        path: 'moo_olympiad',
        addons: ['moo_olympiad'],
      },
      {
        url: 'https://github.com/wpmoo-org/moo_olympiad_pro.git',
        path: 'moo_olympiad_pro',
        addons: ['moo_olympiad_payment'],
      },
    ]);
  });

  it('does not invent legacy portal demo or pro repos from product alone', () => {
    expect(() => optionsFromArgs(['--product', 'moo_socialmedia_monitor'])).toThrow(
      '--source-repo-url',
    );
  });

  it('renders help for url-first usage', () => {
    expect(renderHelp()).toContain('--source-repo-url');
    expect(renderHelp()).toContain('--dev-repo-url');
    expect(renderHelp()).toContain('npx @wpmoo/create-odoo-dev');
  });

  it('parses false boolean values explicitly', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_olympiad',
      '--source-repo-url',
      'https://github.com/wpmoo-org/moo_olympiad.git',
      '--init-empty-repos=false',
      '--stage=false',
    ]);

    expect(options?.initEmptyRepos).toBe(false);
    expect(options?.stage).toBe(false);
  });

  it('parses comma-separated addon lists', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_olympiad',
      '--source-repo-url',
      'https://github.com/wpmoo-org/moo_olympiad.git',
      '--community-addons',
      'moo_olympiad,moo_olympiad_portal',
      '--pro-addons',
      'moo_olympiad_payment',
    ]);

    expect(options?.sourceRepos[0]?.addons).toEqual(['moo_olympiad']);
  });
});
