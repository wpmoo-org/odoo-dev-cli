import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scaffold } from '../src/scaffold.js';
import type { GitRunner } from '../src/git.js';

async function writeStandaloneResourceFixtures(root: string): Promise<{ compose: string; skills: string }> {
  const compose = join(root, 'odoo-docker-compose');
  const skills = join(root, 'odoo-skills');

  await mkdir(join(compose, 'etc'), { recursive: true });
  await mkdir(join(skills, 'skills/odoo-oca'), { recursive: true });
  await writeFile(join(compose, 'docker-compose_18.0.yml'), 'services:\n  odoo:\n    image: "${ODOO_IMAGE:-odoo:18}"\n');
  await writeFile(join(compose, 'README.md'), '# WPMoo Odoo Compose\n');
  await writeFile(join(compose, 'etc/odoo.conf'), '[options]\n');
  await writeFile(join(skills, 'skills/odoo-oca/SKILL.md'), '---\nname: odoo-oca\n---\n');

  return { compose, skills };
}

async function writeCompactComposeFixture(root: string): Promise<string> {
  const compose = join(root, 'odoo-docker-compose');
  const compact = join(compose, 'resources/generated-env');

  await mkdir(join(compact, 'compose'), { recursive: true });
  await mkdir(join(compact, 'scripts'), { recursive: true });
  await mkdir(join(compact, 'config/odoo'), { recursive: true });
  await mkdir(join(compact, 'resources/odoo'), { recursive: true });
  await mkdir(join(compose, '.github/workflows'), { recursive: true });
  await mkdir(join(compose, 'docs/assets'), { recursive: true });
  await mkdir(join(compose, 'test'), { recursive: true });
  await writeFile(join(compact, 'compose.yaml'), 'services:\n  odoo:\n');
  await writeFile(join(compact, 'compose/dev.yaml'), 'services:\n  odoo-dev:\n');
  await writeFile(join(compact, 'scripts/up.sh'), '#!/usr/bin/env bash\nexit 0\n');
  await writeFile(join(compact, 'config/odoo/odoo.conf'), '[options]\n');
  await writeFile(join(compact, 'resources/odoo/entrypoint.sh'), '#!/usr/bin/env bash\nexec odoo\n');
  await writeFile(join(compact, 'README.md'), '# WPMoo Compact Compose\nUse compose.yaml.\n');
  await writeFile(join(compose, 'README.md'), '# WPMoo Legacy Compose\nUse docker-compose_19.0.yml.\n');
  await writeFile(join(compose, '.github/workflows/ci.yml'), 'name: ci\n');
  await writeFile(join(compose, 'docs/assets/diagram.png'), 'asset\n');
  await writeFile(join(compose, 'test/compose.test.ts'), 'test\n');
  await writeFile(join(compose, 'package.json'), '{}\n');
  await writeFile(join(compose, 'docker-compose_19.0.yml'), 'legacy compose\n');

  return compose;
}

