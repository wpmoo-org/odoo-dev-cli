# TODO

## Doodba Developer Cockpit

Build these in order so each release stays small and easy to verify.

- [x] Packs infrastructure
  - [x] Add pack metadata to `.wpmoo/odoo-dev.json`.
  - [x] Add create-flow pack selection.
  - [x] Add non-interactive flags such as `--pack <name>` and `--no-packs`.
  - [x] Do not install external tools in this phase.

- [ ] Agentic Stack pack
  - [ ] Start with the Codex adapter only.
  - [ ] Detect whether `agentic-stack` is installed.
  - [ ] Offer installation guidance if it is missing.
  - [ ] Run the Codex adapter idempotently when selected.
  - [ ] Preserve `.agent` as the source of truth.
  - [ ] Treat `.agents/skills` as the Codex compatibility link to `.agent/skills`.
  - [ ] Continue environment creation if pack installation fails.

- [ ] Install/update packs menu action
  - [ ] Add a maintenance menu item for installing or updating packs after environment creation.
  - [ ] Re-run selected packs safely without overwriting user-owned changes.

- [ ] Doctor environment
  - [ ] Check environment metadata, Doodba files, submodules, `addons.yaml`, `moo`, and installed packs.
  - [ ] Report actionable fixes before mutating files.

- [ ] Daily actions
  - [ ] Add focused Doodba actions such as logs, restart, module tests, module update, shell, and psql.
