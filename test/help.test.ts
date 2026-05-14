import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { renderHelp } from '../src/help.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const readmeText = readme.replace(/\s+/g, ' ');

describe('help', () => {
  it('includes status in usage', () => {
    const output = renderHelp();

    expect(output).toContain('npx @wpmoo/odoo status');
  });

  it('documents the status and doctor split', () => {
    const output = renderHelp();

    expect(output).toContain('Status and doctor:');
    expect(output).toContain('status: fast and offline.');
    expect(output).toContain('doctor: deeper health check.');
    expect(output).toContain('May check Docker CLI access and GitHub workflows.');
  });

  it('documents the interactive cockpit', () => {
    const output = renderHelp();

    expect(output).toContain('Cockpit:');
    expect(output).toContain('Run npx @wpmoo/odoo inside a generated environment to open the cockpit.');
    expect(output).toContain('Use Command palette / to search slash commands');
    expect(output).toContain('Direct commands such as npx @wpmoo/odoo status');
  });

  it('includes task-oriented recipes', () => {
    const output = renderHelp();

    expect(output).toContain('Task recipes:');
    expect(output).toContain('Create environment:');
    expect(output).toContain('Add source repo:');
    expect(output).toContain('Add module:');
    expect(output).toContain('Run tests:');
    expect(output).toContain('Safe reset and recover:');
    expect(output).toContain('Daily command checks:');
  });

  it('documents local-only wizard setup and custom environment folder support', () => {
    const output = renderHelp();

    expect(output).toContain('Wizard local-only path:');
    expect(output).toContain('Choose any environment folder; the default is ./<product>_dev.');
    expect(output).toContain('Skip Git/GitHub connection to create a local-only environment.');
    expect(output).toContain('Add source repos later from the cockpit or with add-repo.');
  });

  it('documents optional GitHub setup in the README quick start', () => {
    expect(readme).toContain('GitHub CLI (`gh`) is optional.');
    expect(readme).toContain('Choose any environment folder; the default is `./<product>_dev`.');
    expect(readmeText).toContain('Choose local-only setup to skip Git/GitHub connection and source repo prompts.');
    expect(readmeText).toContain(
      'Add source repositories later from the cockpit (`Repositories` -> `add-repo`) or `npx @wpmoo/odoo add-repo`.',
    );
    expect(readmeText).toContain(
      'Direct `create` commands keep the existing repo URL options; use `--target <path>` to choose a custom folder.',
    );
  });
});
