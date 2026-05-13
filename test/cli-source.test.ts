import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('CLI environment maintenance prompts', () => {
  it('does not ask for Odoo version inside environment actions', () => {
    const source = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');

    expect(source).not.toContain("message: 'Odoo version'");
  });

  it('does not ask whether to initialize empty repos inside environment add-repo', () => {
    const source = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('Initialize repository if it exists but has no commits?');
  });

  it('uses generic Odoo sample placeholders for maintenance actions', () => {
    const source = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');

    expect(source).toContain("placeholder: 'example-org'");
    expect(source).toContain("placeholder: 'odoo_sample_module_repo'");
    expect(source).toContain("return 'odoo_sample_module';");
    expect(source).not.toContain("placeholder: 'wpmoo-org'");
    expect(source).not.toContain('`${product}_pro`');
    expect(source).not.toContain('_payment');
  });

  it('previews and confirms safe reset from the environment menu', () => {
    const source = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');

    expect(source).toContain('renderSafeResetPreview(options.target, options.stage)');
    expect(source).toContain("message: menuPromptMessage('Continue with safe reset?', 'back')");
    expect(source).toContain("active: 'Yes'");
    expect(source).toContain("inactive: 'No'");
    expect(source).toContain('initialValue: false');
  });

  it('asks whether to install Odoo Agent Skills in create prompts', () => {
    const source = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');

    expect(source).toContain("message: 'Install project-local Odoo Agent Skills?'");
    expect(source).toContain('agentSkillsTemplateUrl: Boolean(installAgentSkills) ? defaultAgentSkillsTemplateUrl : undefined');
  });
});
