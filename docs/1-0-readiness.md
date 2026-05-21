# 1.0 Readiness

This checklist tracks what must stay stable before WPMoo Toolkit can be
released as `1.0.0`.

## Stable Command Names

Ready:

- `npx @wpmoo/toolkit` is the official package entrypoint.
- Generated environments use local `./moo` for daily commands.
- Direct commands cover create, status, doctor, source, repository, module,
  service, database, snapshot, restore, lint, and POT workflows.
- Deprecated package aliases remain compatibility paths:
  `npx @wpmoo/odoo` and `npx @wpmoo/odoo-dev`.

Remaining decision:

- Whether the optional unscoped `npx wpmoo` short alias should be promoted,
  kept best-effort, or removed from public examples before `1.0.0`.

## Stable JSON Contracts

Ready:

- `status --json` uses `schemaVersion: 1`.
- `source list --json` and `source sync --json` use `schemaVersion: 1`.
- `doctor --json` uses `schemaVersion: 1`.
- `doctor --json --postgres` exposes a versioned `postgres` payload with
  `contractVersion` and diagnostics `schemaVersion`.
- PostgreSQL diagnostics treat unavailable optional metrics as optional fields.

Remaining decision:

- Document a compatibility policy for future JSON schema changes, including
  whether minor additive fields are allowed without a major release.

## Deprecated Alias Policy

Ready:

- `@wpmoo/toolkit` is the supported package.
- `@wpmoo/odoo` and `@wpmoo/odoo-dev` are required compatibility artifacts in
  releases.
- The optional `wpmoo` short alias is warning-only and does not determine
  release validity.

Remaining decision:

- Set an explicit deprecation horizon for compatibility aliases after `1.0.0`,
  or commit to maintaining them indefinitely.

## Generated File Compatibility

Ready:

- Generated environments keep product source repositories under
  `odoo/custom/src/private`, `odoo/custom/src/oca`, and
  `odoo/custom/src/external`.
- `safe reset` refreshes generated files while preserving source repositories.
- PostgreSQL 18 mount compatibility is documented and doctor can apply safe
  mount-target fixes.
- Generated `./moo` delegates daily commands and keeps local guard behavior.

Remaining decision:

- Define a generated-file migration policy for environments created by older
  pre-1.0 releases.

## Stage And Production Policy

Ready:

- Stage `install` and `update` require `WPMOO_ALLOW_STAGE_LIFECYCLE=1`.
- Production `install`, `update`, and `test` require
  `WPMOO_ALLOW_PROD_LIFECYCLE=1`.
- Destructive database commands require `WPMOO_ALLOW_DESTRUCTIVE=1` in stage
  and production.
- `restore-snapshot --dry-run`, `doctor`, and `doctor --postgres` remain safe
  preview/read-only paths.
- Migration-risk lifecycle commands can require `WPMOO_ALLOW_MIGRATIONS=1`.

Remaining decision:

- Decide whether stage/prod approvals should gain a timestamped confirmation
  file or continue to rely on environment variables only.

## Release Artifact Policy

Ready:

- Required release artifacts are `@wpmoo/toolkit`, `@wpmoo/odoo`, and
  `@wpmoo/odoo-dev`.
- Publishing is handled by GitHub Actions Trusted Publishing after a `v<version>`
  tag is pushed.
- `npm run release:check` verifies package state and bumps patch versions when
  the current version already exists.
- `npm run smoke:published -- "$VERSION"` is the preferred published package
  smoke check.

Remaining decision:

- Decide whether release smoke should include a generated-environment acceptance
  run by default for `1.0.0` tags.

## Current Audit

Last updated: 2026-05-21.

Completed checks:

- Full local gate for Train 8 passed on 2026-05-21:
  `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- Coverage passed on 2026-05-21: 72 test files, 682 tests, 92.32%
  statements, 87.56% branches, 96.74% functions, and 92.32% lines.
- Published CLI smoke passed against `@wpmoo/toolkit@0.9.27` with `npm exec`
  for `wpmoo --version`, `wpmoo --help`, and `wpmoo doctor --help`.
- Placeholder review found no `TODO`, `FIXME`, `TBD`, or `coming soon`
  markers in `README.md`, `docs`, or `src`.
- Local markdown link review passed across `README.md` and `docs/*.md`.

Final gap list:

- Define JSON compatibility rules for post-1.0 additive fields.
- Decide the long-term compatibility alias policy.
- Decide generated-environment migration support for older pre-1.0 outputs.
- Decide whether stage/prod approvals need timestamped confirmation files.
- Decide whether generated-environment published smoke should be mandatory for
  `1.0.0` tags.
