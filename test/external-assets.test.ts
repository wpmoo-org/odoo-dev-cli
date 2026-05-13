import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

  it('plans the compose asset by default', () => {
    const templateOptions = composeTemplateOptions(baseOptions);

    expect(templateOptions?.source).toBe(defaultComposeTemplateUrl);
    expect(templateOptions?.destination).toBe('/tmp/odoo_sample_module_dev');
    expect(templateOptions?.exclude).toContain('README.md');
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
