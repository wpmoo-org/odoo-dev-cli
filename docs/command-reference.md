# Command Reference

Use `npx @wpmoo/toolkit ...` for package/operator commands. Use `./moo ...`
inside a generated environment for daily local commands. The deprecated
compatibility aliases `npx @wpmoo/odoo` and `npx @wpmoo/odoo-dev` redirect to
the toolkit package; new automation should use `@wpmoo/toolkit`. Deprecated
compatibility aliases remain available through the 1.x line. Removing a
compatibility alias requires a future major release and prior notice. The
unscoped `npx wpmoo` short alias is optional and best-effort; scripts should use
`npx @wpmoo/toolkit`.

## Package Commands

| Command | Cockpit Equivalent | JSON | Notes |
| --- | --- | --- | --- |
| `npx @wpmoo/toolkit` | Open cockpit or create wizard | No | Opens the create wizard outside an environment and the cockpit inside one. |
| `npx @wpmoo/toolkit create ...` | Create wizard | No | Creates a generated environment. Use `--target <path>` for a custom folder. |
| `npx @wpmoo/toolkit status` | Diagnostics -> Environment status | Yes, `--json` | Fast local metadata and file check. |
| `npx @wpmoo/toolkit doctor [--fix] [--postgres]` | Diagnostics -> Run doctor | Yes, `--json` | Deeper health checks. `--postgres` is read-only and advisory. |
| `npx @wpmoo/toolkit source list` | Repositories | Yes, `--json` | Lists known source repositories. |
| `npx @wpmoo/toolkit source sync` | Repositories | Yes, `--json` | Refreshes source manifest data. |
| `npx @wpmoo/toolkit add-repo --repo-url <url>` | Repositories -> Add source repo | No | Adds a source repository category entry. |
| `npx @wpmoo/toolkit remove-repo --repo <name>` | Repositories -> Remove source repo | No | Removes a source repository from the environment. |
| `npx @wpmoo/toolkit add-module --repo <repo> --module <name>` | Modules -> Add module | No | Creates an Odoo module skeleton in a source repository. |
| `npx @wpmoo/toolkit remove-module --repo <repo> --module <name>` | Modules -> Remove module | No | Removes module metadata; pass `--delete-files` to delete module files after dirty checks. |
| `npx @wpmoo/toolkit reset [--dry-run]` | Maintenance -> Safe reset environment | No | Refreshes generated files while preserving source repositories. |

## Generated Environment Commands

Run these from the generated environment root:

| Command | Cockpit Equivalent | Guarded In Stage/Prod | Notes |
| --- | --- | --- | --- |
| `./moo start` | Services -> Start services | No | Starts local Odoo services. Disabled in cockpit when already running. |
| `./moo stop` | Services -> Stop services | No | Stops local services. Disabled in cockpit when services are stopped. |
| `./moo restart` | Services -> Restart services | No | Restarts services. |
| `./moo logs [service] [tail-lines]` | Services -> View logs | No | Streams or tails service logs. |
| `./moo shell` | Services -> Open shell | No | Opens a shell in the Odoo service container. |
| `./moo psql [db]` | Database -> Open psql | No | Opens a PostgreSQL prompt. |
| `./moo install <module[,module]> [db]` | Modules -> Install module | Yes | Installs one or more modules. |
| `./moo update <module[,module]> [db]` | Modules -> Update module | Yes | Updates one or more modules. |
| `./moo test <module[,module]> --db <db>` | Modules -> Run tests | Yes in prod | Runs Odoo tests for modules. |
| `./moo lint` | Modules -> Run environment lint | No | Runs configured environment lint checks. |
| `./moo pot <module[,module]> [db] [output]` | Modules -> Generate POT | No | Generates translation template files. |
| `./moo snapshot [--list] [db] [name]` | Database -> Create snapshot | No | Creates a database and filestore snapshot, or lists known snapshots with `--list`. |
| `./moo restore-snapshot --dry-run <name> [db]` | Database -> Restore snapshot | Preview only | Prints a restore preview without changing data. |
| `./moo restore-snapshot <name> [db]` | Database -> Restore snapshot | Yes | Restores database and filestore from a snapshot. |
| `./moo resetdb [db] [module[,module]]` | Database -> Reset database | Yes | Destructive database reset. |
| `./moo doctor [--fix] [--postgres]` | Diagnostics -> Run doctor | No | Local health checks. |
| `./moo status` | Diagnostics -> Environment status | No | Local environment status. |

