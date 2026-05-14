# TODO

## Compose Environment Workflow

Build these in order so each release stays small and easy to verify.

- [x] Remove development packs from the CLI
  - [x] Remove create-flow pack selection.
  - [x] Remove `--pack` and `--no-packs`.
  - [x] Stop writing pack metadata to `.wpmoo/odoo.json`.
  - [x] Document optional agent tools as manual WPMoo development guidelines.

- [ ] Daily actions
  - [ ] Add focused actions such as logs, restart, module tests, module update, shell, and psql.
