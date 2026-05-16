import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

import {
  renderBanner,
  renderAddonsYaml,
  renderAgents,
  renderGitignore,
  renderMooDelegationScript,
  renderReadme,
  renderReposYaml,
} from '../src/templates.js';
import { packageName, packageVersion } from '../src/version.js';

const expectedFallbackPackageSpec = `${packageName()}@${packageVersion()}`;

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
    expect(readme).toContain('odoo/custom/src/{private,oca,external}');
    expect(readme).toContain('./moo start');
    expect(readme).toContain('./moo stop');
    expect(readme).toContain('./moo logs odoo');
    expect(readme).toContain('./moo psql postgres');
    expect(readme).toContain('./moo install odoo_sample_module');
    expect(readme).toContain('./moo update odoo_sample_module');
    expect(readme).toContain('./moo test odoo_sample_module');
    expect(readme).toContain('./moo doctor');
    expect(readme).toContain('./moo status');
    expect(readme).toContain('./moo add-module');
    expect(readme).toContain('./moo resetdb devel odoo_sample_module');
    expect(readme).toContain('./moo snapshot devel before-update');
    expect(readme).toContain('./moo restore-snapshot before-update devel');
    expect(readme).toContain('./moo lint');
    expect(readme).toContain('./moo pot odoo_sample_module devel i18n/odoo_sample_module.pot');
    expect(readme).toContain('### Start And Inspect Services');
    expect(readme).toContain('### Run, Update, And Test Modules');
    expect(readme).toContain('### Snapshot And Restore');
    expect(readme).toContain('### Lint');
    expect(readme).toContain('### Export Translations');
    expect(readme).toContain('### Recover / Reset');
    expect(readme).toContain('`./moo status` and `./moo doctor` are package fallback commands');
    expect(readme).toContain('routes day-to-day service and module workflows to local scripts');
    expect(readme).toContain('compose.yaml');
    expect(readme).toContain('compose/dev.yaml');
    expect(readme).toContain('compose/stage.yaml');
    expect(readme).toContain('compose/prod.yaml');
    expect(readme).toContain('config/odoo/odoo.conf');
    expect(readme).toContain('resources/odoo/entrypoint.sh');
    expect(readme).toContain('compose.yaml                            # Base Docker Compose file');
    expect(readme).toContain('odoo/                                   # Odoo workspace data and custom source tree');
    expect(readme).toContain('private/                    # Project-owned/private addon repositories');
    expect(readme).toContain('oca/                        # OCA addon repositories');
    expect(readme).toContain('external/                   # Non-OCA third-party addon repositories');
    expect(readme).toContain('patches/                        # Local patches for upstream repositories');
    expect(readme).toContain('manifests/                      # Source manifests, locks, and pinned revisions');
    expect(readme).not.toContain('private/\n│           │   ├── README.md');
    expect(readme).not.toContain('oca/\n│           │   └── README.md');
    expect(readme).not.toContain('external/\n│           │   └── README.md');
    expect(readme).not.toContain('patches/\n│       │   └── README.md');
    expect(readme).not.toContain('manifests/\n│           └── README.md');
    expect(readme).toContain('Development uses compose.yaml plus compose/dev.yaml by default.');
    expect(readme).toContain(
      'Set WPMOO_ENV=stage or WPMOO_ENV=prod only after providing production-grade secrets and volumes.',
    );
    expect(readme).toContain('Source repositories stay under');
    expect(readme).toContain('odoo/custom/src/{private,oca,external}');
  });

  it('renders local-only README guidance when no source repos are configured yet', () => {
    const readme = renderReadme({
      ...options,
      devRepo: 'custom_local_env',
      devRepoUrl: '/tmp/custom_local_env',
      sourceRepos: [],
    });

    expect(readme).toContain('This environment was scaffolded without source repository submodules.');
    expect(readme).toContain('Add source repositories later from the cockpit or with `npx @wpmoo/odoo add-repo`.');
    expect(readme).toContain('odoo/custom/src/private');
    expect(readme).toContain('odoo/custom/src/oca');
    expect(readme).toContain('odoo/custom/src/external');
    expect(readme).toContain('odoo/custom/manifests');
    expect(readme).toContain('odoo/custom/patches');
    expect(readme).not.toContain('git clone --recurse-submodules /tmp/custom_local_env');
  });

  it('renders an executable bash dispatcher for the local moo shortcut', () => {
    const script = renderMooDelegationScript();

    expect(script).toContain('#!/usr/bin/env bash');
    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('cd "$script_dir"');
    expect(script).toContain('"start")');
    expect(script).toContain('./scripts/up.sh');
    expect(script).toContain('"stop")');
    expect(script).toContain('./scripts/down.sh');
    expect(script).toContain('"resetdb")');
    expect(script).toContain('./scripts/resetdb.sh');
    expect(script).toContain('"snapshot")');
    expect(script).toContain('./scripts/snapshot.sh');
    expect(script).toContain('"restore-snapshot")');
    expect(script).toContain('Usage: ./moo restore-snapshot [--dry-run] <snapshot-name> [db]');
    expect(script).toContain('./scripts/restore-snapshot.sh');
    expect(script).toContain('"lint")');
    expect(script).toContain('./scripts/lint.sh');
    expect(script).toContain('"pot")');
    expect(script).toContain('./scripts/pot.sh');
    expect(script).toContain(`exec npx --yes ${expectedFallbackPackageSpec} "$@"`);
  });

  it('dispatches daily commands locally and falls back to npx for management commands', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-moo-dispatch-'));
    await mkdir(join(target, 'scripts'), { recursive: true });
    await mkdir(join(target, 'bin'), { recursive: true });
    await writeFile(join(target, 'moo'), renderMooDelegationScript(), 'utf8');
    await chmod(join(target, 'moo'), 0o755);
    await writeFile(
      join(target, 'scripts/up.sh'),
      '#!/usr/bin/env bash\nprintf "up:%s\\n" "$*" >> "$PWD/calls.log"\n',
      'utf8',
    );
    await writeFile(
      join(target, 'scripts/restart.sh'),
      '#!/usr/bin/env bash\nprintf "restart:%s\\n" "$*" >> "$PWD/calls.log"\n',
      'utf8',
    );
    await writeFile(
      join(target, 'scripts/restore-snapshot.sh'),
      '#!/usr/bin/env bash\nprintf "restore-snapshot:%s\\n" "$*" >> "$PWD/calls.log"\n',
      'utf8',
    );
    await writeFile(
      join(target, 'scripts/pot.sh'),
      '#!/usr/bin/env bash\nprintf "pot:%s\\n" "$*" >> "$PWD/calls.log"\n',
      'utf8',
    );
    await writeFile(
      join(target, 'bin/npx'),
      '#!/usr/bin/env bash\nprintf "npx:%s\\n" "$*" >> "$PWD/calls.log"\n',
      'utf8',
    );
    await chmod(join(target, 'scripts/up.sh'), 0o755);
    await chmod(join(target, 'scripts/restart.sh'), 0o755);
    await chmod(join(target, 'scripts/restore-snapshot.sh'), 0o755);
    await chmod(join(target, 'scripts/pot.sh'), 0o755);
    await chmod(join(target, 'bin/npx'), 0o755);

    const env = { ...process.env, PATH: `${join(target, 'bin')}:${process.env.PATH ?? ''}` };
    await execa(join(target, 'moo'), ['start'], { env });
    await execa(join(target, 'moo'), ['restart'], { env });
    await execa(join(target, 'moo'), ['restore-snapshot', '--dry-run', 'before-update', 'devel'], { env });
    await execa(join(target, 'moo'), ['pot', 'sale,stock', 'devel', 'i18n/sale.pot'], { env });
    await execa(join(target, 'moo'), ['doctor'], { env });
    await execa(join(target, 'moo'), ['add-module'], { env });

    await expect(readFile(join(target, 'calls.log'), 'utf8')).resolves.toBe(
      [
        'up:',
        'restart:',
        'restore-snapshot:--dry-run before-update devel',
        'pot:sale,stock devel i18n/sale.pot',
        `npx:--yes ${expectedFallbackPackageSpec} doctor`,
        `npx:--yes ${expectedFallbackPackageSpec} add-module`,
        '',
      ].join('\n'),
    );
  }, 15000);

  it('renders README without pro assumptions for one source repo', () => {
    const readme = renderReadme({
      ...options,
      sourceRepos: [options.sourceRepos[0]],
    });

    expect(readme).toContain('odoo/custom/src/private/odoo_sample_module');
    expect(readme).toContain('odoo/custom/src/oca');
    expect(readme).toContain('odoo/custom/src/external');
    expect(readme).not.toContain('Pro repository');
    expect(readme).not.toContain('private paid/pro modules');
  });

  it('renders source-type aware source paths in generated docs', () => {
    const sourceOptions = {
      ...options,
      sourceRepos: [
        {
          sourceType: 'oca' as const,
          url: 'https://github.com/OCA/server-tools.git',
          path: 'server-tools',
          addons: ['queue_job'],
        },
      ],
    };

    expect(renderReadme(sourceOptions)).toContain('odoo/custom/src/oca/server-tools');
    expect(renderReadme(sourceOptions)).toContain('odoo/custom/manifests/sources.yaml');
    expect(renderAddonsYaml(sourceOptions)).toContain('oca/server-tools:');
    expect(renderReposYaml(sourceOptions)).toContain('# - oca/server-tools');
    expect(renderAgents(sourceOptions)).toContain('odoo/custom/src/oca/server-tools');
  });

  it('renders generated AGENTS guidance with daily maintenance commands', () => {
    const agents = renderAgents(options);

    expect(agents).toContain('./moo test odoo_sample_module');
    expect(agents).toContain('./moo lint');
    expect(agents).toContain('./moo resetdb [db] [module[,module]]');
    expect(agents).toContain('./moo snapshot [db] [snapshot-name]');
    expect(agents).toContain('./moo restore-snapshot [--dry-run] <snapshot-name> [db]');
    expect(agents).toContain('./moo pot <module[,module]> [db] [output]');
    expect(agents).toContain('`./moo status` and `./moo doctor` are package fallback commands');
    expect(agents).toContain('delegate to local `./scripts/*.sh`');
  });

  it('renders generated AGENTS guidance for local-only environments without empty repo lists', () => {
    const agents = renderAgents({
      ...options,
      devRepo: 'custom_local_env',
      devRepoUrl: '/tmp/custom_local_env',
      sourceRepos: [],
    });

    expect(agents).toContain('No source repositories are configured yet.');
    expect(agents).toContain('Use `./moo add-repo` or the cockpit Repositories menu before module-specific work.');
    expect(agents).not.toContain('undefined');
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

  it('renders a compact boxed CLI banner', () => {
    const banner = renderBanner();
    const plainBanner = banner.replace(/\u001B\[[0-9;]*m/g, '').trim();

    expect(plainBanner).toBe(
      [
        '╭────────────────────────────────────────────╮',
        '│ WPMoo                                      │',
        '│ Workflow Platform · Micro Object Oriented  │',
        '╰────────────────────────────────────────────╯',
      ].join('\n'),
    );
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
    expect(gitignore).toContain('addons/');
    expect(gitignore).toContain('backups/');
    expect(gitignore).toContain('postgresql/');
    expect(gitignore).toContain('odoo/custom/auto/');
    expect(gitignore).toContain('*.dump');
  });
});
