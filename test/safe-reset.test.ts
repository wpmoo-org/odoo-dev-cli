import { execSync } from 'node:child_process';
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
  await mkdir(join(compose, 'compose'), { recursive: true });
  await mkdir(join(skills, 'skills/odoo-oca'), { recursive: true });
  await writeFile(join(compose, 'compose.yaml'), 'name: base-compose\n', 'utf8');
  await writeFile(join(compose, 'compose/dev.yaml'), 'name: base-compose-dev\n', 'utf8');
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
  it('explains what safe reset will change and not touch', () => {
    const preview = renderSafeResetPreview('/tmp/odoo_sample_module_dev', true);
    expect(preview).toContain('Safe reset preview (dry-run): generated WPMoo files and source repo protections are listed.');
    expect(preview).toContain('Generated files that would change:');
    expect(preview).toContain('- README.md');
    expect(preview).toContain('Source repositories that will remain untouched:');
    expect(preview).toContain('- (none detected)');
    expect(preview).toContain('- .env.example');
    expect(preview).toContain('Preview-only output; files are not changed until reset is executed.');
    expect(preview).toContain('Generated changes will be staged with git add .');
    expect(preview).not.toContain('Warning:');
  });

  it('shows non-staging preview copy when stage=false', () => {
    expect(renderSafeResetPreview('/tmp/odoo_sample_module_dev', false)).toContain(
      'Generated changes will not be staged.',
    );
  });

  it('reports which generated files would change and which source repos are untouched', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-preview-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/main:\n  - sample_module\n  - sample_module_extra\n',
      'utf8',
    );
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.8.0',
          product: 'target_product',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
              sourceType: 'private',
              path: 'main',
              url: 'https://github.com/example-org/main.git',
              addons: ['sample_module'],
            },
            {
              sourceType: 'external',
              path: 'library',
              url: 'https://github.com/example-org/library.git',
              addons: ['library_addon'],
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(join(target, 'README.md'), 'stale-readme\n', 'utf8');

    const preview = renderSafeResetPreview(target, true);
    expect(preview).toContain('Generated files that would change:');
    expect(preview).toContain('- README.md');
    expect(preview).toContain('Source repositories that will remain untouched:');
    expect(preview).toContain('- external/library');
    expect(preview).toContain('- private/main');
    expect(preview).toContain('Generated changes will be staged with git add .');
  });

  it('warns when generated files are dirty and would be overwritten', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-dirty-'));
    execSync(`git -C ${target} init -q`);
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.8.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(join(target, '.env.example'), 'STALE_ENV=true\n', 'utf8');

    const preview = renderSafeResetPreview(target, false);
    expect(preview).toContain('Warning: the following generated files are dirty and may be overwritten by safe reset:');
    expect(preview).toContain('- .env.example');
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
          tool: '@wpmoo/toolkit',
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

  it('does not stage files when safe reset runs with stage=false', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-no-stage-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-no-stage-fixtures-')));
    const gitCalls: string[][] = [];
    const git: GitRunner = {
      async run(_cwd, args) {
        gitCalls.push(args);
        return { stdout: '', stderr: '' };
      },
    };

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
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

    await safeResetEnvironment({ target, stage: false }, git);

    expect(gitCalls.some((args) => args[0] === 'add' && args[1] === '.')).toBe(false);
  });

  it('uses current addons.yaml module lists when metadata is stale', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-stale-metadata-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-stale-fixtures-')));

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
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
    await mkdir(join(target, 'data'), { recursive: true });
    await mkdir(join(target, 'backups'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/oca'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/external'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/patches'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(join(target, 'compose.yaml'), 'stale compose\n', 'utf8');
    await mkdir(join(target, 'compose'), { recursive: true });
    await writeFile(join(target, 'compose/dev.yaml'), 'stale compose dev\n', 'utf8');
    await writeFile(join(target, '.gitmodules'), '[submodule "keep"]\n\tpath = odoo/custom/src/private/keep\n\turl = https://example.com/keep.git\n', 'utf8');
    await writeFile(join(target, 'data/keep.txt'), 'KEEP_DATA\n', 'utf8');
    await writeFile(join(target, 'backups/keep.txt'), 'KEEP_BACKUP\n', 'utf8');
    await writeFile(join(target, 'odoo/custom/src/oca/README.md'), 'local oca readme\n', 'utf8');
    await writeFile(join(target, 'odoo/custom/src/external/README.md'), 'local external readme\n', 'utf8');
    await writeFile(join(target, 'odoo/custom/patches/keep.patch'), 'local patch\n', 'utf8');
    await writeFile(join(target, 'odoo/custom/manifests/keep.txt'), 'local manifest\n', 'utf8');
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
          tool: '@wpmoo/toolkit',
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
          refreshMetadataMarker: 'preserve this',
        },
        null,
        2,
      ),
      'utf8',
    );

    await safeResetEnvironment({ target, stage: false }, git);

    await expect(readFile(join(target, 'docker-compose_18.0.yml'), 'utf8')).resolves.toContain('refreshed-compose');
    await expect(readFile(join(target, 'compose.yaml'), 'utf8')).resolves.toBe('name: base-compose\n');
    await expect(readFile(join(target, 'compose/dev.yaml'), 'utf8')).resolves.toBe('name: base-compose-dev\n');
    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.toContain('https://example.com/keep.git');
    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toContain('refreshed = true');
    await expect(readFile(join(target, 'docs/compose.md'), 'utf8')).resolves.toContain('Refreshed Compose Docs');
    await expect(readFile(join(target, '.agents/skills/odoo-oca/SKILL.md'), 'utf8')).resolves.toContain(
      'refreshed-odoo-oca',
    );
    await expect(readFile(join(target, 'data/keep.txt'), 'utf8')).resolves.toBe('KEEP_DATA\n');
    await expect(readFile(join(target, 'backups/keep.txt'), 'utf8')).resolves.toBe('KEEP_BACKUP\n');
    await expect(readFile(join(target, 'odoo/custom/src/oca/README.md'), 'utf8')).resolves.toBe('local oca readme\n');
    await expect(readFile(join(target, 'odoo/custom/src/external/README.md'), 'utf8')).resolves.toBe(
      'local external readme\n',
    );
    await expect(readFile(join(target, 'odoo/custom/patches/keep.patch'), 'utf8')).resolves.toBe('local patch\n');
    await expect(readFile(join(target, 'odoo/custom/manifests/keep.txt'), 'utf8')).resolves.toBe('local manifest\n');

    const metadata = JSON.parse(await readFile(join(target, '.wpmoo/odoo.json'), 'utf8')) as { refreshMetadataMarker?: string };
    expect(metadata.refreshMetadataMarker).toBe('preserve this');
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

  it('infers repo URLs from .gitmodules when metadata omits source repo URLs', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-gitmodules-url-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-gitmodules-fixtures-')));
    const inferredUrl = 'https://github.com/example-org/odoo_sample_module.git';

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/private/odoo_sample_module"]',
        '  path = odoo/custom/src/private/odoo_sample_module',
        `  url = ${inferredUrl}`,
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(join(target, 'odoo/custom/src/addons.yaml'), 'private/odoo_sample_module:\n  - odoo_sample_module\n', 'utf8');
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.8.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
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

    await safeResetEnvironment({ target, stage: false });

    const regenerated = JSON.parse(await readFile(join(target, '.wpmoo/odoo.json'), 'utf8')) as {
      sourceRepos: Array<{ path: string; url: string; addons: string[] }>;
    };
    expect(regenerated.sourceRepos).toContainEqual({
      path: 'odoo_sample_module',
      sourceType: 'private',
      url: inferredUrl,
      addons: ['odoo_sample_module'],
    });
  });

  it('falls back to source path when .gitmodules is missing and metadata URL is omitted', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-gitmodules-missing-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-gitmodules-missing-fixtures-')));

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/addons.yaml'), 'private/odoo_sample_module:\n  - odoo_sample_module\n', 'utf8');
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.8.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
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

    await safeResetEnvironment({ target, stage: false });

    const regenerated = JSON.parse(await readFile(join(target, '.wpmoo/odoo.json'), 'utf8')) as {
      sourceRepos: Array<{ path: string; url: string; addons: string[] }>;
    };
    expect(regenerated.sourceRepos).toContainEqual({
      path: 'odoo_sample_module',
      sourceType: 'private',
      url: 'odoo/custom/src/private/odoo_sample_module',
      addons: ['odoo_sample_module'],
    });
  });

  it('migrates pre-category source layouts into metadata during safe reset', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-legacy-layout-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-legacy-fixtures-')));
    const legacyUrl = 'https://github.com/example-org/legacy_repo.git';
    const legacyRepo = join(target, 'odoo/custom/src/legacy_repo');
    const cloneCalls: string[][] = [];
    const git = fakeCloneGit({ [fixtures.compose]: fixtures.compose }, cloneCalls);

    await mkdir(legacyRepo, { recursive: true });
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.7.0',
          product: 'legacy_repo',
          odooVersion: '19.0',
          devRepo: 'legacy_repo_dev',
          devRepoUrl: 'https://github.com/example-org/legacy_repo_dev.git',
          sourceRepos: [],
          composeTemplateUrl: fixtures.compose,
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(join(legacyRepo, 'keep.py'), 'print("legacy keep")\n', 'utf8');
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/legacy_repo"]',
        '  path = odoo/custom/src/legacy_repo',
        `  url = ${legacyUrl}`,
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'legacy_repo:\n  - moo_test\n',
      'utf8',
    );

    await safeResetEnvironment({ target, stage: false }, git);

    await expect(readFile(join(legacyRepo, 'keep.py'), 'utf8')).resolves.toBe('print("legacy keep")\n');
    const metadata = JSON.parse(await readFile(join(target, '.wpmoo/odoo.json'), 'utf8')) as {
      sourceRepos: Array<{ path: string; sourceType: string; url: string; addons: string[] }>;
    };
    expect(metadata.sourceRepos).toContainEqual({
      path: 'legacy_repo',
      sourceType: 'private',
      url: legacyUrl,
      addons: ['moo_test'],
    });
    await expect(readFile(join(target, 'odoo/custom/manifests/sources.yaml'), 'utf8')).resolves.toContain(
      'path: "legacy_repo"',
    );
  });

  it('falls back to default product/addon names when metadata and addons entries are invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-fallback-root-'));
    const target = join(root, '_dev');
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-fallback-fixtures-')));

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/odoo_sample_module:\n  - ../invalid-addon\n',
      'utf8',
    );
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.8.0',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [{ path: '../invalid-path' }],
          engine: 'compose',
          composeTemplateUrl: fixtures.compose,
        },
        null,
        2,
      ),
      'utf8',
    );

    await safeResetEnvironment({ target, stage: false });

    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain('Odoo Sample Module Development Environment');
    const regenerated = JSON.parse(await readFile(join(target, '.wpmoo/odoo.json'), 'utf8')) as {
      product: string;
      sourceRepos: Array<{ path: string; addons: string[] }>;
    };
    expect(regenerated.product).toBe('odoo_sample_module');
    expect(regenerated.sourceRepos).toContainEqual({
      path: 'odoo_sample_module',
      sourceType: 'private',
      url: 'odoo/custom/src/private/odoo_sample_module',
      addons: ['odoo_sample_module'],
    });
  });

  it('preserves addons.yaml and stages generated files when stage=true', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-stage-'));
    const fixtures = await writeStandaloneResourceFixtures(await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-stage-fixtures-')));
    const gitCalls: string[][] = [];
    const git: GitRunner = {
      async run(_cwd, args) {
        gitCalls.push(args);
        return { stdout: '', stderr: '' };
      },
    };

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/odoo_sample_module:\n  - odoo_sample_module_custom\n',
      'utf8',
    );
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.8.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
              path: 'odoo_sample_module',
              addons: ['odoo_sample_module_custom'],
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

    await safeResetEnvironment({ target, stage: true }, git);

    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toBe(
      'private/odoo_sample_module:\n  - odoo_sample_module_custom\n',
    );
    expect(gitCalls).toContainEqual(['add', '.']);
  });
});
