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
| Source repo add/remove | Source repository registration and submodule lifecycle behave correctly. | `npx @wpmoo/toolkit add-repo ...`, `npx @wpmoo/toolkit remove-repo ...` |
| Source manifest sync | Source repo metadata, `.gitmodules`, and `odoo/custom/manifests/sources.yaml` stay aligned. | `npx @wpmoo/toolkit source list`, `npx @wpmoo/toolkit source sync` |
| Module add/remove | Module registration changes are applied to the selected source repo config. | `npx @wpmoo/toolkit add-module ...`, `npx @wpmoo/toolkit remove-module ...` |
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

When `WPMOO_ENV=stage` or `WPMOO_ENV=prod`, generated compose scripts refuse
destructive database actions such as `resetdb` and real `restore-snapshot`
unless `.env` explicitly sets `WPMOO_ALLOW_DESTRUCTIVE=1`.

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