describe('scaffold', () => {
  it('creates a local-only target without cloning the dev repo or adding submodules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-local-only-root-'));
    const target = join(root, 'custom-local-env');
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-local-only-assets-')));
    const gitCalls: Array<{ cwd: string; args: string[] }> = [];
    const git: GitRunner = {
      run: async (cwd, args) => {
        gitCalls.push({ cwd, args });
        throw new Error(`Unexpected git call: ${args.join(' ')}`);
      },
    };

    await scaffold(
      {
        product: 'odoo_sample_module',
        odooVersion: '18.0',
        engine: 'compose',
        composeTemplateUrl: fixtures.compose,
        devRepo: 'odoo_sample_module_dev',
        devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
        sourceRepos: [],
        target,
        dryRun: false,
        initEmptyRepos: false,
        stage: false,
        skipSubmodules: true,
      },
      git,
    );

    await expect(stat(target)).resolves.toBeTruthy();
    await expect(readFile(join(target, '.wpmoo/odoo.json'), 'utf8')).resolves.toContain(
      '"product": "odoo_sample_module"',
    );
    await expect(readFile(join(target, '.wpmoo/odoo.json'), 'utf8')).resolves.toContain(
      '"sourceRepos": []',
    );
    await expect(readFile(join(target, 'odoo/custom/src/private/README.md'), 'utf8')).resolves.toContain(
      'Project-owned/private addon repositories go here.',
    );
    await expect(readFile(join(target, 'odoo/custom/src/oca/README.md'), 'utf8')).resolves.toContain(
      'OCA repositories go here',
    );
    await expect(readFile(join(target, 'odoo/custom/src/external/README.md'), 'utf8')).resolves.toContain(
      'Non-OCA third-party, vendor, and community addon repositories go here.',
    );
    await expect(readFile(join(target, 'odoo/custom/patches/README.md'), 'utf8')).resolves.toContain(
      'Local patches for upstream/vendor/OCA repositories go here.',
    );
    await expect(readFile(join(target, 'odoo/custom/manifests/README.md'), 'utf8')).resolves.toContain(
      'Manifest/lock/list files for external sources and pinned revisions go here.',
    );
    expect(gitCalls).toEqual([]);
  });

  it('dry-run reports planned files without writing them', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-dry-run-'));

    const result = await scaffold({
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
      target,
      dryRun: true,
      initEmptyRepos: false,
      stage: false,
    });

    expect(result.plannedFiles).toContain('.gitignore');
    expect(result.plannedFiles).toContain('moo');
    expect(result.plannedFiles).toContain('odoo/custom/src/oca/README.md');
    expect(result.plannedFiles).toContain('odoo/custom/src/external/README.md');
    expect(result.plannedFiles).toContain('odoo/custom/patches/README.md');
    expect(result.plannedFiles).toContain('odoo/custom/manifests/README.md');
    await expect(stat(join(target, '.gitignore'))).rejects.toThrow();
  });

  it('plans external compose and agent skill assets in dry-run', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-compose-dry-run-'));

    const result = await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      engine: 'compose',
      agentSkillsTemplateUrl: 'gh:wpmoo-org/odoo-skills',
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      sourceRepos: [
        {
          url: 'https://github.com/example-org/odoo_sample_module.git',
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: true,
      initEmptyRepos: false,
      stage: false,
    });

    expect(result.plannedCommands).toContain(`copy external compose: gh:wpmoo-org/odoo-docker-compose -> ${target}`);
    expect(result.plannedCommands).toContain(
      `copy external agent-skills: gh:wpmoo-org/odoo-skills/skills -> ${target}/.agents/skills`,
    );
  });

  it('applies local standalone compose and skill resources when configured', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-local-assets-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-asset-fixtures-')));

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '18.0',
      engine: 'compose',
      composeTemplateUrl: fixtures.compose,
      agentSkillsTemplateUrl: fixtures.skills,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      sourceRepos: [
        {
          url: 'https://github.com/example-org/odoo_sample_module.git',
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: false,
      stage: false,
      skipSubmodules: true,
    });

    await expect(readFile(join(target, 'docker-compose_18.0.yml'), 'utf8')).resolves.toContain('ODOO_IMAGE:-odoo:18');
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('ODOO_VERSION=18.0');
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.toContain('WPMoo Odoo Compose');
    await expect(readFile(join(target, '.agents/skills/odoo-oca/SKILL.md'), 'utf8')).resolves.toContain(
      'name: odoo-oca',
    );
    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      'Odoo Sample Module Development Environment',
    );
  });

  it('prefers compact compose resources and omits bulky repository-only files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-compact-assets-'));
    const composeTemplateUrl = await writeCompactComposeFixture(await mkdtemp(join(tmpdir(), 'wpmoo-compact-fixtures-')));

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      engine: 'compose',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      sourceRepos: [
        {
          url: 'https://github.com/example-org/odoo_sample_module.git',
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: false,
      stage: false,
      skipSubmodules: true,
    });

    await expect(readFile(join(target, 'compose.yaml'), 'utf8')).resolves.toContain('services:');
    await expect(readFile(join(target, 'compose/dev.yaml'), 'utf8')).resolves.toContain('odoo-dev');
    await expect(readFile(join(target, 'scripts/up.sh'), 'utf8')).resolves.toContain('exit 0');
    await expect(readFile(join(target, 'config/odoo/odoo.conf'), 'utf8')).resolves.toContain('[options]');
    await expect(readFile(join(target, 'resources/odoo/entrypoint.sh'), 'utf8')).resolves.toContain('exec odoo');
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.toContain('WPMoo Compact Compose');
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.not.toContain('docker-compose_19.0.yml');
    await expect(readFile(join(target, 'docker-compose_19.0.yml'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(target, '.github/workflows/ci.yml'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(target, 'docs/assets/diagram.png'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(target, 'test/compose.test.ts'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(target, 'package.json'), 'utf8')).rejects.toThrow();
  });

  it('writes overlay files when dry-run is disabled', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-scaffold-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-overlay-fixtures-')));

    await scaffold({
      product: 'odoo_sample_module',
      org: 'example-org',
      odooVersion: '19.0',
      composeTemplateUrl: fixtures.compose,
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
      ],
      target,
      dryRun: false,
      initEmptyRepos: false,
      stage: false,
      skipSubmodules: true,
    });

    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      'Odoo Sample Module Development Environment',
    );
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('ODOO_TEST_MODULE=odoo_sample_module');
    await expect(readFile(join(target, 'odoo/custom/src/private/README.md'), 'utf8')).resolves.toContain(
      'Project-owned/private addon repositories go here.',
    );
    await expect(readFile(join(target, 'moo'), 'utf8')).resolves.toContain(
      'exec npx --yes @wpmoo/odoo@latest "$@"',
    );
    await expect(readFile(join(target, 'moo'), 'utf8')).resolves.toContain('./scripts/up.sh');
    await expect(readFile(join(target, 'moo'), 'utf8')).resolves.toContain('./scripts/down.sh');
    expect((await stat(join(target, 'moo'))).mode & 0o111).not.toBe(0);
  });
});
