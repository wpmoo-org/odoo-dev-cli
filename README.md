# @wpmoo/create-odoo-dev

Create Doodba-ready Odoo development environment overlays.

The CLI creates development environment files, adds source repositories as Git
submodules, generates Doodba `addons.yaml` and `repos.yaml`, then stages the
result with `git add .`. It does not commit.

For a product named `odoo_sample_module`, create these repositories first:

```text
odoo_sample_module_dev  # private development environment repo
odoo_sample_module      # module source repo
```

The CLI writes into `./odoo_sample_module_dev`. If that directory does not exist
locally, it clones the dev repo URL you provide.

When GitHub CLI is installed and authenticated, the interactive wizard checks
whether the dev and module repositories are accessible. If they are not
accessible, it can create them for you after confirmation.

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
npx @wpmoo/create-odoo-dev
```

Non-interactive:

```bash
npx @wpmoo/create-odoo-dev \
  --product odoo_sample_module \
  --odoo-version 19.0 \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --create-missing-repos \
  --init-empty-repos
```

Multiple source repositories:

```bash
npx @wpmoo/create-odoo-dev \
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
npx @wpmoo/create-odoo-dev \
  --product odoo_sample_module \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git \
  --dry-run
```

## Defaults

Each source repo defaults to a single addon with the same name as its local
submodule folder. For example:

```text
private/odoo_sample_module:
  - odoo_sample_module
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
