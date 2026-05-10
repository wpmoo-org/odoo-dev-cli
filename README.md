# @wpmoo/odoo-dev

Create Doodba-ready Odoo development environment overlays.

The CLI creates development environment files, adds source repositories as Git
submodules, generates Doodba `addons.yaml` and `repos.yaml`, then stages the
result with `git add .`. It does not commit.

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

Add a source repository later from inside the dev environment:

```bash
npx @wpmoo/odoo-dev add-repo \
  --repo-url https://github.com/example-org/odoo_sample_module_reports.git \
  --odoo-version 19.0 \
  --init-empty-repos
```

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

Remove a module from `addons.yaml` without deleting source files:

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
private/odoo_sample_module:
  - odoo_sample_module_base
  - odoo_sample_module_another_module

private/odoo_sample_module_pro:
  - odoo_sample_module_payment
  - odoo_sample_module_analytics
```

If the project has portal, demo, payment, reports, or other addons, add them
later in Doodba's `odoo/custom/src/addons.yaml`, or pass `--source-addons` in
non-interactive advanced usage.

## Notes

- V1 is overlay-first and does not run the official Doodba Copier template.
- Product source repositories are managed as Git submodules under
  `odoo/custom/src/private`.
- Product source repositories are intentionally not listed in `repos.yaml`.
- Empty source repos can be initialized with an empty commit and the selected
  Odoo branch when `--init-empty-repos` is provided.
- Missing GitHub repositories can be created with GitHub CLI when
  `--create-missing-repos` is provided, or through the interactive wizard.
- Legacy `--org`, `--community-repo`, and `--pro-repo` flags are still accepted
  when no `--source-repo-url` flags are provided.
