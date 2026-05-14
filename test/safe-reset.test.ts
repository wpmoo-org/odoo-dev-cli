import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GitRunner } from '../src/git.js';
import { renderSafeResetPreview, safeResetEnvironment } from '../src/safe-reset.js';

async function writeStandaloneResourceFixtures(root: string): Promise<{ compose: string; skills: string }> {
  const compose = join(root, 'odoo-docker-compose');
  const skills = join(root, 'odoo-skills');

  await mkdir(join(compose, 'etc'), { recursive: true });
  await mkdir(join(compose, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });
  await mkdir(join(skills, 'skills/odoo-oca'), { recursive: true });
  await writeFile(join(compose, 'docker-compose_18.0.yml'), 'services:\n  odoo:\n    image: refreshed-compose\n');
  await writeFile(join(compose, 'README.md'), '# Refreshed Compose Docs\n');
  await writeFile(join(compose, 'etc/odoo.conf'), '[options]\nrefreshed = true\n');
  await writeFile(join(compose, '.env'), 'SHOULD_NOT_OVERWRITE=true\n');
  await writeFile(join(compose, 'odoo/custom/src/private/odoo_sample_module/keep.py'), 'print("template")\n');
  await writeFile(join(skills, 'skills/odoo-oca/SKILL.md'), '---\nname: refreshed-odoo-oca\n---\n');

  return { compose, skills };
}

function fakeCloneGit(fixtures: Record<string, string>, cloneCalls: string[][]): GitRunner {
  return {
    async run(_cwd, args) {
      cloneCalls.push(args);
      if (args[0] !== 'clone') {
        return { stdout: '', stderr: '' };
      }

      const source = args.at(-2);
      const destination = args.at(-1);
      if (!source || !destination || !fixtures[source]) {
        throw new Error(`Unexpected clone source: ${source ?? '<missing>'}`);
      }

      await cp(fixtures[source], destination, { recursive: true });
      return { stdout: '', stderr: '' };
    },
  };
}

