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

- Stage `install`, `update`, `stop`, and `restart` require
  `WPMOO_ALLOW_STAGE_LIFECYCLE=1`.
- Production `install`, `update`, `test`, `stop`, and `restart` require
  `WPMOO_ALLOW_PROD_LIFECYCLE=1`.
- Destructive database commands require `WPMOO_ALLOW_DESTRUCTIVE=1` in stage
  and production.
- `restore-snapshot --dry-run`, `doctor`, and `doctor --postgres` remain safe
  preview/read-only paths.
- Migration-risk lifecycle commands can require `WPMOO_ALLOW_MIGRATIONS=1`.
- Environment-variable approvals remain supported through 1.x.
- `.wpmoo/approvals.jsonl` adds time-bounded local approvals as an additive
  safety layer, not as a replacement for env flags in 1.x.

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

Last updated: 2026-05-23.

Completed checks:

- Full local gate passed on 2026-05-23 before Train 32 acceptance-smoke work:
  `npm run typecheck`, `npm test` (76 files / 760 tests), `npm run build`,
  and `git diff --check`.
- `npm run release:check` passed for the latest pre-1.0 release line and
  verified local package metadata plus `npm pack --dry-run` for
  `@wpmoo/toolkit`, `wpmoo`, `@wpmoo/odoo`, and `@wpmoo/odoo-dev`.
- Registry-backed published package smoke passed for the supported package:
  `npm run smoke:published -- "$VERSION"` with
  `WPMOO_PUBLISHED_PACKAGE_SPEC="@wpmoo/toolkit@$VERSION"`.
- The generated-environment acceptance flow remains covered by
  `test/smoke-published-script.test.ts`, including create, source list/sync,
  module add/status/remove lifecycle, safe reset preview, `doctor --fix`,
  snapshot, restore dry-run steps, and generated `./moo status --json`
  environment contract checks. It also verifies profile-aware scaffolding by
  creating a portal-profile addon and checking the generated controller and
  `website.layout` template files.
- Train 32 rehearsed the registry-backed `0.9.36` acceptance smoke and found
  that environment creation still depended on the host Docker Engine despite
  the smoke's Docker stub. The acceptance script now runs environment creation
  through the same stubbed Docker path as later generated-environment checks.
- Placeholder review found no `TODO`, `FIXME`, `TBD`, or `coming soon`
  markers in `README.md`, `docs`, or `src`.
- Local markdown link review passed across `README.md` and `docs/*.md`.

Release-candidate notes:

- Do not tag `1.0.0` until registry-backed generated-environment acceptance
  smoke passes with:
  `WPMOO_SMOKE_ENVIRONMENT=1 WPMOO_PUBLISHED_PACKAGE_SPEC="@wpmoo/toolkit@$VERSION" npm run smoke:published -- "$VERSION"`.
- After that generated-environment smoke passes, the remaining 1.0 decision is
  procedural: bump to `1.0.0`, rerun the full gate, rerun
  `npm run release:check`, tag, and verify the required scoped artifacts.

Final policy decisions:

- JSON compatibility permits additive optional fields in minor and patch
  releases; breaking changes require a major release or schemaVersion bump.
- Compatibility aliases remain available through the 1.x line; removal requires
  a future major release and prior notice.
- Pre-1.0 generated environments are supported through safe reset and
  doctor-guided generated-file migration checks that preserve source code and
  local runtime data.
- Environment-variable approvals remain supported through 1.x;
  `.wpmoo/approvals.jsonl` is additive and local-only.
- Generated-environment acceptance smoke is mandatory for a `1.0.0` release
  candidate.
