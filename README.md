![WPMoo Odoo development workflow tooling](docs/assets/wpmoo-banner.png)

[![CI](https://img.shields.io/github/actions/workflow/status/wpmoo-org/wpmoo-odoo/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/wpmoo-org/wpmoo-odoo/actions/workflows/ci.yml) [![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&style=flat-square)](https://github.com/wpmoo-org/wpmoo-odoo) [![npm](https://img.shields.io/npm/v/@wpmoo/odoo?label=npm&logo=npm&style=flat-square&color=blue)](https://www.npmjs.com/package/@wpmoo/odoo) [![coverage](https://img.shields.io/codecov/c/github/wpmoo-org/wpmoo-odoo?branch=main&label=coverage&logo=codecov&style=flat-square&color=blue)](https://codecov.io/gh/wpmoo-org/wpmoo-odoo) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE) [![Odoo Tool](https://img.shields.io/badge/Odoo-Tool-714B67?style=flat-square)](https://github.com/wpmoo-org/wpmoo-odoo) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?logo=buymeacoffee&logoColor=000000&style=flat-square)](https://www.buymeacoffee.com/cangir) [![Patreon](https://img.shields.io/badge/Patreon-Support-F96854?logo=patreon&logoColor=white&style=flat-square)](https://www.patreon.com/wpmoo)

# WPMoo Odoo

WPMoo Odoo is a development-first CLI for creating and operating Docker Compose based Odoo environments with source repositories managed as Git submodules.

It gives Odoo teams a repeatable environment layout, a guided cockpit for daily work, direct commands for automation, and recovery tools that refresh generated files without touching product source code.

## Development Status

> [!IMPORTANT]
> **Pre-1.0 active development:** WPMoo Odoo has not reached `1.0.0` yet. Until the `1.0.0` release, use it as a preview tool for evaluation, local trials, and feedback rather than a dependency for critical production workflows. Setup conventions and command behavior may still change between pre-1.0 releases.

## Why WPMoo Odoo

- Create a local Odoo development environment from a dev repository and one or more source repositories.
- Keep product source repositories under `odoo/custom/src/private`, `odoo/custom/src/oca`, or `odoo/custom/src/external` as Git submodules pinned to the selected Odoo branch.
- Copy Docker Compose resources from the standalone `wpmoo-org/odoo-docker-compose` resource instead of embedding large runtime assets in the TypeScript package.
- Optionally copy project-local Agent Skills from `wpmoo-org/odoo-skills` into generated environments.
- Use either a guided terminal cockpit or direct CLI commands for the same lifecycle tasks.

## Requirements

- Node.js `>=20.17`
- Git
- Docker and Docker Compose for generated environment runtime commands
- GitHub CLI (`gh`) is optional. Use it for repository discovery, repository creation, and deeper diagnostics.

The wizard currently offers Odoo `19.0`, `18.0`, `17.0`, and `16.0`. Generated
environments now use the compact compose layout (`compose.yaml` with
`compose/<env>.yaml` overlays). Legacy root-level
`docker-compose_<version>.yml` layouts are still supported for compatibility.

Set up GitHub CLI only when you want WPMoo to discover your personal account and organizations or create missing repositories from the interactive wizard:

```bash
brew install gh
gh auth login
```

## Quick Start

Run the guided wizard from a workspace directory:

```bash
npx @wpmoo/odoo
```

If the current directory is not already a WPMoo environment, the CLI opens the create flow. It asks for the product slug, Odoo version, and environment folder. Choose any environment folder; the default is `./<product>_dev`.

After folder selection, connect Git/GitHub to use repository URLs. Choose local-only setup to skip Git/GitHub connection and source repo prompts. Add source repositories later from the cockpit (`Repositories` -> `add-repo`) or `npx @wpmoo/odoo add-repo`.

For non-interactive usage with repository URLs:

Direct `create` commands keep the existing repo URL options; use `--target <path>` to choose a custom folder.

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --odoo-version 19.0 \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --init-empty-repos
```

Add multiple source repositories by repeating `--source-repo-url`:

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --source-addons odoo_sample_module,odoo_sample_module_portal \
  --source-repo-url git@github.com:example-org/odoo_sample_module_reports.git \
  --source-path odoo_sample_module_reports \
  --source-addons odoo_sample_module_reports
```

Preview planned files and commands without writing:

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --dry-run
```

## The Cockpit

Run the package with no command inside a generated environment:

```bash
npx @wpmoo/odoo
```

The cockpit starts with a fast environment status summary, then opens a compact menu designed for repeated local work:

```text
Command palette /
Services
Modules
Database
Diagnostics
Repositories
Maintenance
Exit
```

The UI is intentionally practical rather than decorative:

- `Command palette /` searches slash commands such as `/test`, `/logs`, `/doctor`, and `/safe-reset`.
- Category menus group related tasks for scanability: services, modules, database, diagnostics, repositories, and maintenance.
- `Esc` returns from category menus to the top-level cockpit.
- Empty states explain the next action, such as adding a source repo before selecting a module.
- Risky commands such as stopping services, resetting databases, restoring snapshots, removing repos, removing modules, and safe reset ask for explicit confirmation.
- Guided prompts collect common arguments for daily actions, including module names, database names, test modes, tags, snapshot names, and POT output paths.

## Cockpit Command Map

| Category | Commands |
| --- | --- |
| Services | `start`, `stop`, `restart`, `logs`, `shell` |
| Modules | `install`, `update`, `test`, `lint`, `pot`, `add-module`, `remove-module` |
| Database | `psql`, `snapshot`, `restore-snapshot`, `resetdb` |
| Diagnostics | `status`, `doctor` |
| Repositories | `add-repo`, `remove-repo` |
| Maintenance | `safe-reset` |

Every cockpit action maps to a direct command, or to an equivalent management command such as `/safe-reset` mapping to `reset`, for scripting and repeatable terminal workflows.

## Direct Commands

```bash
npx @wpmoo/odoo --help
npx @wpmoo/odoo --version

npx @wpmoo/odoo status
npx @wpmoo/odoo doctor
npx @wpmoo/odoo doctor --fix
npx @wpmoo/odoo add-repo --repo-url https://github.com/example-org/odoo_sample_module_reports.git
npx @wpmoo/odoo remove-repo --repo odoo_sample_module_reports
npx @wpmoo/odoo add-module --repo odoo_sample_module --module odoo_sample_module_base
npx @wpmoo/odoo remove-module --repo odoo_sample_module --module odoo_sample_module_base
npx @wpmoo/odoo reset --dry-run
npx @wpmoo/odoo reset

npx @wpmoo/odoo start
npx @wpmoo/odoo stop
npx @wpmoo/odoo restart
npx @wpmoo/odoo logs odoo
npx @wpmoo/odoo shell
npx @wpmoo/odoo psql postgres

npx @wpmoo/odoo install sale devel
npx @wpmoo/odoo update sale devel
npx @wpmoo/odoo test sale --db devel --mode update --tags /sale
npx @wpmoo/odoo lint
npx @wpmoo/odoo pot sale devel i18n/sale.pot

npx @wpmoo/odoo resetdb devel sale
npx @wpmoo/odoo snapshot devel before-update
npx @wpmoo/odoo restore-snapshot --dry-run before-update devel
npx @wpmoo/odoo restore-snapshot before-update devel
```

Daily action commands must be run from a generated environment root containing `.wpmoo/odoo.json`. They delegate to fixed scripts under `./scripts`; they do not search parent directories or run arbitrary script names.

## Generated Environment Layout

A generated environment is a separate Git repository, usually named `<product>_dev`, but the wizard and `--target` can use any folder. Product source code stays in child source repositories.

```text
odoo_sample_module_dev/
|-- .wpmoo/
|   `-- odoo.json
|-- .env.example
|-- AGENTS.md
|-- README.md
|-- compose.yaml
|-- compose/
|   |-- dev.yaml
|   |-- stage.yaml
|   `-- prod.yaml
|-- config/
|   `-- odoo/
|       `-- odoo.conf
|-- docs/
|   |-- appstore-release.md
|   `-- compose.md
|-- resources/
|   `-- odoo/
|       `-- entrypoint.sh
|-- moo
|-- odoo/
|   `-- custom/
|       `-- src/
|           |-- private/
|           |-- oca/
|           `-- external/
`-- scripts/
```

Development uses `compose.yaml` plus `compose/dev.yaml` by default. Set
`WPMOO_ENV=stage` or `WPMOO_ENV=prod` only after providing production-grade
secrets and volumes.

The metadata file `.wpmoo/odoo.json` records the product slug, selected Odoo version, dev repo URL, source repos, engine, external resource refs, ports, and template configuration. Status, doctor, daily actions, and safe reset use that metadata instead of guessing from the filesystem.

## Daily `./moo` Commands

Generated environments include a local `./moo` dispatcher. It is the shortest path for everyday Compose and Odoo work:

```bash
cp .env.example .env

./moo start
./moo logs odoo
./moo shell
./moo psql postgres
./moo restart
./moo stop

./moo install sale devel
./moo update sale devel
./moo test sale --db devel --mode update --tags /sale
./moo lint
./moo pot sale devel i18n/sale.pot

./moo snapshot devel before-update
./moo restore-snapshot --dry-run before-update devel
./moo restore-snapshot before-update devel
./moo resetdb devel sale
```

`restore-snapshot --dry-run` validates the selected snapshot and prints the
restore plan without changing the database or filestore. Generated environments
also support `WPMOO_SNAPSHOT_RETENTION_COUNT` for pruning old snapshot files.
When `WPMOO_ENV=stage` or `WPMOO_ENV=prod`, destructive database actions such
as `resetdb` and real `restore-snapshot` require `WPMOO_ALLOW_DESTRUCTIVE=1`.

Use `npx @wpmoo/odoo ...` for package/operator commands such as `create`, `add-repo`, `remove-repo`, `add-module`, `remove-module`, `status`, `doctor`, and `reset`. Use `./moo ...` inside a generated environment for local daily Compose commands.

## Repository and Module Management

Add a source repository after local-only setup from the cockpit or direct command:

```bash
npx @wpmoo/odoo add-repo \
  --repo-url https://github.com/example-org/odoo_sample_module_reports.git \
  --init-empty-repos
```

Pin source repositories to dedicated source directories:

```bash
npx @wpmoo/odoo add-repo \
  --repo-url https://github.com/OCA/sale-workflow.git \
  --source-type oca

npx @wpmoo/odoo add-repo \
  --repo-url https://github.com/example-org/odoo_external_tool.git \
  --source-type external
```

GitHub CLI is optional for repository setup. When it is available and authenticated, the interactive flow can:

- detect the owner or organization from the current environment;
- suggest repository URLs;
- check whether the repository is accessible;
- create inaccessible repositories after confirmation;
- initialize empty repositories with the selected Odoo branch.

Add a minimal Odoo module skeleton to a source repository:

```bash
npx @wpmoo/odoo add-module \
  --repo odoo_sample_module \
  --module odoo_sample_module_base
```

Remove a module registration while keeping files:

```bash
npx @wpmoo/odoo remove-module \
  --repo odoo_sample_module \
  --module odoo_sample_module_base
```

Delete module files as well:

```bash
npx @wpmoo/odoo remove-module \
  --repo odoo_sample_module \
  --module odoo_sample_module_base \
  --delete-files
```

Remove a source repository submodule:

```bash
npx @wpmoo/odoo remove-repo --repo odoo_sample_module_reports
```

WPMoo refuses to remove a source repo submodule when that submodule has uncommitted changes.

Generated environments also keep a deterministic source manifest at
`odoo/custom/manifests/sources.yaml`. It mirrors source submodules from
`.wpmoo/odoo.json` and `.gitmodules`, including source type, path, URL, branch,
and addon boundaries.

Inspect configured sources:

```bash
npx @wpmoo/odoo source list
```

Regenerate the manifest and metadata from the current metadata/gitmodule state:

```bash
npx @wpmoo/odoo source sync
```

`source add` and `source remove` are direct aliases for the same repository
operations:

```bash
npx @wpmoo/odoo source add \
  --repo-url https://github.com/OCA/server-tools.git \
  --source-type oca

npx @wpmoo/odoo source remove --repo server-tools --source-type oca
```

## Status, Doctor, and Recovery

`status` is fast and offline. It reads local metadata and files only:

```bash
npx @wpmoo/odoo status
```

It reports whether the environment is detected, which Odoo version is selected, how many source repos are configured, how many module candidates are present, which core files are missing, and the recommended next action.

`doctor` performs deeper checks:

```bash
npx @wpmoo/odoo doctor
```

It validates metadata, engine support, selected compose files, source repo paths,
source manifest consistency, daily scripts, `.env` settings, Docker CLI access,
Docker Compose access, GitHub CLI authentication when available, and PostgreSQL
18 compatibility in compose mount targets (for mounts to
`/var/lib/postgresql/data` or `/var/lib/postgresql/18/docker`).

Use `doctor --fix` for safe file-level repairs. It can normalize PostgreSQL 18
mount targets and regenerate `odoo/custom/manifests/sources.yaml` from
metadata plus `.gitmodules`, then it runs doctor again and reports any remaining
manual issues.

Safe reset refreshes generated environment files without deleting product source code:

```bash
npx @wpmoo/odoo reset --dry-run
npx @wpmoo/odoo reset
```

Safe reset updates generated files such as `.wpmoo/odoo.json`, `moo`,
`.gitignore`, `.env.example`, generated docs, compose assets, and optional
Agent Skills. Compose overlays like `compose.yaml` and `compose/dev.yaml` are
also refreshed from the current compose template source.

Use `reset --dry-run` first when you want a deterministic preview of refreshed
files and cleanup warnings without writing to the environment.

It does not touch source repo folders under
`odoo/custom/src/private`, module source code, Git history, remotes, or
branches. It also preserves local runtime artifacts and custom source layout
content:

- `.env`, `data`, and `backups`
- `odoo/custom/src/oca`, `odoo/custom/src/external`, `odoo/custom/patches`,
  `odoo/custom/manifests`, and their existing contents

Legacy compose template paths from older scaffolds can remain
(`docs/assets/`, `test/`, `.github/`) until you remove them manually.

Recommended recovery pattern:

```bash
./moo snapshot devel before-reset
npx @wpmoo/odoo reset --dry-run
npx @wpmoo/odoo reset
npx @wpmoo/odoo doctor --fix
./moo restore-snapshot --dry-run before-reset devel
./moo restore-snapshot before-reset devel
```

## External Resources

WPMoo Odoo keeps the package small by copying external resources into generated environments:

```text
gh:wpmoo-org/odoo-docker-compose
gh:wpmoo-org/odoo-skills
```

Use the default resources:

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --agent-skills-template
```

Pin external resource refs:

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --compose-template-ref v0.1.0 \
  --agent-skills-template \
  --agent-skills-template-ref v0.1.0
```

Use local resource clones while developing the resource packages:

```bash
git clone https://github.com/wpmoo-org/odoo-docker-compose ../odoo-docker-compose
git clone https://github.com/wpmoo-org/odoo-skills ../odoo-skills

npx @wpmoo/odoo create \
  --engine compose \
  --compose-template-url ../odoo-docker-compose \
  --agent-skills-template \
  --agent-skills-template-url ../odoo-skills \
  --product odoo_sample_module \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git
```

More detail: [External Resources](docs/external-resources.md).

## Verification

Run local package checks from the repository root:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Generated environment behavior is covered by the operator-facing matrix in [Generated Environment Verification](docs/generated-environment-verification.md).

## Release

The normal release path uses the repository helper and GitHub Actions trusted publishing:

```bash
npm run release:check
npm run typecheck
npm test
npm run build
VERSION="$(node -p "require('./package.json').version")"
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"
```

If `npm run release:check` bumps `package.json` and `package-lock.json`, commit and push that version bump first, then rerun the release check before tagging. Publishing is handled by the `Publish` workflow after the tag is pushed.

## Sponsoring

Support ongoing WPMoo development through recurring or one-time sponsorship:

<a href="https://www.buymeacoffee.com/cangir">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="250">
</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://www.patreon.com/wpmoo">
  <img src="docs/assets/patreon-donate.png" alt="Support WPMoo on Patreon" width="250">
</a>
