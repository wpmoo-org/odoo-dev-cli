# @wpmoo/odoo-dev

[![CI](https://github.com/wpmoo-org/odoo-dev-cli/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wpmoo-org/odoo-dev-cli/actions/workflows/ci.yml)

![WPMoo Workflow Platform - Micro Object Oriented](https://cdn.jsdelivr.net/npm/@wpmoo/odoo-dev/docs/assets/wpmoo-banner.png)

Create Odoo development environment overlays.

The CLI creates a Docker Compose based Odoo development environment, adds source
repositories as Git submodules, and stages the result with `git add .`. It does
not commit.

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
npx @wpmoo/odoo-dev
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
npx @wpmoo/odoo-dev create \
  --product odoo_sample_module \
  --odoo-version 19.0 \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --create-missing-repos \
  --init-empty-repos
```

Multiple source repositories:

```bash
npx @wpmoo/odoo-dev create \
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
npx @wpmoo/odoo-dev create \
  --product odoo_sample_module \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --dry-run
```

Default Docker Compose engine through an external standalone compose resource:

```bash
npx @wpmoo/odoo-dev create \
  --product odoo_sample_module \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --agent-skills-template
```

During local resource development, point to local clones of the standalone repos:

```bash
git clone https://github.com/wpmoo-org/odoo-docker-compose ../odoo-docker-compose
git clone https://github.com/wpmoo-org/odoo-skills ../odoo-skills

npx @wpmoo/odoo-dev create \
  --engine compose \
  --compose-template-url ../odoo-docker-compose \
  --agent-skills-template \
  --agent-skills-template-url ../odoo-skills \
  --product odoo_sample_module \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git
```

Add a source repository later from inside the dev environment:

```bash
npx @wpmoo/odoo-dev
```

Choose `Add source repo`, then enter only the repository name, such as
`odoo_sample_module_reports`. The CLI uses the environment's GitHub owner and
Odoo version, checks whether the repository exists, can create it with GitHub
CLI when needed, and initializes empty repositories with the environment Odoo
branch automatically.

Non-interactive URL form:

```bash
npx @wpmoo/odoo-dev add-repo \
  --repo-url https://github.com/example-org/odoo_sample_module_reports.git \
  --odoo-version 19.0 \
  --init-empty-repos
```

When run inside a generated environment, maintenance actions use the environment
Odoo version from `.wpmoo/odoo-dev.json`. Pass `--odoo-version` only when you
need an explicit override.

Remove a source repository from the dev environment:

```bash
npx @wpmoo/odoo-dev remove-repo --repo odoo_sample_module_reports
```

Add a minimal Odoo module skeleton to a selected source repository:

```bash
npx @wpmoo/odoo-dev add-module \
  --repo odoo_sample_module \
  --module odoo_sample_module_base \
  --odoo-version 19.0
```

Remove a module registration without deleting source files:

```bash
npx @wpmoo/odoo-dev remove-module \
  --repo odoo_sample_module \
  --module odoo_sample_module_base
```

Refresh generated environment files without deleting module source code:

```bash
npx @wpmoo/odoo-dev reset
```

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