describe('safe reset', () => {
  it('explains what safe reset will and will not touch', () => {
    expect(renderSafeResetPreview('/tmp/odoo_sample_module_dev', true)).toBe(
      [
        'Safe reset will refresh generated WPMoo environment files.',
        '',
        'Target:',
        '/tmp/odoo_sample_module_dev',
        '',
        'Will update:',
        '- .wpmoo/odoo.json',
        '- moo',
        '- .gitignore',
        '- .env.example',
        '- README.md',
        '- AGENTS.md',
        '- docs/appstore-release.md',
        '- External compose template assets',
        '- External agent skill assets when configured',
        '',
        'Will not touch:',
        '- source repo folders under odoo/custom/src/private',
        '- module source code',
        '- Git history, remotes, or branches',
        '',
        'Generated changes will be staged with git add .',
      ].join('\n'),
    );
  });

  it('refreshes generated overlay files without deleting module code', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-fixtures-')));
    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module');

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(modulePath, { recursive: true });
    await writeFile(join(modulePath, 'keep.py'), 'print("keep")\n', 'utf8');
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/addons.yaml'), 'private/odoo_sample_module:\n  - odoo_sample_module\n');
    await writeFile(join(target, 'odoo/custom/src/repos.yaml'), 'odoo:\n');
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/odoo',
          version: '0.8.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
              url: 'https://github.com/example-org/odoo_sample_module.git',
              path: 'odoo_sample_module',
              addons: ['odoo_sample_module'],
            },
          ],
          engine: 'compose',
          composeTemplateUrl: fixtures.compose,
        },
        null,
        2,
      ),
      'utf8',
    );

    await safeResetEnvironment({
      target,
      stage: false,
    });

    await expect(readFile(join(modulePath, 'keep.py'), 'utf8')).resolves.toBe('print("keep")\n');
    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      'Odoo Sample Module Development Environment',
    );
    expect((await stat(join(target, 'moo'))).mode & 0o111).not.toBe(0);
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/odoo_sample_module:',
    );
  });

  it('uses current addons.yaml module lists when metadata is stale', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-stale-metadata-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-stale-fixtures-')));

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/odoo',
          version: '0.7.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
              url: 'https://github.com/example-org/odoo_sample_module.git',
              path: 'odoo_sample_module',
              addons: ['odoo_sample_module_base'],
            },
          ],
          composeTemplateUrl: fixtures.compose,
        },
        null,
        2,
      ),
    );
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/odoo_sample_module:\n  - odoo_sample_module_base\n  - odoo_sample_module_extra\n',
    );

    await safeResetEnvironment({
      target,
      stage: false,
    });

    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      '├── odoo_sample_module_extra/',
    );
  });

  it('refreshes external assets from metadata and regenerates compose env example safely', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-external-root-'));
    const target = join(root, 'odoo_sample_module_dev');
    const fixtures = await writeStandaloneResourceFixtures(join(root, 'fixtures'));
    const composeUrl = 'gh:example-org/odoo-docker-compose';
    const skillsUrl = 'gh:example-org/odoo-skills';
    const cloneCalls: string[][] = [];
    const git = fakeCloneGit(
      {
        'https://github.com/example-org/odoo-docker-compose.git': fixtures.compose,
        'https://github.com/example-org/odoo-skills.git': fixtures.skills,
      },
      cloneCalls,
    );

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await mkdir(join(target, '.agents/skills/odoo-oca'), { recursive: true });
    await mkdir(join(target, 'docs'), { recursive: true });
    await writeFile(join(target, '.env'), 'LOCAL_SECRET=keep\n', 'utf8');
    await writeFile(join(target, '.env.example'), 'STALE_ENV=true\n', 'utf8');
    await writeFile(join(target, 'docker-compose_18.0.yml'), 'stale compose\n', 'utf8');
    await writeFile(join(target, 'docs/compose.md'), 'stale docs\n', 'utf8');
    await writeFile(join(target, '.agents/skills/odoo-oca/SKILL.md'), 'stale skill\n', 'utf8');
    await writeFile(join(target, 'odoo/custom/src/private/odoo_sample_module/keep.py'), 'print("keep")\n', 'utf8');
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/odoo_sample_module:\n  - odoo_sample_module\n',
      'utf8',
    );
    await writeFile(join(target, 'odoo/custom/src/repos.yaml'), 'odoo:\n', 'utf8');
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/odoo',
          version: '0.8.0',
          product: 'odoo_sample_module',
          odooVersion: '18.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
              url: 'https://github.com/example-org/odoo_sample_module.git',
              path: 'odoo_sample_module',
              addons: ['odoo_sample_module'],
            },
          ],
          engine: 'compose',
          composeTemplateUrl: composeUrl,
          composeTemplateRef: 'compose-v2',
          agentSkillsTemplateUrl: skillsUrl,
          agentSkillsTemplateRef: 'skills-v3',
          postgresVersion: '16',
          httpPort: '18080',
          geventPort: '28080',
        },
        null,
        2,
      ),
      'utf8',
    );

    await safeResetEnvironment({ target, stage: false }, git);

    await expect(readFile(join(target, 'docker-compose_18.0.yml'), 'utf8')).resolves.toContain('refreshed-compose');
    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toContain('refreshed = true');
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.toContain('Refreshed Compose Docs');
    await expect(readFile(join(target, '.agents/skills/odoo-oca/SKILL.md'), 'utf8')).resolves.toContain(
      'refreshed-odoo-oca',
    );
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('ODOO_VERSION=18.0');
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('POSTGRES_IMAGE=postgres:16');
    await expect(readFile(join(target, '.env.example'), 'utf8')).resolves.toContain('HTTP_PORT=18080');
    await expect(readFile(join(target, '.env'), 'utf8')).resolves.toBe('LOCAL_SECRET=keep\n');
    await expect(readFile(join(target, 'odoo/custom/src/private/odoo_sample_module/keep.py'), 'utf8')).resolves.toBe(
      'print("keep")\n',
    );
    expect(cloneCalls.map((args) => args.slice(0, 5))).toEqual([
      ['clone', '--depth', '1', '--branch', 'compose-v2'],
      ['clone', '--depth', '1', '--branch', 'skills-v3'],
    ]);
  });
});
