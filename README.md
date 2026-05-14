# @wpmoo/odoo

![WPMoo Odoo lifecycle tooling across development, staging, and production](docs/assets/wpmoo-banner.png)

[![CI](https://img.shields.io/github/actions/workflow/status/wpmoo-org/wpmoo-odoo/ci.yml?branch=main&label=CI)](https://github.com/wpmoo-org/wpmoo-odoo/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-cangir-FFDD00?logo=buymeacoffee&logoColor=000000)](https://www.buymeacoffee.com/cangir)

WPMoo Odoo lifecycle tooling for development, staging, and production workflows.

The CLI currently creates Docker Compose based Odoo environments, adds source
repositories as Git submodules, and stages the result with `git add .`. It does
not commit. Staging and production workflows will build on the same package and
command surface.

Compose resources and project-local Agent Skills are copied from standalone
repositories, so large Docker/skill assets do not need to be embedded in the
TypeScript CLI. The compose resource uses static version-specific files such as
`docker-compose_19.0.yml` so it can also be used standalone.

For a product named `odoo_sample_module`, create these repositories first:

```text
odoo_sample_module_dev  # private development environment repo
odoo_sample_module      # source repo
```

The CLI writes into `./odoo_sample_module_dev`. If that directory does not exist
locally, it clones the dev repo URL you provide.

When GitHub CLI is installed and authenticated, the interactive wizard detects
your GitHub username and organizations. If multiple accounts are available, it
asks where the repos should live and uses that owner for the default repo URLs.
The wizard also checks whether the dev and source repositories are accessible.
If they are not accessible, it can create them for you after confirmation.

```bash
brew install gh
gh auth login
```

Use cloneable repository URLs such as
`https://github.com/example-org/odoo_sample_module.git`. If a GitHub
organization page URL like `https://github.com/orgs/example-org/odoo_sample_module`
is entered, the CLI normalizes it to the cloneable form.

## Usage

Interactive wizard:

```bash
npx @wpmoo/odoo
```

The wizard is context-aware. If the current directory is not already a WPMoo
Odoo development environment, it starts the create flow directly.

Inside an existing environment, it shows maintenance actions:

```text
Add source repo
Remove source repo
Add module to source repo
Remove module from source repo
Safe reset environment
```

Non-interactive:

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --odoo-version 19.0 \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --create-missing-repos \
  --init-empty-repos
```

Multiple source repositories:

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

Dry run:

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --dry-run
```

Default Docker Compose engine through an external standalone compose resource:

```bash
npx @wpmoo/odoo create \
  --product odoo_sample_module \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --agent-skills-template
```

During local resource development, point to local clones of the standalone repos:

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

Add a source repository later from inside the dev environment:

```bash
npx @wpmoo/odoo
```

Choose `Add source repo`, then enter only the repository name, such as
`odoo_sample_module_reports`. The CLI uses the environment's GitHub owner and
Odoo version, checks whether the repository exists, can create it with GitHub
CLI when needed, and initializes empty repositories with the environment Odoo
branch automatically.

Non-interactive URL form:

```bash
npx @wpmoo/odoo add-repo \
  --repo-url https://github.com/example-org/odoo_sample_module_reports.git \
  --odoo-version 19.0 \
  --init-empty-repos
```

When run inside a generated environment, maintenance actions use the environment
Odoo version from `.wpmoo/odoo.json`. Pass `--odoo-version` only when you
need an explicit override.

Remove a source repository from the dev environment:

```bash
npx @wpmoo/odoo remove-repo --repo odoo_sample_module_reports
```

Add a minimal Odoo module skeleton to a selected source repository:

```bash
npx @wpmoo/odoo add-module \
  --repo odoo_sample_module \
  --module odoo_sample_module_base \
  --odoo-version 19.0
```

Remove a module registration without deleting source files:

```bash
npx @wpmoo/odoo remove-module \
  --repo odoo_sample_module \
  --module odoo_sample_module_base
```

Check that a generated environment is structurally ready:

```bash
npx @wpmoo/odoo doctor
```

Refresh generated environment files without deleting module source code:

```bash
npx @wpmoo/odoo reset
```

Run daily local development actions from a generated environment root:

```bash
npx @wpmoo/odoo start
npx @wpmoo/odoo logs odoo
npx @wpmoo/odoo restart
npx @wpmoo/odoo stop
npx @wpmoo/odoo shell
npx @wpmoo/odoo psql devel
npx @wpmoo/odoo install sale devel
npx @wpmoo/odoo update sale devel
npx @wpmoo/odoo test sale --db devel --mode update --tags /sale
npx @wpmoo/odoo resetdb devel sale
npx @wpmoo/odoo snapshot devel before-update
npx @wpmoo/odoo restore-snapshot before-update devel
npx @wpmoo/odoo lint
npx @wpmoo/odoo pot sale devel i18n/sale.pot
```

The doctor command must be run from a generated environment root containing
`.wpmoo/odoo.json`. It checks metadata, selected compose files, daily scripts,
source repo paths, `.env` ports, and Docker CLI access.

Daily actions require `.wpmoo/odoo.json` in the current directory and delegate to
fixed scripts under `./scripts`; they do not search parent directories or accept
arbitrary script names.

Generated environments also include a local `./moo` shortcut for local compose
daily commands such as `./moo start`, `./moo restart`, and `./moo stop`. The
shortcut supports the same daily action arguments as `npx @wpmoo/odoo`. It also
falls back to `npx @wpmoo/odoo@latest doctor` for `./moo doctor`.

## Defaults

Each source repo can contain one or many Odoo modules. For example:

```text
odoo/custom/src/private/odoo_sample_module/
├── odoo_sample_module_base/
└── odoo_sample_module_another_module/

odoo/custom/src/private/odoo_sample_module_pro/
├── odoo_sample_module_payment/
└── odoo_sample_module_analytics/
```

If the project has portal, demo, payment, reports, or other addons, pass
`--source-addons` in non-interactive advanced usage or add modules later with the
CLI.

## WPMoo Development Guidelines

The CLI keeps environment creation focused on Docker Compose resources, source
submodules, and WPMoo metadata. It does not install agent tools, editor setup,
doctor scripts, or other optional development packs.

If you want agent-assisted workflows inside a generated environment, install
and manage them manually in that environment. For example, Agentic Stack can be
installed separately:

```bash
brew tap codejunkie99/agentic-stack https://github.com/codejunkie99/agentic-stack
brew install agentic-stack
agentic-stack codex --yes
```

Keep these files under normal project review, just like any other generated or
tool-owned development guideline files.

## Notes

- V1 is overlay-first and uses WPMoo's Docker Compose resources by default.
- Product source repositories are managed as Git submodules under
  `odoo/custom/src/private`.
- Product source repositories are discovered from `odoo/custom/src/private` by
  the compose entrypoint and exposed through `/mnt/wpmoo-addons`.
- Empty source repos can be initialized with an empty commit and the selected
  Odoo branch when `--init-empty-repos` is provided.
- Missing GitHub repositories can be created with GitHub CLI when
  `--create-missing-repos` is provided, or through the interactive wizard.
- Legacy `--org`, `--community-repo`, and `--pro-repo` flags are still accepted
  when no `--source-repo-url` flags are provided.

## Release

For local publishing from the repository root, run:

```bash
./scripts/publish-release.sh
```

The script checks whether the current package version already exists on npm. If
it does, it runs a patch version bump without creating a git tag; if the version
is not published yet, it keeps the current version. It then runs
`npm test -- test/package.test.ts`, `npm pack --dry-run`, and
`npm publish --access public`.

For GitHub Actions publishing, configure npm Trusted Publishing for
`wpmoo-org/wpmoo-odoo` with workflow filename `publish.yml`, then run the
`Publish` workflow manually from GitHub Actions. The workflow uses OIDC instead
of an npm token, verifies typecheck/tests/build, fails if the package version
already exists on npm, runs `npm pack --dry-run`, and publishes to npm.

## Support

If this project helps you, you can support the work here:

<a href="https://www.buymeacoffee.com/cangir">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="250">
</a>
