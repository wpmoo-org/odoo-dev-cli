# @wpmoo/create-odoo-dev

Create Doodba-ready Odoo development environment overlays.

The CLI expects GitHub repositories to already exist. It creates the WPMoo
environment files, adds community/pro source repositories as Git submodules,
generates Doodba `addons.yaml` and `repos.yaml`, then stages the result with
`git add .`. It does not commit.

## Usage

Interactive wizard:

```bash
npx @wpmoo/create-odoo-dev
```

Non-interactive:

```bash
npx @wpmoo/create-odoo-dev \
  --product moo_olympiad \
  --org wpmoo-org \
  --odoo-version 19.0 \
  --dev-repo moo_olympiad_dev \
  --community-repo moo_olympiad \
  --pro-repo moo_olympiad_pro \
  --target /Users/cng/wpmoo-org/moo_olympiad_dev \
  --init-empty-repos
```

Dry run:

```bash
npx @wpmoo/create-odoo-dev \
  --product moo_olympiad \
  --target /tmp/moo_olympiad_dev \
  --dry-run
```

## Defaults

For `--product moo_olympiad`, default community addons are:

```text
moo_olympiad
moo_olympiad_portal
moo_olympiad_demo
```

Default pro addons are:

```text
moo_olympiad_payment
moo_olympiad_reports
moo_olympiad_analytics
moo_olympiad_pro
```

## Notes

- V1 is overlay-first and does not run the official Doodba Copier template.
- Product source repositories are managed as Git submodules under
  `odoo/custom/src/private`.
- Product source repositories are intentionally not listed in `repos.yaml`.
- Empty source repos can be initialized with an empty commit and the selected
  Odoo branch when `--init-empty-repos` is provided.

