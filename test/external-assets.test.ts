import { chmod, cp, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyExternalAsset, gitUrlFromSource, renderExternalAssetCommand } from '../src/external-assets.js';
import {
  agentSkillsTemplateOptions,
  composeTemplateOptions,
  defaultAgentSkillsTemplateUrl,
  defaultComposeTemplateUrl,
  defaultGeventPort,
  defaultHttpPort,
  defaultPostgresVersion,
  renderComposeEnvExample,
} from '../src/external-templates.js';
import type { GitRunner } from '../src/git.js';
import type { ScaffoldOptions } from '../src/types.js';

const baseOptions: ScaffoldOptions = {
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
  target: '/tmp/odoo_sample_module_dev',
  dryRun: false,
  initEmptyRepos: false,
  stage: true,
};

describe('external assets', () => {
  it('renders copy commands and normalizes shorthand git sources', () => {
    expect(gitUrlFromSource('gh:wpmoo-org/odoo-docker-compose')).toBe(
      'https://github.com/wpmoo-org/odoo-docker-compose.git',
    );
    expect(gitUrlFromSource('git:github.com/wpmoo-org/odoo-docker-compose.git')).toBe(
      'https://github.com/wpmoo-org/odoo-docker-compose.git',
    );
    expect(gitUrlFromSource('../odoo-docker-compose')).toBeUndefined();
    expect(
      renderExternalAssetCommand({
        label: 'agent-skills',
        source: 'gh:wpmoo-org/odoo-skills',
        sourceSubdir: 'skills',
        destination: '/tmp/project',
        destinationSubdir: '.agents/skills',
        ref: 'v0.1.0',
      }),
    ).toBe('copy external agent-skills: gh:wpmoo-org/odoo-skills/skills#v0.1.0 -> /tmp/project/.agents/skills');
  });

  it('copies local external assets with subdirectory mapping and exclusions', async () => {
    const source = await mkdtemp(join(tmpdir(), 'wpmoo-source-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-dest-'));

    await mkdir(join(source, 'skills/odoo-oca'), { recursive: true });
    await mkdir(join(source, 'skills/node_modules/ignored'), { recursive: true });
    await writeFile(join(source, 'skills/odoo-oca/SKILL.md'), '# Skill\n');
    await writeFile(join(source, 'skills/node_modules/ignored/file.txt'), 'ignored\n');

    await applyExternalAsset({
      label: 'agent-skills',
      source,
      sourceSubdir: 'skills',
      destination,
      destinationSubdir: '.agents/skills',
    });

    await expect(readFile(join(destination, '.agents/skills/odoo-oca/SKILL.md'), 'utf8')).resolves.toBe('# Skill\n');
    await expect(readFile(join(destination, '.agents/skills/node_modules/ignored/file.txt'), 'utf8')).rejects.toThrow();
  });

  it('chooses the first existing source subdirectory candidate before legacy fallback', async () => {
    const source = await mkdtemp(join(tmpdir(), 'wpmoo-source-candidates-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-dest-candidates-'));

    await mkdir(join(source, 'resources/generated-env/compose'), { recursive: true });
    await mkdir(join(source, 'templates'), { recursive: true });
    await writeFile(join(source, 'resources/generated-env/compose.yaml'), 'services:\n  odoo:\n');
    await writeFile(join(source, 'resources/generated-env/compose/dev.yaml'), 'services:\n  odoo-dev:\n');
    await writeFile(join(source, 'templates/docker-compose_19.0.yml'), 'legacy compose\n');
    await writeFile(join(source, 'README.md'), '# Compose README\n');

    await applyExternalAsset({
      label: 'compose',
      source,
      sourceSubdirCandidates: ['missing/generated-env', 'resources/generated-env'],
      sourceSubdir: 'templates',
      destination,
      readmeDestination: 'docs/compose.md',
    });

    await expect(readFile(join(destination, 'compose.yaml'), 'utf8')).resolves.toContain('services:');
    await expect(readFile(join(destination, 'compose/dev.yaml'), 'utf8')).resolves.toContain('odoo-dev');
    await expect(readFile(join(destination, 'docker-compose_19.0.yml'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(destination, 'docs/compose.md'), 'utf8')).resolves.toBe('# Compose README\n');
  });

  it('falls back to the legacy source subdirectory when compact candidates are absent', async () => {
    const source = await mkdtemp(join(tmpdir(), 'wpmoo-source-legacy-candidate-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-dest-legacy-candidate-'));

    await mkdir(join(source, 'templates'), { recursive: true });
    await writeFile(join(source, 'templates/docker-compose_19.0.yml'), 'legacy compose\n');

    await applyExternalAsset({
      label: 'compose',
      source,
      sourceSubdirCandidates: ['resources/generated-env'],
      sourceSubdir: 'templates',
      destination,
    });

    await expect(readFile(join(destination, 'docker-compose_19.0.yml'), 'utf8')).resolves.toBe('legacy compose\n');
  });

  it('skips explicitly excluded paths while copying local assets', async () => {
    const source = await mkdtemp(join(tmpdir(), 'wpmoo-source-explicit-exclude-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-dest-explicit-exclude-'));

    await mkdir(join(source, 'skills/include-me'), { recursive: true });
    await mkdir(join(source, 'skills/skip-me/nested'), { recursive: true });
    await writeFile(join(source, 'skills/include-me/SKILL.md'), '# Include\n');
    await writeFile(join(source, 'skills/skip-me/nested/SKILL.md'), '# Skip\n');

    await applyExternalAsset({
      label: 'agent-skills',
      source,
      sourceSubdir: 'skills',
      destination,
      destinationSubdir: '.agents/skills',
      exclude: ['skip-me'],
    });

    await expect(readFile(join(destination, '.agents/skills/include-me/SKILL.md'), 'utf8')).resolves.toBe('# Include\n');
    await expect(readFile(join(destination, '.agents/skills/skip-me/nested/SKILL.md'), 'utf8')).rejects.toThrow();
  });

  it('preserves executable mode on copied files', async () => {
    const source = await mkdtemp(join(tmpdir(), 'wpmoo-source-mode-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-dest-mode-'));

    await mkdir(join(source, 'scripts'), { recursive: true });
    await writeFile(join(source, 'scripts/tool.sh'), '#!/usr/bin/env bash\necho tool\n');
    await chmod(join(source, 'scripts/tool.sh'), 0o755);

    await applyExternalAsset({
      label: 'compose',
      source,
      sourceSubdir: 'scripts',
      destination,
      destinationSubdir: 'scripts',
    });

    expect((await stat(join(destination, 'scripts/tool.sh'))).mode & 0o111).not.toBe(0);
  });

  it('handles gh: sources with ref by cloning resolved GitHub URL and branch', async () => {
    const sourceFixture = await mkdtemp(join(tmpdir(), 'wpmoo-gh-source-fixture-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-gh-destination-'));
    const cloneCalls: string[][] = [];
    const git: GitRunner = {
      async run(cwd, args) {
        cloneCalls.push(args);
        if (args[0] !== 'clone') {
          return { stdout: '', stderr: '' };
        }

        const cloneTarget = args.at(-1);
        if (!cloneTarget) {
          throw new Error('Missing clone target');
        }

        await cp(sourceFixture, cloneTarget, { recursive: true });
        return { stdout: cwd, stderr: '' };
      },
    };

    await mkdir(join(sourceFixture, 'skills/odoo-oca'), { recursive: true });
    await writeFile(join(sourceFixture, 'skills/odoo-oca/SKILL.md'), '# GH Skill\n');

    await applyExternalAsset(
      {
        label: 'agent-skills',
        source: 'gh:example-org/odoo-skills',
        ref: 'v1.2.3',
        sourceSubdir: 'skills',
        destination,
        destinationSubdir: '.agents/skills',
      },
      git,
    );

    await expect(readFile(join(destination, '.agents/skills/odoo-oca/SKILL.md'), 'utf8')).resolves.toBe('# GH Skill\n');
    expect(cloneCalls).toHaveLength(1);
    expect(cloneCalls[0]).toEqual([
      'clone',
      '--depth',
      '1',
      '--branch',
      'v1.2.3',
      'https://github.com/example-org/odoo-skills.git',
      expect.any(String),
    ]);
  });

  it('expands ~/ paths for local sources and copies README to configured destination', async () => {
    const home = await mkdtemp(join(tmpdir(), 'wpmoo-home-'));
    const source = join(home, 'external-assets/source');
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-dest-home-'));
    const originalHome = process.env.HOME;

    await mkdir(join(source, 'templates'), { recursive: true });
    await writeFile(join(source, 'templates/docker-compose.yml'), 'services:\n  odoo:\n');
    await writeFile(join(source, 'README.md'), '# Compose Template\n');

    process.env.HOME = home;
    try {
      await applyExternalAsset({
        label: 'compose',
        source: '~/external-assets/source',
        sourceSubdir: 'templates',
        destination,
        readmeDestination: 'docs/compose.md',
      });
    } finally {
      process.env.HOME = originalHome;
    }

    await expect(readFile(join(destination, 'docker-compose.yml'), 'utf8')).resolves.toContain('services:');
    await expect(readFile(join(destination, 'docs/compose.md'), 'utf8')).resolves.toBe('# Compose Template\n');
  });

  it('throws when the selected local source subdirectory is missing', async () => {
    const source = await mkdtemp(join(tmpdir(), 'wpmoo-source-missing-subdir-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-dest-missing-subdir-'));

    await expect(
      applyExternalAsset({
        label: 'agent-skills',
        source,
        sourceSubdir: 'skills',
        destination,
      }),
    ).rejects.toThrow(`External asset source path does not exist: ${join(source, 'skills')}`);
  });

  it('falls back to a full clone and explicit checkout when shallow branch clone fails', async () => {
    const sourceFixture = await mkdtemp(join(tmpdir(), 'wpmoo-gh-fallback-source-'));
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-gh-fallback-destination-'));
    const calls: string[][] = [];
    const git: GitRunner = {
      async run(_cwd, args) {
        calls.push(args);
        if (args[0] === 'clone' && args.includes('--depth') && args.includes('--branch')) {
          throw new Error('unknown revision');
        }
        if (args[0] === 'clone') {
          const cloneTarget = args.at(-1);
          if (!cloneTarget) throw new Error('Missing clone target');
          await cp(sourceFixture, cloneTarget, { recursive: true });
        }
        return { stdout: '', stderr: '' };
      },
    };

    await mkdir(join(sourceFixture, 'skills/odoo-oca'), { recursive: true });
    await writeFile(join(sourceFixture, 'skills/odoo-oca/SKILL.md'), '# Fallback Skill\n');

    await applyExternalAsset(
      {
        label: 'agent-skills',
        source: 'gh:example-org/odoo-skills',
        ref: 'v9.9.9',
        sourceSubdir: 'skills',
        destination,
        destinationSubdir: '.agents/skills',
      },
      git,
    );

    await expect(readFile(join(destination, '.agents/skills/odoo-oca/SKILL.md'), 'utf8')).resolves.toBe(
      '# Fallback Skill\n',
    );
    expect(calls).toEqual([
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        'v9.9.9',
        'https://github.com/example-org/odoo-skills.git',
        expect.any(String),
      ],
      ['clone', 'https://github.com/example-org/odoo-skills.git', expect.any(String)],
      ['checkout', 'v9.9.9'],
    ]);
  });

  it('propagates git clone errors when no ref is provided', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'wpmoo-gh-clone-fail-destination-'));
    const git: GitRunner = {
      async run() {
        throw new Error('clone failed');
      },
    };

    await expect(
      applyExternalAsset(
        {
          label: 'compose',
          source: 'gh:example-org/odoo-docker-compose',
          destination,
        },
        git,
      ),
    ).rejects.toThrow('clone failed');
  });

  it('plans the compose asset by default', () => {
    const templateOptions = composeTemplateOptions(baseOptions);

    expect(templateOptions?.source).toBe(defaultComposeTemplateUrl);
    expect(templateOptions?.destination).toBe('/tmp/odoo_sample_module_dev');
    expect(templateOptions?.sourceSubdirCandidates).toEqual(['resources/generated-env']);
    expect(templateOptions?.exclude).toContain('README.md');
    expect(templateOptions?.exclude).toContain('.github');
    expect(templateOptions?.exclude).toContain('docs/assets');
    expect(templateOptions?.exclude).toContain('test');
    expect(templateOptions?.readmeDestination).toBe('docs/compose.md');
  });

  it('plans the agent skills asset when explicitly configured', () => {
    expect(agentSkillsTemplateOptions(baseOptions)).toBeUndefined();

    const templateOptions = agentSkillsTemplateOptions({
      ...baseOptions,
      agentSkillsTemplateUrl: defaultAgentSkillsTemplateUrl,
      agentSkillsTemplateRef: 'v0.1.0',
    });

    expect(templateOptions?.source).toBe(defaultAgentSkillsTemplateUrl);
    expect(templateOptions?.ref).toBe('v0.1.0');
    expect(templateOptions?.sourceSubdir).toBe('skills');
    expect(templateOptions?.destinationSubdir).toBe('.agents/skills');
  });

  it('derives sensible compose defaults from Odoo versions', () => {
    expect(defaultPostgresVersion('19.0')).toBe('18');
    expect(defaultPostgresVersion('18.0')).toBe('17');
    expect(defaultHttpPort('18.0')).toBe('10018');
    expect(defaultGeventPort('18.0')).toBe('20018');
    expect(renderComposeEnvExample({ ...baseOptions, odooVersion: '18.0' })).toContain('ODOO_VERSION=18.0');
  });
});