## JSON Output

Machine-readable output is available for automation:

```bash
npx @wpmoo/toolkit status --json
npx @wpmoo/toolkit source list --json
npx @wpmoo/toolkit source sync --json
npx @wpmoo/toolkit doctor --json
npx @wpmoo/toolkit doctor --json --postgres
```

Current JSON contract notes:

- `status --json` uses `schemaVersion: 1`.
- `source list --json` and `source sync --json` use `schemaVersion: 1`.
- `doctor --json` uses `schemaVersion: 1`.
- `doctor --json --postgres` adds `postgres.contractVersion` and a PostgreSQL
  diagnostics object with its own `schemaVersion`.
- PostgreSQL fields are optional when a metric is unavailable.
- Automation should ignore unknown JSON fields.
- Minor and patch releases may add optional fields without a breaking release.
- Removing, renaming, or changing the meaning of a documented field requires a
  major release or a `schemaVersion` bump.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `WPMOO_ENV=dev|stage|prod` | Selects environment safety policy. Missing value behaves like development for local workflows. |
| `WPMOO_ALLOW_STAGE_LIFECYCLE=1` | Allows `install` and `update` in stage. |
| `WPMOO_ALLOW_PROD_LIFECYCLE=1` | Allows `install`, `update`, and `test` in production. |
| `WPMOO_ALLOW_DESTRUCTIVE=1` | Allows destructive database commands in stage/prod. |
| `WPMOO_ALLOW_NO_RECENT_SNAPSHOT=1` | Allows destructive commands without a recent snapshot when that extra guard applies. |
| `WPMOO_ALLOW_MIGRATIONS=1` | Allows lifecycle commands when migration scripts are detected. |
| `WPMOO_NODE_BIN`, `WPMOO_NPX_BIN`, `WPMOO_GIT_BIN` | Override binaries used by release smoke scripts. |

Process environment values take precedence over `.env` values for safety flags.

## Approval Ledger

For time-bounded local approvals, add JSONL entries to `.wpmoo/approvals.jsonl`.
Generated `.gitignore` ignores this file, and it should not be committed.
Existing `WPMOO_ALLOW_*` flags remain supported; ledger entries are an additive
way to make short-lived intent explicit.

Each line is one JSON object:

```json
{"scope":"stage-lifecycle","environment":"stage","command":"install","expiresAt":"2026-05-21T12:30:00.000Z","reason":"release rehearsal"}
```

Supported `scope` values are `stage-lifecycle`, `prod-lifecycle`,
`destructive`, `no-recent-snapshot`, and `migration-risk`. `environment` must be
`stage` or `prod`. `command` is optional; omit it only for a deliberately broad
approval. Expired, malformed, or mismatched entries are ignored.

## Exit Behavior

- Successful commands exit `0`.
- Invalid arguments, missing environment metadata, refused guard checks, dirty
  deletion, and failed subprocesses exit non-zero.
- `--json` commands still use process exit codes; automation should check both
  the exit status and the `ok` field when present.
- Guard failures are intentional failures. Do not silence them unless the named
  `WPMOO_ALLOW_*` flag has been reviewed.

## Stage And Production Restrictions

| Command Family | Stage | Production |
| --- | --- | --- |
| `install`, `update` | Requires `WPMOO_ALLOW_STAGE_LIFECYCLE=1` | Requires `WPMOO_ALLOW_PROD_LIFECYCLE=1` |
| `test` | Allowed | Requires `WPMOO_ALLOW_PROD_LIFECYCLE=1` |
| `resetdb`, real `restore-snapshot` | Requires `WPMOO_ALLOW_DESTRUCTIVE=1` | Requires `WPMOO_ALLOW_DESTRUCTIVE=1` |
| `restore-snapshot --dry-run` | Allowed | Allowed |
| Commands with detected migration scripts | May require `WPMOO_ALLOW_MIGRATIONS=1` | May require `WPMOO_ALLOW_MIGRATIONS=1` |

Prefer read-only and dry-run commands first:

```bash
./moo doctor
./moo doctor --postgres
./moo restore-snapshot --dry-run before-change devel
```
