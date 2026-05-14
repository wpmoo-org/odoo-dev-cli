import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scaffold } from '../src/scaffold.js';

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

describe('scaffold', () => {
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
      'WPMoo source repositories',
    );
    await expect(readFile(join(target, 'moo'), 'utf8')).resolves.toContain(
      'exec npx --yes @wpmoo/odoo@latest "$@"',
    );
    expect((await stat(join(target, 'moo'))).mode & 0o111).not.toBe(0);
  });
});
