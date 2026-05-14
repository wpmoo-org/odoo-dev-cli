# Generated Environment Verification

## Scope

This matrix covers disposable generated development environments only. It is for
local and CI verification of generated artifacts and command behavior. It does
not validate staging or production deployments.

## Command split

- Use `npx @wpmoo/odoo ...` for package/operator commands (`create`,
  `add-repo`, `remove-repo`, `add-module`, `remove-module`, `doctor`, `reset`).
- Use `./moo ...` inside a generated environment for daily local compose
  actions delegated to `./scripts/*.sh`.

## Verification matrix

| Area | Contract | Primary command(s) |
| --- | --- | --- |
| Scaffold files and metadata | Generated environment includes expected files and `.wpmoo/odoo.json` metadata. | `npx @wpmoo/odoo create ...` |
| Compose resource files | Required compose/version files, compose docs, and script set are present. | `npx @wpmoo/odoo create ...` |
| `./moo` delegation | `./moo` dispatches fixed daily actions to the matching script and preserves argument pass-through. | `./moo <action> ...` |
| Doctor checks | Metadata, compose files, scripts, source repo paths, and local tooling checks behave as expected. | `npx @wpmoo/odoo doctor` or `./moo doctor` |
| Source repo add/remove | Source repository registration and submodule lifecycle behave correctly. | `npx @wpmoo/odoo add-repo ...`, `npx @wpmoo/odoo remove-repo ...` |
| Module add/remove | Module registration changes are applied to the selected source repo config. | `npx @wpmoo/odoo add-module ...`, `npx @wpmoo/odoo remove-module ...` |
| Safe reset | Generated files are refreshed without deleting source module code. | `npx @wpmoo/odoo reset` |
| Snapshot/restore and lint/pot | These actions are delegated by `./moo` to compose scripts without extra package-side logic. | `./moo snapshot ...`, `./moo restore-snapshot ...`, `./moo lint`, `./moo pot ...` |

## Local verification commands

Run from the `wpmoo-odoo` repository root:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
```
