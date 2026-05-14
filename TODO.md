# TODO

## Compose Environment Workflow

Build these in order so each release stays small and easy to verify.

- [x] Remove development packs from the CLI
  - [x] Remove create-flow pack selection.
  - [x] Remove `--pack` and `--no-packs`.
  - [x] Stop writing pack metadata to `.wpmoo/odoo.json`.
  - [x] Document optional agent tools as manual WPMoo development guidelines.

- [x] Daily actions
  - [x] Add focused actions for logs, restart, shell, psql, module install, module update, and module tests.
