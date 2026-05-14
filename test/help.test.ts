import { describe, expect, it } from 'vitest';

import { renderHelp } from '../src/help.js';

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
});
