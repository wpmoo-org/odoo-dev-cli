# @wpmoo/create-odoo-dev

Create Doodba-ready Odoo development environment overlays.

The CLI expects source repositories to already exist. It creates development
environment files, adds source repositories as Git submodules, generates Doodba
`addons.yaml` and `repos.yaml`, then stages the result with `git add .`. It
does not commit.

## Usage

Interactive wizard:

```bash
npx @wpmoo/create-odoo-dev
```

Non-interactive:

```bash
npx @wpmoo/create-odoo-dev \
  --product moo_socialmedia_monitor \
  --odoo-version 19.0 \
  --dev-repo-url https://github.com/cangir/moo_socialmedia_monitor_dev.git \
  --source-repo-url https://github.com/wpmoo-org/moo_socialmedia_monitor.git \
  --target /Users/cng/projects/moo_socialmedia_monitor_dev \
  --init-empty-repos
```

Multiple source repositories:

```bash
npx @wpmoo/create-odoo-dev \
  --product moo_olympiad \
  --dev-repo-url https://github.com/cangir/moo_olympiad_dev.git \
  --source-repo-url https://github.com/wpmoo-org/moo_olympiad.git \
  --source-addons moo_olympiad,moo_olympiad_portal \
  --source-repo-url git@github.com:wpmoo-org/moo_olympiad_pro.git \
  --source-path moo_olympiad_pro \
  --source-addons moo_olympiad_payment,moo_olympiad_reports
```

Dry run:

```bash
npx @wpmoo/create-odoo-dev \
  --product moo_socialmedia_monitor \
  --dev-repo-url https://github.com/cangir/moo_socialmedia_monitor_dev.git \
  --source-repo-url https://github.com/wpmoo-org/moo_socialmedia_monitor.git \
  --target /tmp/moo_socialmedia_monitor_dev \
  --dry-run
```

## Defaults

Each source repo defaults to a single addon with the same name as its local
submodule folder. For example:

```text
private/moo_socialmedia_monitor:
  - moo_socialmedia_monitor
```

If the project has portal, demo, payment, reports, or other addons, pass them
explicitly with `--source-addons` or edit the wizard prompt.

## Notes

- V1 is overlay-first and does not run the official Doodba Copier template.
- Product source repositories are managed as Git submodules under
  `odoo/custom/src/private`.
- Product source repositories are intentionally not listed in `repos.yaml`.
- Empty source repos can be initialized with an empty commit and the selected
  Odoo branch when `--init-empty-repos` is provided.
- Legacy `--org`, `--community-repo`, and `--pro-repo` flags are still accepted
  when no `--source-repo-url` flags are provided.
