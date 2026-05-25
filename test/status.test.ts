import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getEnvironmentStatus,
  environmentStatusJson,
  environmentBannerSummaryLine,
  renderEnvironmentStatus,
  renderEnvironmentStatusForTarget,
  renderEnvironmentStatusSummary,
} from '../src/status.js';

const validMetadata = {
  tool: '@wpmoo/toolkit',
  version: '0.8.45',
  product: 'sample',
  odooVersion: '19.0',
  devRepo: 'sample_dev',
  devRepoUrl: 'https://github.com/example/sample_dev.git',
  sourceRepos: [],
};

async function makeTarget(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeMetadata(target: string, metadataContent: string): Promise<void> {
  await mkdir(join(target, '.wpmoo'), { recursive: true });
  await writeFile(join(target, '.wpmoo/odoo.json'), metadataContent);
}

async function writeCoreFiles(target: string, version = '19.0'): Promise<void> {
  await writeFile(join(target, 'moo'), '#!/usr/bin/env bash\n');
  await writeFile(join(target, 'README.md'), '# Test\n');
  await writeFile(join(target, 'AGENTS.md'), '# Test\n');
  await writeFile(join(target, `docker-compose_${version}.yml`), 'services:\n  odoo:\n    image: odoo\n');
  await mkdir(join(target, 'scripts'), { recursive: true });
}

async function writeCoreFilesWithoutCompose(target: string): Promise<void> {
  await writeFile(join(target, 'moo'), '#!/usr/bin/env bash\n');
  await writeFile(join(target, 'README.md'), '# Test\n');
  await writeFile(join(target, 'AGENTS.md'), '# Test\n');
  await mkdir(join(target, 'scripts'), { recursive: true });
}

async function writeCompactCoreFiles(target: string, envName = 'dev'): Promise<void> {
  await writeFile(join(target, 'moo'), '#!/usr/bin/env bash\n');
  await writeFile(join(target, 'README.md'), '# Test\n');
  await writeFile(join(target, 'AGENTS.md'), '# Test\n');
  await writeFile(join(target, 'compose.yaml'), 'services:\n  odoo:\n    image: odoo\n');
  await mkdir(join(target, 'compose'), { recursive: true });
  await writeFile(join(target, 'compose', `${envName}.yaml`), 'services:\n  odoo:\n    environment: []\n');
  await mkdir(join(target, 'scripts'), { recursive: true });
}

describe('status', () => {
  it('reports no environment when metadata file is missing', async () => {
    const target = await makeTarget('wpmoo-status-none-');
    const status = await getEnvironmentStatus(target);

    expect(status.kind).toBe('no_environment');
    expect(status.recommendedNextAction).toBe('Run npx @wpmoo/toolkit create ...');
    expect(renderEnvironmentStatusSummary(status)).toBe('No WPMoo environment detected.');
    expect(renderEnvironmentStatus(status)).toContain('Metadata: missing .wpmoo/odoo.json');
  });

  it('reports invalid metadata without throwing', async () => {
    const target = await makeTarget('wpmoo-status-invalid-');
    await writeMetadata(target, '{bad json');

    await expect(getEnvironmentStatus(target)).resolves.toMatchObject({
      kind: 'invalid_metadata',
      recommendedNextAction:
        'Fix .wpmoo/odoo.json or run npx @wpmoo/toolkit reset from a valid environment.',
    });
  });

  it('reports valid metadata with no source repos and add-repo recommendation', async () => {
    const target = await makeTarget('wpmoo-status-empty-repos-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCoreFiles(target, '19.0');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoCount).toBe(0);
    expect(status.sourceRepoPaths).toEqual([]);
    expect(status.invalidSourceRepoPaths).toEqual([]);
    expect(status.moduleCandidateCount).toBe(0);
    expect(status.missingCoreFiles).toEqual([]);
    expect(status.composeFiles).toEqual(['docker-compose_19.0.yml']);
    expect(status.composeErrors).toEqual([]);
    expect(status.recommendedNextAction).toBe('Run npx @wpmoo/toolkit add-repo ...');
    expect(renderEnvironmentStatus(status)).toContain('Compose files: docker-compose_19.0.yml');
  });

  it('reports compact compose layout files', async () => {
    const target = await makeTarget('wpmoo-status-compact-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCompactCoreFiles(target, 'dev');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.missingCoreFiles).toEqual([]);
    expect(status.composeFiles).toEqual(['compose.yaml', 'compose/dev.yaml']);
    expect(status.composeErrors).toEqual([]);
    expect(renderEnvironmentStatus(status)).toContain('Compose files: compose.yaml, compose/dev.yaml');
  });

  it('reports invalid WPMOO_ENV as a compose error that needs attention', async () => {
    const target = await makeTarget('wpmoo-status-invalid-wpmoo-env-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCoreFilesWithoutCompose(target);
    await writeFile(join(target, '.env'), 'WPMOO_ENV=../stage\n');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.composeFiles).toEqual([]);
    expect(status.composeErrors).toEqual([
      'Invalid WPMOO_ENV in .env: expected a simple compose overlay name, got ../stage',
    ]);
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment needs attention');
    expect(renderEnvironmentStatus(status)).toContain(
      'Compose errors: Invalid WPMOO_ENV in .env: expected a simple compose overlay name, got ../stage',
    );
  });

  it('reports invalid metadata Odoo versions before checking legacy compose paths', async () => {
    const target = await makeTarget('wpmoo-status-invalid-version-');
    await writeMetadata(target, JSON.stringify({ ...validMetadata, odooVersion: '../19.0' }, null, 2));
    await writeCoreFilesWithoutCompose(target);

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.composeErrors).toEqual([
      'Invalid Odoo version for compose file: ../19.0',
    ]);
    expect(status.missingCoreFiles).toEqual([]);
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment needs attention');
  });

  it('counts module candidates from configured source repo paths', async () => {
    const target = await makeTarget('wpmoo-status-modules-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/a.git', path: 'repo_a', addons: [] },
        { url: 'https://github.com/example/b.git', path: 'repo_b', addons: [] },
      ],
    };

    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await mkdir(join(target, 'odoo/custom/src/private/repo_a/mod_one'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/repo_a/mod_one/views'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/private/repo_a/mod_one/__manifest__.py'),
      '{\n    "installable": True,\n}\n',
    );
    await writeFile(
      join(target, 'odoo/custom/src/private/repo_a/mod_one/views/mod_one_menus.xml'),
      '<odoo><record id="action_mod_one" model="ir.actions.act_window"/><menuitem id="menu_mod_one" action="action_mod_one"/></odoo>\n',
    );
    await mkdir(join(target, 'odoo/custom/src/private/repo_b/mod_two'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_b/mod_two/__manifest__.py'), '{}');
    await mkdir(join(target, 'odoo/custom/src/private/repo_b/mod_three'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_b/mod_three/__manifest__.py'), '{}');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoCount).toBe(2);
    expect(status.sourceRepoPaths).toEqual(['repo_a', 'repo_b']);
    expect(status.invalidSourceRepoPaths).toEqual([]);
    expect(status.moduleCandidateCount).toBe(3);
    expect(status.moduleQuality).toMatchObject({
      totalModules: 3,
      installableModules: 3,
      nonInstallableModules: 0,
      modulesWithMenuActions: 1,
      modulesMissingMenuActions: 2,
    });
    expect(status.moduleQuality.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'mod_one',
          path: 'odoo/custom/src/private/repo_a/mod_one',
          issue: 'missing license in __manifest__.py',
        },
        {
          moduleName: 'mod_two',
          path: 'odoo/custom/src/private/repo_b/mod_two',
          issue: 'missing actionable menu XML',
        },
        {
          moduleName: 'mod_three',
          path: 'odoo/custom/src/private/repo_b/mod_three',
          issue: 'missing tests directory',
        },
      ]),
    );
    expect(status.recommendedNextAction).toBe(
      'Run npx @wpmoo/toolkit doctor for deep checks or ./moo start.',
    );
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment ready');
    expect(renderEnvironmentStatus(status)).toContain(
      'Module quality: 3 installable, 0 non-installable, 2 missing menu actions.',
    );
  });

  it('marks status JSON unhealthy when duplicate addon technical names are found', async () => {
    const target = await makeTarget('wpmoo-status-duplicate-addons-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/a.git', path: 'repo_a', addons: [] },
        { url: 'https://github.com/example/b.git', path: 'repo_b', addons: [] },
      ],
    };
    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');

    for (const repo of ['repo_a', 'repo_b']) {
      const modulePath = join(target, 'odoo/custom/src/private', repo, 'demo_duplicate');
      await mkdir(join(modulePath, 'views'), { recursive: true });
      await mkdir(join(modulePath, 'security'), { recursive: true });
      await mkdir(join(modulePath, 'tests'), { recursive: true });
      await writeFile(
        join(modulePath, '__manifest__.py'),
        [
          '{',
          "  'name': 'Demo',",
          "  'installable': True,",
          "  'version': '1.0.0',",
          "  'license': 'LGPL-3',",
          "  'depends': ['base'],",
          "  'data': ['security/ir.model.access.csv', 'views/demo_views.xml'],",
          '}',
          '',
        ].join('\n'),
      );
      await writeFile(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
      await writeFile(
        join(modulePath, 'views', 'demo_views.xml'),
        '<odoo><record id="action_demo" model="ir.actions.act_window"/><menuitem id="menu_demo" action="action_demo"/></odoo>\n',
      );
    }

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(environmentStatusJson(status).ok).toBe(false);
    expect(status.moduleQuality.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_duplicate',
          issue: expect.stringContaining('duplicate addon technical name: demo_duplicate'),
          severity: 'error',
        }),
      ]),
    );
  });

  it('marks status JSON unhealthy when configured dependency policy is violated', async () => {
    const target = await makeTarget('wpmoo-status-policy-violation-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [{ url: 'https://github.com/example/policy.git', path: 'policy_repo', addons: [] }],
    };
    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await writeFile(
      join(target, '.wpmoo/policy.yaml'),
      [
        'addonGroups:',
        '  community:',
        '    - community_core',
        '  pro:',
        '    - pro_account',
        'rules:',
        '  - from: community',
        '    mustNotDependOn: pro',
        '',
      ].join('\n'),
    );

    const modulePath = join(target, 'odoo/custom/src/private/policy_repo/community_core');
    await mkdir(join(modulePath, 'views'), { recursive: true });
    await mkdir(join(modulePath, 'security'), { recursive: true });
    await mkdir(join(modulePath, 'tests'), { recursive: true });
    await writeFile(
      join(modulePath, '__manifest__.py'),
      [
        '{',
        "  'name': 'Community Core',",
        "  'installable': True,",
        "  'version': '1.0.0',",
        "  'license': 'LGPL-3',",
        "  'depends': ['base', 'pro_account'],",
        "  'data': ['security/ir.model.access.csv', 'views/demo_views.xml'],",
        '}',
        '',
      ].join('\n'),
    );
    await writeFile(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
    await writeFile(
      join(modulePath, 'views', 'demo_views.xml'),
      '<odoo><record id="action_demo" model="ir.actions.act_window"/><menuitem id="menu_demo" action="action_demo"/></odoo>\n',
    );

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(environmentStatusJson(status).ok).toBe(false);
    expect(status.moduleQuality.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'community_core',
          path: 'odoo/custom/src/private/policy_repo/community_core',
          severity: 'error',
          issue: 'dependency policy violation: community_core (community) must not depend on pro_account (pro)',
        }),
      ]),
    );
  });

  it('counts module candidates from source-aware repo sourceType directories', async () => {
    const target = await makeTarget('wpmoo-status-source-types-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/private.git', path: 'private_repo', addons: [] },
        { url: 'https://github.com/example/oca.git', path: 'oca_repo', sourceType: 'oca', addons: [] },
        {
          url: 'https://github.com/example/external.git',
          path: 'external_repo',
          sourceType: 'external',
          addons: [],
        },
      ],
    };

    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await mkdir(join(target, 'odoo/custom/src/private/private_repo/private_mod'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/private/private_repo/private_mod/__manifest__.py'),
      '{}',
    );
    await mkdir(join(target, 'odoo/custom/src/oca/oca_repo/oca_mod'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/oca/oca_repo/oca_mod/__manifest__.py'), '{}');
    await mkdir(join(target, 'odoo/custom/src/external/external_repo/external_mod'), {
      recursive: true,
    });
    await writeFile(
      join(target, 'odoo/custom/src/external/external_repo/external_mod/__manifest__.py'),
      '{}',
    );

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoCount).toBe(3);
    expect(status.sourceRepoPaths).toEqual(['private_repo', 'oca_repo', 'external_repo']);
    expect(status.invalidSourceRepoPaths).toEqual([]);
    expect(status.moduleCandidateCount).toBe(3);
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment ready');
  });

  it('renders compact environment summary line with repo and module counts', async () => {
    const target = await makeTarget('wpmoo-status-banner-counts-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/repo_a.git', path: 'repo_a', addons: [] },
        { url: 'https://github.com/example/repo_b.git', path: 'repo_b', addons: [] },
      ],
    };

    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await mkdir(join(target, 'odoo/custom/src/private/repo_a/a_module'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_a/a_module/__manifest__.py'), '{}');
    await mkdir(join(target, 'odoo/custom/src/private/repo_a/b_module'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_a/b_module/__manifest__.py'), '{}');
    await mkdir(join(target, 'odoo/custom/src/private/repo_b/c_module'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_b/c_module/__manifest__.py'), '{}');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoCount).toBe(2);
    expect(status.moduleCandidateCount).toBe(3);
    expect(environmentBannerSummaryLine(status)).toBe('Environment: Odoo 19.0 · 2 repos · 3 modules');
  });

  it('adds compose errors to compact banner summary without drifting from status health', async () => {
    const target = await makeTarget('wpmoo-status-banner-compose-errors-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCompactCoreFiles(target);
    await writeFile(join(target, '.env'), 'WPMOO_ENV=../stage\n');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.composeErrors).toEqual([
      'Invalid WPMOO_ENV in .env: expected a simple compose overlay name, got ../stage',
    ]);
    expect(environmentBannerSummaryLine(status)).toBe('Environment: Odoo 19.0 · 0 repos · 0 modules · 1 issue');
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment needs attention');
  });

  it('defaults legacy sourceRepos entries to private paths', async () => {
    const target = await makeTarget('wpmoo-status-legacy-source-type-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/legacy.git', path: 'legacy_repo', addons: [] },
      ],
    };

    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await mkdir(join(target, 'odoo/custom/src/private/legacy_repo/legacy_mod'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/legacy_repo/legacy_mod/__manifest__.py'), '{}');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoCount).toBe(1);
    expect(status.sourceRepoPaths).toEqual(['legacy_repo']);
    expect(status.moduleCandidateCount).toBe(1);
    expect(status.invalidSourceRepoPaths).toEqual([]);
    expect(status.recommendedNextAction).toBe(
      'Run npx @wpmoo/toolkit doctor for deep checks or ./moo start.',
    );
  });

  it('reports invalid source repo paths without scanning outside private sources', async () => {
    const target = await makeTarget('wpmoo-status-invalid-source-path-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/a.git', path: 'repo_a', addons: [] },
        { url: 'https://github.com/example/escape.git', path: '../escape', addons: [] },
      ],
    };

    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await mkdir(join(target, 'odoo/custom/src/private/repo_a/mod_one'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_a/mod_one/__manifest__.py'), '{}');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoPaths).toEqual(['repo_a']);
    expect(status.invalidSourceRepoPaths).toEqual(['../escape']);
    expect(status.moduleCandidateCount).toBe(1);
    expect(status.recommendedNextAction).toBe(
      'Fix invalid source repo paths in .wpmoo/odoo.json, then run npx @wpmoo/toolkit doctor.',
    );
    expect(renderEnvironmentStatus(status)).toContain('Invalid source repo paths: ../escape');
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment needs attention');
  });

  it('reports missing core files and reset recommendation', async () => {
    const target = await makeTarget('wpmoo-status-missing-core-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [{ url: 'https://github.com/example/a.git', path: 'repo_a', addons: [] }],
    };
    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await mkdir(join(target, 'odoo/custom/src/private/repo_a'), { recursive: true });

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.missingCoreFiles).toEqual(
      expect.arrayContaining(['moo', 'README.md', 'AGENTS.md', 'docker-compose_19.0.yml', 'scripts/']),
    );
    expect(status.recommendedNextAction).toBe(
      'Run npx @wpmoo/toolkit reset, then npx @wpmoo/toolkit doctor.',
    );
    expect(renderEnvironmentStatus(status)).toContain('Missing core files:');
  });

  it('renders status for target as an integrated offline output', async () => {
    const target = await makeTarget('wpmoo-status-render-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCoreFiles(target, '19.0');

    const output = await renderEnvironmentStatusForTarget(target);
    expect(output).toContain('Status: Environment ready: Odoo 19.0, source repos 0, module candidates 0.');
    expect(output).toContain('Next: Run npx @wpmoo/toolkit add-repo ...');
  });

  it('renders machine-readable status payload for ready environments', async () => {
    const target = await makeTarget('wpmoo-status-json-ready-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCoreFiles(target, '19.0');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    const payload = environmentStatusJson(status);
    expect(payload).toEqual({
      schemaVersion: 1,
      command: 'status',
      ok: true,
      status: {
        kind: 'environment',
        target,
        metadataPath: '.wpmoo/odoo.json',
        odooVersion: '19.0',
        sourceRepoCount: 0,
        sourceRepoPaths: [],
        invalidSourceRepoPaths: [],
        moduleCandidateCount: 0,
        moduleQuality: {
          totalModules: 0,
          installableModules: 0,
          nonInstallableModules: 0,
          modulesWithMenuActions: 0,
          modulesMissingMenuActions: 0,
          addons: [],
          issues: [],
        },
        composeFiles: ['docker-compose_19.0.yml'],
        composeErrors: [],
        missingCoreFiles: [],
        recommendedNextAction: 'Run npx @wpmoo/toolkit add-repo ...',
      },
    });
  });

  it('returns ok=false for no_environment JSON payload', async () => {
    const target = await makeTarget('wpmoo-status-json-none-');
    const status = await getEnvironmentStatus(target);
    const payload = environmentStatusJson(status);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.command).toBe('status');
    expect(payload.ok).toBe(false);
    expect(payload.status.kind).toBe('no_environment');
    expect(payload.status.target).toBe(target);
  });

  it('returns ok=false for invalid metadata JSON payload', async () => {
    const target = await makeTarget('wpmoo-status-json-invalid-');
    await writeMetadata(target, '{bad json');

    const status = await getEnvironmentStatus(target);
    const payload = environmentStatusJson(status);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.command).toBe('status');
    expect(payload.ok).toBe(false);
    expect(payload.status.kind).toBe('invalid_metadata');
    expect(payload.status.metadataPath).toBe('.wpmoo/odoo.json');
    expect(payload.status).toHaveProperty('metadataError');
  });

  it('returns ok=false for needs-attention environments', async () => {
    const target = await makeTarget('wpmoo-status-json-attention-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [{ url: 'https://github.com/example/escape.git', path: '../escape', addons: [] }],
    };
    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');

    const status = await getEnvironmentStatus(target);
    const payload = environmentStatusJson(status);

    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;
    expect(status.invalidSourceRepoPaths).toEqual(['../escape']);
    expect(payload.ok).toBe(false);
    expect(payload.status.kind).toBe('environment');
    if (payload.status.kind === 'environment') {
      expect(payload.status.invalidSourceRepoPaths).toEqual(['../escape']);
    }
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});
