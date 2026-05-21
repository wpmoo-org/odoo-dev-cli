# 1.0 Readiness

This checklist tracks what must stay stable before WPMoo Toolkit can be
released as `1.0.0`.

## Stable Command Names

Ready:

- `npx @wpmoo/toolkit` is the official package entrypoint.
- Generated environments use local `./moo` for daily commands.
- Direct commands cover create, status, doctor, source, repository, module,
  service, database, snapshot, restore, lint, and POT workflows.
- Compatibility aliases remain available through the 1.x line:
  `npx @wpmoo/odoo` and `npx @wpmoo/odoo-dev`.
- The optional unscoped `npx wpmoo` short alias remains best-effort and
  warning-only. User-facing examples may mention it as optional, but
  documentation, scripts, and automation should use `npx @wpmoo/toolkit`.

## Stable JSON Contracts

Ready:

- `status --json` uses `schemaVersion: 1`.
- `source list --json` and `source sync --json` use `schemaVersion: 1`.
- `doctor --json` uses `schemaVersion: 1`.
- `doctor --json --postgres` exposes a versioned `postgres` payload with
  `contractVersion` and diagnostics `schemaVersion`.
- PostgreSQL diagnostics treat unavailable optional metrics as optional fields.
- Post-1.0 JSON contracts allow additive optional fields in minor and patch
  releases.
- Automation should ignore unknown JSON fields.
- Breaking JSON changes require a major release or a schemaVersion bump.

## Deprecated Alias Policy

Ready:

- `@wpmoo/toolkit` is the supported package.
- `@wpmoo/odoo` and `@wpmoo/odoo-dev` are required compatibility artifacts in
  releases.
- The optional `wpmoo` short alias is warning-only and does not determine
  release validity.
- Compatibility aliases remain available through the 1.x line.
- Removing a compatibility alias requires a future major release and prior
  notice.

## Generated File Compatibility

Ready:

- Generated environments keep product source repositories under
  `odoo/custom/src/private`, `odoo/custom/src/oca`, and
  `odoo/custom/src/external`.
- `safe reset` refreshes generated files while preserving source repositories.
- PostgreSQL 18 mount compatibility is documented and doctor can apply safe
  mount-target fixes.
- Generated `./moo` delegates daily commands and keeps local guard behavior.
- Generated environments created by pre-1.0 releases are supported through safe
  reset and doctor-guided generated-file migration checks.
- Generated-file migration support must preserve product source repositories,
  `.env` files, database dumps, and Docker volumes.

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
- Environment-variable approvals remain supported through 1.x.
- Timestamped approval files may be added as an additive safety layer, not as a
  replacement for env flags in 1.x.

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
- Generated-environment acceptance smoke is mandatory for a 1.0.0 release
  candidate.

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

Final policy decisions:

- JSON compatibility permits additive optional fields in minor and patch
  releases; breaking changes require a major release or schemaVersion bump.
- Compatibility aliases remain available through the 1.x line; removal requires
  a future major release and prior notice.
- Pre-1.0 generated environments are supported through safe reset and
  doctor-guided generated-file migration checks that preserve source code and
  local runtime data.
- Environment-variable approvals remain supported through 1.x; timestamped
  approval files may be added only as an additive safety layer.
- Generated-environment acceptance smoke is mandatory for a `1.0.0` release
  candidate.
