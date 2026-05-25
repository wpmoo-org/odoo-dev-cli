![WPMoo Toolkit for Odoo development workflows](docs/assets/wpmoo-banner.png)

[![CI](https://img.shields.io/github/actions/workflow/status/wpmoo-org/wpmoo-toolkit/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/wpmoo-org/wpmoo-toolkit/actions/workflows/ci.yml) [![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&style=flat-square)](https://github.com/wpmoo-org/wpmoo-toolkit) [![npm](https://img.shields.io/npm/v/@wpmoo/toolkit?label=npm&logo=npm&style=flat-square&color=blue)](https://www.npmjs.com/package/@wpmoo/toolkit) [![coverage](https://img.shields.io/codecov/c/github/wpmoo-org/wpmoo-toolkit?branch=main&label=coverage&logo=codecov&style=flat-square&color=blue)](https://codecov.io/gh/wpmoo-org/wpmoo-toolkit) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE) [![Odoo Tool](https://img.shields.io/badge/Odoo-Tool-714B67?style=flat-square)](https://github.com/wpmoo-org/wpmoo-toolkit) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?logo=buymeacoffee&logoColor=000000&style=flat-square)](https://www.buymeacoffee.com/cangir) [![Patreon](https://img.shields.io/badge/Patreon-Support-F96854?logo=patreon&logoColor=white&style=flat-square)](https://www.patreon.com/wpmoo)

# WPMoo Toolkit

WPMoo Toolkit is a free, MIT-licensed CLI for creating and operating repeatable Docker Compose based Odoo development environments.

It is built for the everyday moments that tend to slow Odoo teams down: setting up a clean environment, keeping source repositories in a known layout, starting services, updating modules, testing changes, taking snapshots, restoring a database, and recovering generated files without touching product source code.

WPMoo Toolkit is an independent project and is not affiliated with, endorsed by, or sponsored by Odoo S.A. Odoo is a trademark of Odoo S.A.

## Why WPMoo Exists

Odoo development has good building blocks. Docker Compose is familiar. OCA conventions are strong. The wider ecosystem has helped many teams think more clearly about Odoo infrastructure.

What we kept missing was a smaller, local-first workflow tool.

We wanted a generated development repository that stayed boring and recoverable. We wanted product source code to live in its own Git repositories, not be mixed with disposable runtime files. We wanted a cockpit that remembered the daily Odoo tasks developers actually run, without asking everyone to become an infrastructure specialist just to update a module or restore a snapshot.

WPMoo is that layer. It does not try to replace the whole ecosystem. It gives an Odoo team a practical starting point, a stable folder layout, and a safer daily workflow.

## What It Solves

- Creates a repeatable Odoo development environment from a product name, Odoo version, and one or more source repositories.
- Keeps Odoo source repositories under `private`, `oca`, or `external` categories as Git submodules in `odoo/custom/src/`.
- Provides a guided terminal cockpit for services, modules, database work, diagnostics, repository management, and maintenance.
- Includes direct commands for automation and CI-friendly terminal workflows.
- Adds recovery tools such as `status`, `doctor`, `snapshot`, `restore-snapshot`, and safe reset.
- Refreshes generated environment files without deleting product source code.

## Development Status

> [!IMPORTANT]
> WPMoo Toolkit is still pre-1.0. Use it for evaluation, local trials, and feedback before relying on it for critical production workflows. Setup conventions and command behavior may still change before `1.0.0`.

## Prerequisites

- Node.js `20.17+`
- Git
- Docker and Docker Compose for generated environment runtime commands
- Optional: GitHub CLI (`gh`) when you want setup to inspect or create GitHub repositories

Before environment setup starts, WPMoo checks Git, Docker, Docker Compose, and the Docker Engine. If a required tool is missing, the wizard stops before asking setup questions, shows official download links inline with the missing tools, and lets you check again or exit with `Ctrl+C`. Install the missing tools, restart your terminal if PATH changed, start Docker Desktop, then run `npx @wpmoo/toolkit` again.

```bash
brew install gh
gh auth login
```

GitHub CLI (`gh`) is optional. WPMoo can run local-only and source repositories can be added later.

## Quick Setup

Run the guided wizard from the workspace where you keep Odoo projects:

```bash
npx @wpmoo/toolkit
```

Short alias:

```bash
npx wpmoo
```

Optional short alias: `npx wpmoo`. Use `npx @wpmoo/toolkit` for documentation,
scripts, and automation.

Deprecated compatibility aliases:

```bash
npx @wpmoo/odoo
npx @wpmoo/odoo-dev
```

Deprecated package paths `npx @wpmoo/odoo` and `npx @wpmoo/odoo-dev` remain
available through the 1.x line as compatibility aliases that redirect to
`@wpmoo/toolkit`. Removing either compatibility alias requires a future major
release and prior notice.

When the current directory is not already a WPMoo environment, the CLI opens the create flow. It asks for a product slug, Odoo version, and environment folder. The default environment folder is `./<product>_dev`.

Choose any environment folder; the default is `./<product>_dev`. Choose local-only setup to skip Git/GitHub connection and source repo prompts. Add source repositories later from the cockpit (`Repositories` -> `add-repo`) or `npx @wpmoo/toolkit add-repo`. Direct `create` commands keep the existing repo URL options; use `--target <path>` to choose a custom folder.

After setup, enter the generated environment and open the cockpit:

```bash
cd <product>_dev
./moo
```

For non-interactive setup:

```bash
npx @wpmoo/toolkit create \
  --product odoo_sample_module \
  --odoo-version 19.0 \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --init-empty-repos
```

## Main Cockpit Menu

The cockpit is the daily workspace. It starts with environment status and then shows a compact menu:

```text
WPMoo Cockpit
|-- Command palette /
|   |-- search commands such as /test, /modules, /install-module, /doctor, /safe-reset
|-- Services
|   |-- start
|   |-- stop
|   |-- restart
|   |-- logs
|   `-- shell
|-- Modules
|   |-- install
|   |-- update
|   |-- test
|   |-- lint
|   |-- pot
|   |-- add-module
|   `-- remove-module
|-- Database
|   |-- psql
|   |-- snapshot
|   |-- restore-snapshot
|   `-- resetdb
|-- Diagnostics
|   |-- status
|   `-- doctor
|-- Repositories
|   |-- add-repo
|   `-- remove-repo
|-- Maintenance
|   `-- safe-reset
`-- Exit
```

Every cockpit action maps to a direct command, so the same workflow can be used interactively or scripted:

When an environment has many module candidates, module selection switches to
search so names, repositories, and source categories can be filtered quickly.
Runtime actions that need running services or a ready database are disabled in
the cockpit until the environment is ready; file-only actions such as module
scaffolding, source repository changes, and safe reset remain available.
Doctor, test, and environment lint result pages include a `Run ... again`
action above `Back to menu`, reusing the same selected modules, database, and
mode for fast verification loops.

```bash
./moo start
./moo logs odoo
./moo update sale
./moo update sale stock --db devel
./moo test sale
./moo snapshot devel before-update
./moo snapshot --list
./moo restore-snapshot --dry-run before-update devel
```

In `WPMOO_ENV=stage`, `install`, `update`, `stop`, and `restart` require `WPMOO_ALLOW_STAGE_LIFECYCLE=1`.
In `WPMOO_ENV=prod`, `install`, `update`, `test`, `stop`, and `restart` require `WPMOO_ALLOW_PROD_LIFECYCLE=1`.
`resetdb` and real `restore-snapshot` require `WPMOO_ALLOW_DESTRUCTIVE=1` in `stage` and `prod`.
`restore-snapshot --dry-run` remains allowed for preview.
For short-lived local approvals, add JSONL entries to `.wpmoo/approvals.jsonl`; generated `.gitignore` keeps that ledger out of Git.

Module source actions also have direct commands. Default is `private`; pass `--source-type oca` or `--source-type external` for non-private source repositories:

```bash
npx @wpmoo/toolkit add-module --repo sale-workflow --module sale_order_line_no_discount --source-type oca
npx @wpmoo/toolkit remove-module --repo sale-workflow --module sale_order_line_no_discount --source-type oca
```

`add-module` creates a minimal Odoo module skeleton with `__init__.py`, `__manifest__.py`, `models/<module>.py`, `models/__init__.py`, `security/ir.model.access.csv`, `views/<module>_views.xml`, `views/<module>_menus.xml`, and `tests/test_<module>.py`. The view XML adds list/tree and form views; the menu XML adds a basic Odoo action and internal-user menu entry; the test skeleton adds a post-install TransactionCase smoke test. WPMoo reports scaffold quality after generation and `status` reports installable modules, non-installable modules, and modules without actionable menus. Module names must be lower `snake_case`; use letters, numbers, and underscores only.

For automation and VS Code cockpit integration, selected commands support JSON output:

```bash
npx @wpmoo/toolkit status --json
npx @wpmoo/toolkit source list --json
npx @wpmoo/toolkit source sync --json
npx @wpmoo/toolkit doctor --json
npx @wpmoo/toolkit doctor --json --fail-on-warning
npx @wpmoo/toolkit doctor --postgres
npx @wpmoo/toolkit doctor --json --postgres
```

JSON output is optional; human-readable output remains the default.
`doctor --json --fix` is intentionally unsupported because `doctor --fix` may
write safe file-level repairs. Run `doctor --fix` first, then `doctor --json`
to inspect the post-fix state.
Human `doctor` output is grouped into stable sections (`Generated files`,
`Compose`, `Source repositories`, `PostgreSQL`, and `Host tools`) so terminal
operators can see which lifecycle layer needs attention first.
Use `doctor --fail-on-warning` when CI or a train gate must fail on advisory
warnings that remain acceptable in normal interactive developer output.
`doctor --postgres` runs read-only PostgreSQL diagnostics as advisory checks only; it
does not perform automatic tuning.
Incomplete or malformed PostgreSQL metric rows are reported as unavailable diagnostics
instead of being treated as successful checks.

Current advisory checks include:

- sessions currently running queries where `pg_stat_activity.state = 'active'`;
- connection utilization against `max_connections`;
- long transaction / idle-in-transaction warnings from `pg_stat_activity`;
- table health visibility (for example table and index bloat signals, index scan
  efficiency, and vacuum-related blockers);
- optional unused index advisory output when index usage data is available;
- WAL and capacity visibility including WAL activity and disk-level pressure context;
- slow-query and query-plan readiness checks for common `log_min_duration_statement`
  and `pg_stat_statements` prerequisites;
- read-only PostgreSQL configuration visibility for `shared_buffers`, `work_mem`,
  `maintenance_work_mem`, `effective_cache_size`, and
  `shared_preload_libraries`.

`npx @wpmoo/toolkit doctor --postgres` and
`npx @wpmoo/toolkit doctor --json --postgres` use the same checks, and the
JSON variant exposes a versioned PostgreSQL diagnostics contract.

`doctor --json --postgres` includes a structured `postgres` object for automation.
`doctor --json --postgres` keeps the JSON contract stable by versioning the
`postgres` payload; individual fields are optional so automation can safely handle
environments where PostgreSQL does not expose a metric.
Optional PostgreSQL probe permission failures appear under
`postgres.optionalProbeFailures` when available; they do not make
`postgres.available` false and can be ignored by automation that only needs core
diagnostics.
All `doctor --json` reports also include optional `sections` entries that group
checks, warnings, and errors without changing the legacy flat arrays.

When `./moo test <module>` or `npx @wpmoo/toolkit test <module>` fails and an
Odoo test log exists under `./logs`, WPMoo prints a short relevant excerpt and
the full log path. The default lookup checks `./logs/odoo-test-<module>.log`,
`./logs/test-<module>.log`, and common generic Odoo test log names.

JSON compatibility policy:

- Automation should ignore unknown JSON fields.
- Minor and patch releases may add optional fields without a breaking release.
- Removing, renaming, or changing the meaning of a documented field requires a
  major release or a `schemaVersion` bump.

## Release Artifacts

WPMoo Toolkit releases are valid when the required npm artifacts publish
successfully:

- `@wpmoo/toolkit`
- `@wpmoo/odoo`
- `@wpmoo/odoo-dev`

The unscoped `wpmoo` short alias is optional. If npm returns `E404` or rejects
that alias during the publish workflow, the workflow reports a non-blocking
warning while keeping the scoped package release valid.

### Release candidate rules

- **Required release artifacts**: `@wpmoo/toolkit`, `@wpmoo/odoo`, and
  `@wpmoo/odoo-dev` must be publishable at package version `$VERSION` for tag
  `v$VERSION` to count as valid.
- **Optional artifact**: `wpmoo` at package version `$VERSION` is best-effort only. If npm
  rejects it, the release still succeeds as long as the three required scoped
  packages are valid.
- **Smoke expectation**: run `npm run smoke:published -- "$VERSION"` after the
  release tag workflow completes. The script prints `Smoke step:` progress lines
  before each published CLI check so slow registry-backed `npx` resolution is
  visible.
- **Deterministic smoke target**: pin the target package explicitly so smoke checks
  are reproducible across reruns:

  ```bash
  VERSION="$(node -p "require('./package.json').version")"
  WPMOO_PUBLISHED_PACKAGE_SPEC="@wpmoo/toolkit@$VERSION" npm run smoke:published -- "$VERSION"
  ```

  Use one pinned command for each target artifact you validate; the workflow itself
  remains valid only when required scoped artifacts pass.
- **1.0 release smoke**: For `1.0.0`, generated-environment acceptance smoke is
  required before the release is considered final.

## Documentation

- [Command Reference](docs/command-reference.md)
- [External Resources](docs/external-resources.md)
- [Generated Environment Verification](docs/generated-environment-verification.md)
- [Lifecycle Recipes](docs/lifecycle-recipes.md)
- [Troubleshooting](docs/troubleshooting.md)
- [1.0 Readiness](docs/1-0-readiness.md)
- Public documentation site: <https://wpmoo.org>

## License

WPMoo Toolkit is free software released under the [MIT License](LICENSE).

## Acknowledgements

WPMoo builds on the work of many open source projects and communities. Thanks to the maintainers and contributors behind Odoo, OCA, Docker Compose, TypeScript, Node.js, Inquirer, Vitest, VitePress, GitHub CLI, npm, and the wider Odoo developer ecosystem.
