import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { renderHelp } from '../src/help.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const readmeText = readme.replace(/\s+/g, ' ');

describe('help', () => {
  it('uses WPMoo Toolkit as the visible product brand', () => {
    const output = renderHelp();

    expect(output).toContain('WPMoo Toolkit for Odoo lifecycle workflows.');
    expect(readme).toContain('# WPMoo Toolkit');
    expect(readme).toContain(
      'WPMoo Toolkit is an independent project and is not affiliated with, endorsed by, or sponsored by Odoo S.A.',
    );
  });

  it('documents the official package, short alias, and legacy compatibility paths', () => {
    const output = renderHelp();

    expect(output).toContain('Package aliases:');
    expect(output).toContain('npx @wpmoo/toolkit is the official package path.');
    expect(output).toContain('npx wpmoo is the short alias.');
    expect(output).toContain('npx @wpmoo/odoo and npx @wpmoo/odoo-dev remain legacy compatibility paths.');
    expect(readme).toContain('npx wpmoo');
    expect(readme).toContain('Legacy package paths `npx @wpmoo/odoo` and `npx @wpmoo/odoo-dev` remain');
  });

  it('includes status in usage', () => {
    const output = renderHelp();

    expect(output).toContain('npx @wpmoo/toolkit status');
  });

  it('documents the status and doctor split', () => {
    const output = renderHelp();

    expect(output).toContain('Status and doctor:');
    expect(output).toContain('status: fast and offline.');
    expect(output).toContain('doctor: deeper health check.');
    expect(output).toContain('doctor --fix: applies safe file-level repairs.');
    expect(output).toContain('May check Docker CLI access and GitHub workflows.');
  });

  it('documents the interactive cockpit', () => {
    const output = renderHelp();

    expect(output).toContain('Cockpit:');
    expect(output).toContain('Run npx @wpmoo/toolkit inside a generated environment to open the cockpit.');
    expect(output).toContain('Use Command palette / to search slash commands');
    expect(output).toContain('Direct commands such as npx @wpmoo/toolkit status');
  });

  it('includes task-oriented recipes', () => {
    const output = renderHelp();

    expect(output).toContain('Task recipes:');
    expect(output).toContain('Create environment:');
    expect(output).toContain('Add source repo:');
    expect(output).toContain('Add module:');
    expect(output).toContain('Run tests:');
    expect(output).toContain('Safe reset and recover:');
    expect(output).toContain('npx @wpmoo/toolkit reset --dry-run');
    expect(output).toContain('npx @wpmoo/toolkit restore-snapshot --dry-run <snapshot-name> [db]');
    expect(output).toContain('Daily command checks:');
  });

  it('documents source repo category option', () => {
    const output = renderHelp();

    expect(output).toContain('--source-type <category>');
    expect(output).toContain('private, oca, external');
    expect(output).toContain('Add source repo:');
    expect(output).toContain('--source-type oca');
    expect(output).toContain('npx @wpmoo/toolkit source list');
    expect(output).toContain('npx @wpmoo/toolkit source sync');
    expect(output).toContain('Inspect and sync source manifest:');
  });

  it('documents source-type for module actions with non-private examples', () => {
    const output = renderHelp();

    expect(output).toContain('npx @wpmoo/toolkit add-module --repo <source-repo> --module <module-name> [--source-type <category>]');
    expect(output).toContain('npx @wpmoo/toolkit remove-module --repo <source-repo> --module <module-name> [--source-type <category>]');
    expect(output).toContain('npx @wpmoo/toolkit add-module --repo <source-repo> --module <module-name> --source-type private|oca|external');
    expect(output).toContain('npx @wpmoo/toolkit remove-module --repo <source-repo> --module <module-name> --source-type private|oca|external');
    expect(output).toContain('npx @wpmoo/toolkit add-module --repo sale-workflow --module sale_order_line_no_discount --source-type oca');
    expect(output).toContain('--source-type <category>     Source repo category for add-repo/remove-repo/add-module/remove-module. One of private, oca, external. Default: private.');
  });

  it('documents JSON output options for automation and cockpit integration', () => {
    const output = renderHelp();

    expect(output).toContain('Machine-readable JSON output:');
    expect(output).toContain('--json');
    expect(output).toContain('for automation and VS Code cockpit integration');
    expect(output).toContain('default human-readable output');
    expect(output).toContain('npx @wpmoo/toolkit status --json');
    expect(output).toContain('npx @wpmoo/toolkit source list --json');
    expect(output).toContain('npx @wpmoo/toolkit source sync --json');
    expect(output).toContain('npx @wpmoo/toolkit doctor --json');
  });

  it('documents source-type defaults for module commands in README examples', () => {
    expect(readme).toContain('`private`, `oca`, or `external`');
    expect(readmeText).toContain('npx @wpmoo/toolkit add-module');
    expect(readmeText).toContain('npx @wpmoo/toolkit remove-module');
    expect(readmeText).toContain('--source-type oca');
    expect(readmeText).toContain('Default is `private`');
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
      'Add source repositories later from the cockpit (`Repositories` -> `add-repo`) or `npx @wpmoo/toolkit add-repo`.',
    );
    expect(readmeText).toContain(
      'Direct `create` commands keep the existing repo URL options; use `--target <path>` to choose a custom folder.',
    );
  });

  it('documents JSON output usage in README for automation and cockpit integration', () => {
    expect(readme).toContain('For automation and VS Code cockpit integration');
    expect(readmeText).toContain('npx @wpmoo/toolkit status --json');
    expect(readmeText).toContain('npx @wpmoo/toolkit source list --json');
    expect(readmeText).toContain('npx @wpmoo/toolkit source sync --json');
    expect(readmeText).toContain('npx @wpmoo/toolkit doctor --json');
    expect(readmeText).toContain('JSON output is optional; human-readable output remains the default.');
  });
});
