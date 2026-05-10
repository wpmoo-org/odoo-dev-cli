# TODO

## Doodba Developer Cockpit

Build these in order so each release stays small and easy to verify.

- [x] Packs infrastructure
  - [x] Add pack metadata to `.wpmoo/odoo-dev.json`.
  - [x] Add create-flow pack selection.
  - [x] Add non-interactive flags such as `--pack <name>` and `--no-packs`.
  - [x] Do not install external tools in this phase.

- [x] Agentic Stack pack
  - [x] Start with the Codex adapter only.
  - [x] Detect whether `agentic-stack` is installed.
  - [x] Offer installation guidance if it is missing.
  - [x] Run the Codex adapter idempotently when selected.
  - [x] Preserve `.agent` as the source of truth.
  - [x] Treat `.agents/skills` as the Codex compatibility link to `.agent/skills`.
  - [x] Continue environment creation if pack installation fails.

- [ ] Install/update packs menu action
  - [ ] Add a maintenance menu item for installing or updating packs after environment creation.
  - [ ] Re-run selected packs safely without overwriting user-owned changes.

- [ ] Doctor environment
  - [ ] Check environment metadata, Doodba files, submodules, `addons.yaml`, `moo`, and installed packs.
  - [ ] Report actionable fixes before mutating files.

- [ ] Daily actions
  - [ ] Add focused Doodba actions such as logs, restart, module tests, module update, shell, and psql.
