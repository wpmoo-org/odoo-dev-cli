# Generated Environment Verification

## Scope

This matrix covers disposable generated development environments only. It is for
local and CI verification of generated artifacts and command behavior. It does
not validate staging or production deployments.

## Command split

- Use `npx @wpmoo/toolkit ...` for package/operator commands (`create`,
  `add-repo`, `remove-repo`, `add-module`, `remove-module`, `doctor`, `reset`).
- Use `./moo ...` inside a generated environment for daily local compose
  actions delegated to `./scripts/*.sh`.

## Verification matrix

| Area | Contract | Primary command(s) |
| --- | --- | --- |
| Scaffold files and metadata | Generated environment includes expected files and `.wpmoo/odoo.json` metadata. | `npx @wpmoo/toolkit create ...` |
| Compose resource files | Compact compose layout is present (`compose.yaml` + environment overlays under `compose/`), plus config/resources/scripts. | `npx @wpmoo/toolkit create ...` |
| `./moo` delegation | `./moo` dispatches fixed daily actions to the matching script and preserves argument pass-through. | `./moo <action> ...` |
| Doctor checks | Metadata, compose files, scripts, source repo paths, and local tooling checks behave as expected. | `npx @wpmoo/toolkit doctor` or `./moo doctor` |
| Doctor safe fixes | Safe file-level fixes are applied only with `--fix`, then doctor runs again and reports any remaining manual issues. | `npx @wpmoo/toolkit doctor --fix` |
| Generated Postgres checks | For PostgreSQL 18 environments, doctor validates db mount targets avoid old PG image-specific paths and can normalize safe targets with `--fix`. | `npx @wpmoo/toolkit doctor`, `npx @wpmoo/toolkit doctor --fix` |
| PostgreSQL diagnostics | Optional read-only, advisory-only database health and performance diagnostics (no automatic tuning), covering active/idle-in-transaction sessions, table health signals, WAL/capacity context, unused-index hints, and slow-query readiness. JSON mode emits a versioned PostgreSQL contract with optional fields when a metric is unavailable. | `npx @wpmoo/toolkit doctor --postgres`, `npx @wpmoo/toolkit doctor --json --postgres` |
| Source repo add/remove | Source repository registration and submodule lifecycle behave correctly. | `npx @wpmoo/toolkit add-repo ...`, `npx @wpmoo/toolkit remove-repo ...` |
| Source manifest sync | Source repo metadata, `.gitmodules`, and `odoo/custom/manifests/sources.yaml` stay aligned. | `npx @wpmoo/toolkit source list`, `npx @wpmoo/toolkit source sync` |
| Module add/remove | Module skeleton files include manifest, model, access CSV, explicit view XML, action/menu XML, post-install test scaffold, and selected source repo registration. Existing scaffold files are not overwritten. | `npx @wpmoo/toolkit add-module ...`, `npx @wpmoo/toolkit remove-module ...` |
| Safe reset | Generated files are refreshed (including `compose.yaml` overlays and env example) without deleting source module code. Local runtime/data directories and custom source layout content are preserved; legacy user-editable paths from older templates may remain and are reported for manual cleanup. | `npx @wpmoo/toolkit reset --dry-run`, `npx @wpmoo/toolkit reset` |
| Snapshot/restore and lint/pot | These actions are delegated by `./moo` to compose scripts. Restore preview, snapshot retention, and stage/prod destructive guards are preserved by the package argument layer. | `./moo snapshot ...`, `./moo restore-snapshot --dry-run ...`, `./moo restore-snapshot ...`, `./moo lint`, `./moo pot ...` |

## Compact compose checks

Verify the generated environment includes at least:

```text
compose.yaml
compose/dev.yaml
compose/stage.yaml
compose/prod.yaml
config/odoo/odoo.conf
resources/odoo/entrypoint.sh
```

Default local development uses `compose.yaml` plus `compose/dev.yaml`.
`WPMOO_ENV=stage` or `WPMOO_ENV=prod` must only be used after production-grade
secrets and volumes are configured.

When `WPMOO_ENV=stage` or `WPMOO_ENV=prod`, WPMoo refuses destructive database
actions such as `resetdb` and real `restore-snapshot` before dispatching local
scripts unless `.env` or the process environment explicitly sets
`WPMOO_ALLOW_DESTRUCTIVE=1`. `restore-snapshot --dry-run` remains allowed for
safe preview.

