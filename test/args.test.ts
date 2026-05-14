import { describe, expect, it } from 'vitest';

import {
  commandFromArgs,
  defaultTargetForProduct,
  isHelpRequested,
  isUpdateCheckFlag,
  isVersionRequested,
  optionsFromArgs,
  stripInternalFlags,
} from '../src/args.js';
import { renderHelp } from '../src/help.js';
import { supportedOdooVersions } from '../src/odoo-versions.js';
import { inferRepoPath } from '../src/repo-url.js';

describe('args', () => {
  it('defaults target directory to product_dev under the supplied working directory', () => {
    expect(defaultTargetForProduct('odoo_sample_module', '/tmp/wpmoo-work')).toBe(
      '/tmp/wpmoo-work/odoo_sample_module_dev',
    );
  });

  it('keeps the current working directory when it is already the product_dev directory', () => {
    expect(defaultTargetForProduct('odoo_sample_module', '/tmp/wpmoo-work/odoo_sample_module_dev')).toBe(
      '/tmp/wpmoo-work/odoo_sample_module_dev',
    );
  });

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

  it('uses a custom target directory when --target is provided', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--target',
      '/tmp/custom-odoo-dev',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
    ]);

    expect(options?.target).toBe('/tmp/custom-odoo-dev');
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

  it('rejects traversal source path overrides', () => {
    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--source-path',
        '../outside_target',
      ]),
    ).toThrow('Invalid repo path');
  });

  it('infers source paths from common repo URL forms', () => {
    expect(inferRepoPath('https://github.com/example-org/odoo_sample_module.git')).toBe('odoo_sample_module');
    expect(inferRepoPath('git@github.com:example-org/odoo_sample_module_reports.git')).toBe(
      'odoo_sample_module_reports',
    );
    expect(inferRepoPath('/tmp/remotes/odoo_sample_module_private.git')).toBe('odoo_sample_module_private');
  });

  it('keeps community/pro flags as a compatibility fallback', () => {
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

  it('does not invent portal demo or pro repos from product alone', () => {
    expect(() => optionsFromArgs(['--product', 'odoo_sample_module'])).toThrow(
      '--source-repo-url',
    );
  });

  it('renders help for url-first usage', () => {
    expect(renderHelp()).toContain('--source-repo-url');
    expect(renderHelp()).toContain('--dev-repo-url');
    expect(renderHelp()).toContain('npx @wpmoo/odoo');
    expect(renderHelp()).toContain('npx @wpmoo/odoo doctor');
    expect(renderHelp()).toContain('npx @wpmoo/odoo start');
    expect(renderHelp()).toContain('npx @wpmoo/odoo stop');
    expect(renderHelp()).toContain('npx @wpmoo/odoo logs [service]');
    expect(renderHelp()).toContain('npx @wpmoo/odoo update <module[,module]> [db]');
    expect(renderHelp()).toContain('npx @wpmoo/odoo test <module[,module]> [--db <db>] [--mode init|update]');
    expect(renderHelp()).toContain('npx @wpmoo/odoo resetdb [db] [module[,module]]');
    expect(renderHelp()).toContain('npx @wpmoo/odoo snapshot [db] [snapshot-name]');
    expect(renderHelp()).toContain('npx @wpmoo/odoo restore-snapshot <snapshot-name> [db]');
    expect(renderHelp()).toContain('npx @wpmoo/odoo lint');
    expect(renderHelp()).toContain('npx @wpmoo/odoo pot <module[,module]> [db] [output]');
  });

  it('routes explicit subcommands and create args', () => {
    expect(commandFromArgs([])).toEqual({ command: 'menu', argv: [] });
    expect(commandFromArgs(['create', '--product', 'odoo_sample_module'])).toEqual({
      command: 'create',
      argv: ['--product', 'odoo_sample_module'],
    });
    expect(commandFromArgs(['add-repo', '--repo-url', 'https://github.com/example-org/reports.git'])).toEqual({
      command: 'add-repo',
      argv: ['--repo-url', 'https://github.com/example-org/reports.git'],
    });
    expect(commandFromArgs(['remove-repo', '--repo', 'reports'])).toEqual({
      command: 'remove-repo',
      argv: ['--repo', 'reports'],
    });
    expect(commandFromArgs(['add-module', '--repo', 'odoo_sample_module', '--module', 'odoo_sample_module_base'])).toEqual({
      command: 'add-module',
      argv: ['--repo', 'odoo_sample_module', '--module', 'odoo_sample_module_base'],
    });
    expect(commandFromArgs(['remove-module', '--repo', 'odoo_sample_module', '--module', 'odoo_sample_module_base'])).toEqual({
      command: 'remove-module',
      argv: ['--repo', 'odoo_sample_module', '--module', 'odoo_sample_module_base'],
    });
    expect(commandFromArgs(['reset', '--target', '/tmp/dev'])).toEqual({
      command: 'reset',
      argv: ['--target', '/tmp/dev'],
    });
    expect(commandFromArgs(['doctor'])).toEqual({
      command: 'doctor',
      argv: [],
    });
    expect(commandFromArgs(['status'])).toEqual({
      command: 'status',
      argv: [],
    });
    expect(commandFromArgs(['logs', 'db'])).toEqual({
      command: 'logs',
      argv: ['db'],
    });
    expect(commandFromArgs(['start'])).toEqual({
      command: 'start',
      argv: [],
    });
    expect(commandFromArgs(['stop'])).toEqual({
      command: 'stop',
      argv: [],
    });
    expect(commandFromArgs(['restart'])).toEqual({
      command: 'restart',
      argv: [],
    });
    expect(commandFromArgs(['shell'])).toEqual({
      command: 'shell',
      argv: [],
    });
    expect(commandFromArgs(['psql', 'devel'])).toEqual({
      command: 'psql',
      argv: ['devel'],
    });
    expect(commandFromArgs(['install', 'sale', 'devel'])).toEqual({
      command: 'install',
      argv: ['sale', 'devel'],
    });
    expect(commandFromArgs(['update', 'sale', 'devel'])).toEqual({
      command: 'update',
      argv: ['sale', 'devel'],
    });
    expect(commandFromArgs(['test', 'sale', '--db', 'devel', '--mode', 'update'])).toEqual({
      command: 'test',
      argv: ['sale', '--db', 'devel', '--mode', 'update'],
    });
    expect(commandFromArgs(['resetdb', 'devel', 'sale,stock'])).toEqual({
      command: 'resetdb',
      argv: ['devel', 'sale,stock'],
    });
    expect(commandFromArgs(['snapshot', 'devel', 'before-update'])).toEqual({
      command: 'snapshot',
      argv: ['devel', 'before-update'],
    });
    expect(commandFromArgs(['restore-snapshot', 'before-update', 'devel'])).toEqual({
      command: 'restore-snapshot',
      argv: ['before-update', 'devel'],
    });
    expect(commandFromArgs(['lint'])).toEqual({
      command: 'lint',
      argv: [],
    });
    expect(commandFromArgs(['pot', 'sale,stock', 'devel', 'i18n/sale.pot'])).toEqual({
      command: 'pot',
      argv: ['sale,stock', 'devel', 'i18n/sale.pot'],
    });
    expect(commandFromArgs(['--product', 'odoo_sample_module'])).toEqual({
      command: 'create',
      argv: ['--product', 'odoo_sample_module'],
    });
  });

  it('rejects unknown commands', () => {
    expect(() => commandFromArgs(['unknown-command'])).toThrow('Unknown command: unknown-command');
  });

  it('detects help requests', () => {
    expect(isHelpRequested(['--help'])).toBe(true);
    expect(isHelpRequested(['-h'])).toBe(true);
    expect(isHelpRequested(['--product', 'odoo_sample_module'])).toBe(false);
  });

  it('detects version requests', () => {
    expect(isVersionRequested(['--version'])).toBe(true);
    expect(isVersionRequested(['-v'])).toBe(true);
    expect(isVersionRequested(['--product', 'odoo_sample_module'])).toBe(false);
  });

  it('detects and strips the internal update-check flag', () => {
    expect(isUpdateCheckFlag('--no-update-check')).toBe(true);
    expect(stripInternalFlags(['--no-update-check', 'create', '--product', 'odoo_sample_module'])).toEqual([
      'create',
      '--product',
      'odoo_sample_module',
    ]);
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

  it('rejects invalid boolean values', () => {
    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--stage',
        'later',
      ]),
    ).toThrow('Invalid boolean value for --stage: later');
  });

  it('parses external compose and agent skill template options', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
      '--engine',
      'compose',
      '--compose-template-url',
      'gh:wpmoo-org/odoo-docker-compose',
      '--compose-template-ref',
      'v0.1.0',
      '--agent-skills-template',
      '--agent-skills-template-url',
      'gh:wpmoo-org/odoo-skills',
      '--agent-skills-template-ref',
      'v0.1.0',
      '--postgres-version',
      '18',
      '--http-port',
      '11019',
      '--gevent-port',
      '21019',
    ]);

    expect(options?.engine).toBe('compose');
    expect(options?.composeTemplateUrl).toBe('gh:wpmoo-org/odoo-docker-compose');
    expect(options?.composeTemplateRef).toBe('v0.1.0');
    expect(options?.agentSkillsTemplateUrl).toBe('gh:wpmoo-org/odoo-skills');
    expect(options?.agentSkillsTemplateRef).toBe('v0.1.0');
    expect(options?.postgresVersion).toBe('18');
    expect(options?.httpPort).toBe('11019');
    expect(options?.geventPort).toBe('21019');
  });

  it('infers compose engine when a compose template URL is provided', () => {
    const options = optionsFromArgs([
      '--product',
      'odoo_sample_module',
      '--source-repo-url',
      'https://github.com/example-org/odoo_sample_module.git',
      '--compose-template-url',
      '../odoo-docker-compose',
    ]);

    expect(options?.engine).toBe('compose');
    expect(options?.composeTemplateUrl).toBe('../odoo-docker-compose');
  });

  it('rejects unknown environment engines', () => {
    const removedEngine = ['doo', 'dba'].join('');

    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--engine',
        'unknown',
      ]),
    ).toThrow('Invalid value for --engine');

    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--engine',
        removedEngine,
      ]),
    ).toThrow('Invalid value for --engine');
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

  it('rejects invalid repo visibility values', () => {
    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--repo-visibility',
        'internal',
      ]),
    ).toThrow('Invalid value for --repo-visibility: internal');
  });

  it('rejects the removed optional development pack flags', () => {
    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--pack',
        'agentic-stack',
      ]),
    ).toThrow('Optional development packs were removed');

    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--no-packs',
      ]),
    ).toThrow('Optional development packs were removed');
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

  it('returns undefined when no product is provided', () => {
    expect(
      optionsFromArgs(['--source-repo-url', 'https://github.com/example-org/odoo_sample_module.git']),
    ).toBeUndefined();
  });

  it('rejects unexpected positional arguments', () => {
    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        'extra',
      ]),
    ).toThrow('Unexpected argument: extra');
  });

  it('rejects missing values for source repo options', () => {
    expect(() =>
      optionsFromArgs(['--product', 'odoo_sample_module', '--source-repo-url']),
    ).toThrow('Missing value for --source-repo-url');

    expect(() =>
      optionsFromArgs([
        '--product',
        'odoo_sample_module',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--source-path',
      ]),
    ).toThrow('Missing value for --source-path');
  });

  it('rejects source path and addon flags before source repo flags', () => {
    expect(() => optionsFromArgs(['--product', 'odoo_sample_module', '--source-path', 'community'])).toThrow(
      '--source-path must follow --source-repo-url',
    );
    expect(() => optionsFromArgs(['--product', 'odoo_sample_module', '--source-addons', 'sale'])).toThrow(
      '--source-addons must follow --source-repo-url',
    );
  });

  it('allows legacy source aliases without explicit pro repo flags', () => {
    const options = optionsFromArgs(['--product', 'odoo_sample_module', '--org', 'example-org']);

    expect(options?.sourceRepos).toEqual([
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
      },
    ]);
  });
});
