import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { renderHelp } from '../src/help.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const readmeText = readme.replace(/\s+/g, ' ');
const commandReference = readFileSync(new URL('../docs/command-reference.md', import.meta.url), 'utf8');
const handoff = readFileSync(new URL('../docs/handoff.md', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../docs/1-0-readiness.md', import.meta.url), 'utf8');
const commandReferenceText = commandReference.replace(/\s+/g, ' ');
const handoffText = handoff.replace(/\s+/g, ' ');
const readinessText = readiness.replace(/\s+/g, ' ');

describe('help', () => {
  it('uses WPMoo Toolkit as the visible product brand', () => {
    const output = renderHelp();

    expect(output).toContain('WPMoo Toolkit for Odoo lifecycle workflows.');
    expect(readme).toContain('# WPMoo Toolkit');
    expect(readme).toContain(
      'WPMoo Toolkit is an independent project and is not affiliated with, endorsed by, or sponsored by Odoo S.A.',
    );
  });

  it('documents the official package, short alias, and deprecated compatibility aliases', () => {
    const output = renderHelp();

    expect(output).toContain('Package aliases:');
    expect(output).toContain('npx @wpmoo/toolkit is the official package path.');
    expect(output).toContain('npx wpmoo is an optional best-effort short alias; use @wpmoo/toolkit for automation.');
    expect(output).toContain(
      'npx @wpmoo/odoo and npx @wpmoo/odoo-dev remain deprecated compatibility aliases through 1.x.',
    );
    expect(output).toContain('Removing a compatibility alias requires a future major release and prior notice.');
    expect(readme).toContain('Optional short alias: `npx wpmoo`.');
    expect(readmeText).toContain('Use `npx @wpmoo/toolkit` for documentation, scripts, and automation.');
    expect(readmeText).toContain(
      'Deprecated package paths `npx @wpmoo/odoo` and `npx @wpmoo/odoo-dev` remain available through the 1.x line as compatibility aliases',
    );
    expect(commandReferenceText).toContain('Deprecated compatibility aliases remain available through the 1.x line.');
    expect(readiness).toContain('Compatibility aliases remain available through the 1.x line.');
  });

  it('documents the 1.0 JSON compatibility policy', () => {
    const output = renderHelp();

    expect(output).toContain('JSON compatibility policy:');
    expect(output).toContain('Automation should ignore unknown fields.');
    expect(output).toContain('Minor and patch releases may add optional fields.');
    expect(output).toContain('Removing, renaming, or changing the meaning of a documented field requires a major release or schemaVersion bump.');
    expect(commandReference).toContain('Automation should ignore unknown JSON fields.');
    expect(commandReference).toContain('Minor and patch releases may add optional fields without a breaking release.');
    expect(readinessText).toContain('Post-1.0 JSON contracts allow additive optional fields in minor and patch releases.');
    expect(readiness).toContain('Breaking JSON changes require a major release or a schemaVersion bump.');
  });

  it('documents closed 1.0 release, approval, and generated-file policy decisions', () => {
    expect(readiness).not.toContain('Remaining decision');
    expect(readinessText).toContain('Generated environments created by pre-1.0 releases are supported through safe reset and doctor-guided generated-file migration checks.');
    expect(readiness).toContain('Environment-variable approvals remain supported through 1.x.');
    expect(readinessText).toContain('`.wpmoo/approvals.jsonl` adds time-bounded local approvals as an additive safety layer, not as a replacement for env flags in 1.x.');
    expect(readinessText).toContain('`.wpmoo/approvals.jsonl` is additive and local-only.');
    expect(readinessText).toContain('Generated-environment acceptance smoke is mandatory for a 1.0.0 release candidate.');
    expect(handoffText).toContain('For a 1.0.0 tag, run generated-environment acceptance smoke with WPMOO_SMOKE_ENVIRONMENT=1.');
    expect(readmeText).toContain('For `1.0.0`, generated-environment acceptance smoke is required before the release is considered final.');
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
    expect(output).toContain('doctor --postgres: adds read-only PostgreSQL diagnostics');
    expect(output).toContain('Incomplete or malformed PostgreSQL metric rows are reported as unavailable diagnostics');
    expect(output).toContain('sessions currently running queries');
    expect(output).toContain("pg_stat_activity.state = 'active'");
    expect(output).toContain('connection utilization against max_connections');
    expect(output).toContain('May check Docker CLI access and GitHub workflows.');
  });

  it('documents the interactive cockpit', () => {
    const output = renderHelp();

    expect(output).toContain('Cockpit:');
    expect(output).toContain('Run npx @wpmoo/toolkit inside a generated environment to open the cockpit.');
    expect(output).toContain('Use Command palette / to search slash commands such as /test, /modules');
    expect(output).toContain('Large module lists switch to searchable selection by module, repo, or source type.');
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

  it('documents protected lifecycle command guards', () => {
    const output = renderHelp();

    expect(output).toContain('Lifecycle command guards:');
    expect(output).toContain('In WPMOO_ENV=stage, install/update/stop/restart require WPMOO_ALLOW_STAGE_LIFECYCLE=1.');
    expect(output).toContain('In WPMOO_ENV=prod, install/update/test/stop/restart require WPMOO_ALLOW_PROD_LIFECYCLE=1.');
    expect(output).toContain('resetdb and real restore-snapshot require WPMOO_ALLOW_DESTRUCTIVE=1 in stage/prod.');
    expect(output).toContain('restore-snapshot --dry-run remains allowed for preview.');
    expect(output).toContain('Time-bounded local approvals may also be recorded in .wpmoo/approvals.jsonl.');
    expect(readme).toContain(
      'In `WPMOO_ENV=stage`, `install`, `update`, `stop`, and `restart` require `WPMOO_ALLOW_STAGE_LIFECYCLE=1`.',
    );
    expect(readme).toContain(
      'In `WPMOO_ENV=prod`, `install`, `update`, `test`, `stop`, and `restart` require `WPMOO_ALLOW_PROD_LIFECYCLE=1`.',
    );
    expect(readme).toContain('`restore-snapshot --dry-run` remains allowed for preview.');
    expect(readme).toContain('For short-lived local approvals, add JSONL entries to `.wpmoo/approvals.jsonl`');
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

  it('documents add-module skeleton files and module name rules', () => {
    const output = renderHelp();

    expect(output).toContain(
      'Creates a minimal skeleton: __init__.py, __manifest__.py, models/<module>.py, models/__init__.py, security/ir.model.access.csv, views/<module>_views.xml, views/<module>_menus.xml, and tests/test_<module>.py.',
    );
    expect(output).toContain(
      'The view XML adds list/tree and form views; the menu XML adds a basic Odoo action and internal-user menu entry; the test skeleton adds a post-install TransactionCase smoke test.',
    );
    expect(output).toContain(
      'WPMoo reports scaffold quality after generation and status reports installable modules, non-installable modules, and modules without actionable menus.',
    );
    expect(output).toContain('Module names must be lower snake_case; use letters, numbers, and underscores only.');
    expect(output).toContain('Must be lower snake_case; use letters, numbers, and underscores only.');
    expect(readme).toContain('`add-module` creates a minimal Odoo module skeleton');
    expect(readme).toContain('`__init__.py`');
    expect(readme).toContain('`__manifest__.py`');
    expect(readme).toContain('`models/<module>.py`');
    expect(readme).toContain('`models/__init__.py`');
    expect(readme).toContain('`security/ir.model.access.csv`');
    expect(readme).toContain('`views/<module>_views.xml`');
    expect(readme).toContain('`views/<module>_menus.xml`');
    expect(readme).toContain('`tests/test_<module>.py`');
    expect(readme).toContain(
      'The view XML adds list/tree and form views; the menu XML adds a basic Odoo action and internal-user menu entry; the test skeleton adds a post-install TransactionCase smoke test.',
    );
    expect(readme).toContain('WPMoo reports scaffold quality after generation');
    expect(readme).toContain('Module names must be lower `snake_case`; use letters, numbers, and underscores only.');
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
    expect(output).toContain('npx @wpmoo/toolkit doctor --json [--postgres]');
    expect(output).toContain('doctor --json --postgres includes a structured postgres object for automation.');
    expect(output).toContain('doctor --json is read-only; run doctor --fix first, then doctor --json for post-fix state.');
    expect(readme).toContain('`doctor --json --fix` is intentionally unsupported');
    expect(commandReference).toContain('Run `doctor --fix` first, then `doctor --json`');
    expect(commandReference).toContain('post-fix state.');
    expect(readme).toContain('Incomplete or malformed PostgreSQL metric rows are reported as unavailable diagnostics');
    expect(readme).toContain('Optional PostgreSQL probe permission failures appear under');
    expect(readme).toContain('`postgres.optionalProbeFailures`');
    expect(commandReference).toContain('`postgres.optionalProbeFailures`');
    expect(readme).toContain('sessions currently running queries');
    expect(readme).toContain("`pg_stat_activity.state = 'active'`");
    expect(readme).toContain('connection utilization against');
    expect(readme).toContain('`max_connections`');
    expect(output).toContain('--postgres');
    expect(output).toContain('Include read-only PostgreSQL health/performance diagnostics in doctor.');
    expect(readme).toContain('`doctor --json --postgres` includes a structured `postgres` object for automation.');
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
    expect(output).toContain('Before setup starts, WPMoo checks Git, Docker, Docker Compose, and Docker Engine.');
    expect(output).toContain('If required tools are missing, WPMoo offers installer guidance before writing files.');
    expect(output).toContain('Choose any environment folder; the default is ./<product>_dev.');
    expect(output).toContain('Skip Git/GitHub connection to create a local-only environment.');
    expect(output).toContain('Add source repos later from the cockpit or with add-repo.');
  });

  it('documents optional GitHub setup in the README quick start', () => {
    expect(readme).toContain('GitHub CLI (`gh`) is optional.');
    expect(readme).toContain('Before environment setup starts, WPMoo checks Git, Docker, Docker Compose, and the Docker Engine.');
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
    expect(readmeText).toContain('npx @wpmoo/toolkit doctor --json --postgres');
    expect(readmeText).toContain('doctor --postgres');
    expect(readmeText).toContain('JSON output is optional; human-readable output remains the default.');
  });
});