When `WPMOO_ENV=prod`, WPMoo also refuses module lifecycle commands that mutate
or exercise the Odoo database (`install`, `update`, and `test`) unless `.env` or
the process environment explicitly sets `WPMOO_ALLOW_PROD_LIFECYCLE=1`.
Staging keeps these commands available for release rehearsal while still
enforcing the destructive database guard above.

For PostgreSQL 18 environments (including `POSTGRES_IMAGE=postgres:18`), ensure db
volume and tmpfs mount targets use `/var/lib/postgresql` directly:

```text
- volumes:
  - db_data:/var/lib/postgresql
```

Paths such as `/var/lib/postgresql/data` and `/var/lib/postgresql/18/docker` are
no longer accepted by the package `doctor` check.

`doctor --fix` may rewrite these safe mount targets to `/var/lib/postgresql`.
It does not upgrade existing database data; if a real PostgreSQL major upgrade
is involved, use PostgreSQL upgrade tooling first.

Use `doctor --postgres` when the database container is running and you want
read-only PostgreSQL diagnostics. The check uses fixed diagnostic queries for
database count, sessions currently running queries where `pg_stat_activity.state`
is `active`, long transactions / idle-in-transaction sessions, table health
signals, unused index advisor signals, WAL and capacity visibility, and
slow-query logging readiness (`log_min_duration_statement` and
`pg_stat_statements` visibility). If the database is unavailable, doctor reports
a warning instead of failing the whole environment check.

`doctor --json --postgres` keeps output stable by exposing a versioned PostgreSQL
diagnostics contract. The contract is intentionally permissive: fields are optional
and omitted or marked unavailable when a running database does not expose them.

## Safe reset policy

Safe reset intentionally avoids deleting user-editable legacy paths from old
compose templates. Preview output must warn when these paths may remain:

```text
docs/assets/
test/
.github/
```

In addition, safe reset preserves local runtime and source-data state while refreshing
generated and compose assets:

```text
.env
data/
backups/
odoo/custom/src/oca/
odoo/custom/src/external/
odoo/custom/patches/
odoo/custom/manifests/
```

Run `npx @wpmoo/toolkit reset --dry-run` before writing changes when you need to
review the generated file refresh plan.

## Snapshot policy

Use restore preview before a destructive restore:

```bash
./moo restore-snapshot --dry-run <snapshot-name> [db]
```

`WPMOO_SNAPSHOT_RETENTION_COUNT` may be set to a positive integer to prune old
snapshot manifests and their matching dump/filestore files after a new snapshot
is written.

## Source manifest checks

Generated environments include `odoo/custom/manifests/sources.yaml`. The manifest
records each source repository's type (`private`, `oca`, or `external`), path,
URL, Odoo branch, and addon boundaries.

Use `source list` to inspect the current manifest view:

```bash
npx @wpmoo/toolkit source list
```

Use `source sync` after manual submodule or metadata repair to regenerate the
manifest and normalize `.wpmoo/odoo.json` source entries:

```bash
npx @wpmoo/toolkit source sync
```

`doctor` fails when manifest entries, metadata entries, and registered source
submodule paths diverge. `doctor --fix` can regenerate
`odoo/custom/manifests/sources.yaml` from metadata plus `.gitmodules` when the
manifest is missing, unreadable, or stale.

## Local verification commands

Run from the `wpmoo-toolkit` repository root:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
```

## Coverage watchlist (risk monitoring)

The following list is a risk watchlist for Train 2 verification, not a hard gate.
It uses the full `npm run test:coverage` suite to highlight where changes in
high-impact runtime files should be reviewed with extra care:

- `src/cli.ts`: **watch**: 83.74% line coverage (1458/1741), function coverage
  92.47% (86/93), branch coverage 80.61% (420/521). This file remains the
  highest-risk surface because it owns direct commands, cockpit dispatch, JSON
  routes, and release-facing error behavior.
- `src/doctor.ts`: **observe**: 94.48% line coverage (702/743), function
  coverage 95.56% (43/45), branch coverage 86.42% (229/265).
- `src/module-actions.ts`: **observe**: 96.83% line coverage (519/536),
  function coverage 97.22% (35/36), branch coverage 88.97% (129/145).
- `src/templates.ts`: **observe**: 99.24% line coverage (262/264), function
  coverage 100.00% (38/38), branch coverage 90.08% (109/121).
- `src/prompts/index.ts`: **observe**: 95.15% line coverage (294/309),
  function coverage 100.00% (36/36), branch coverage 92.31% (96/104).

Train 2 full-suite coverage baseline:

- Statements: 92.65% (7304/7883)
- Branches: 88.24% (2432/2756)
- Functions: 96.27% (595/618)
- Lines: 92.65% (7304/7883)
