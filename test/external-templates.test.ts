import { describe, expect, it } from 'vitest';

import {
  agentSkillsTemplateOptions,
  composeTemplateOptions,
  defaultPostgresVersion,
  plannedExternalAssetOptions,
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

describe('external template helpers', () => {
  it('maps supported Odoo majors to postgres defaults and falls back for others', () => {
    expect(defaultPostgresVersion('17.0')).toBe('15');
    expect(defaultPostgresVersion('16.0')).toBe('14');
    expect(defaultPostgresVersion('15.0')).toBe('17');
    expect(defaultPostgresVersion('master')).toBe('17');
  });

  it('omits agent skills options when no template URL is configured', () => {
    expect(agentSkillsTemplateOptions(baseOptions)).toBeUndefined();
  });

  it('plans compose only by default and includes agent skills when configured', () => {
    const composeOptions = composeTemplateOptions(baseOptions);
    expect(composeOptions.sourceSubdirCandidates).toEqual(['resources/generated-env']);
    expect(composeOptions.readmeDestination).toBe('docs/compose.md');
    expect(composeOptions.exclude).toEqual(
      expect.arrayContaining([
        '.github',
        'docs/assets',
        'test',
        'README.md',
        'README-template.md',
        '.gitignore',
        'LICENSE',
        'package.json',
        'package-lock.json',
      ]),
    );
    expect(plannedExternalAssetOptions(baseOptions)).toEqual([composeOptions]);

    const withAgentSkills = {
      ...baseOptions,
      agentSkillsTemplateUrl: 'gh:wpmoo-org/odoo-skills',
    };
    expect(plannedExternalAssetOptions(withAgentSkills)).toHaveLength(2);
  });

  it('documents compose safety controls in the generated env example', () => {
    const envExample = renderComposeEnvExample(baseOptions);

    expect(envExample).toContain('WPMOO_ENV=dev');
    expect(envExample).toContain('WPMOO_SNAPSHOT_RETENTION_COUNT=0');
    expect(envExample).toContain('WPMOO_ALLOW_DESTRUCTIVE=1');
  });
});
