# AGENTS.md

Guidance for coding agents working in this repository.

## Project overview

- Package: `@wpmoo/odoo-dev`
- Purpose: TypeScript Node CLI for creating and maintaining Odoo development environment overlays with Docker Compose defaults and optional external standalone resources.
- Runtime: Node.js `>=20`, ESM (`"type": "module"`).
- Source code lives in `src/`; tests live in `test/`.
- Built files are emitted to `dist/` and should not be edited by hand.

## Common commands

Run these before handing off code changes when relevant:

```bash
npm test
npm run typecheck
npm run build
```

Useful focused commands:

```bash
npx vitest run test/<file>.test.ts
```

## Code style and conventions

- Use TypeScript with strict checking.
- Keep ESM import specifiers for local TypeScript files ending in `.js`, e.g. `import { x } from './file.js';`.
- Prefer small, pure helper functions in focused modules.
- Preserve existing CLI behavior and interactive prompt wording unless the task explicitly changes it.
- Avoid adding new runtime dependencies unless necessary.
- Use Node built-ins with `node:` prefixes.
- Keep generated/environment templates deterministic so tests can compare exact output.
- Do not embed large Agent Skill or Docker Compose resource bodies in TypeScript; keep them in standalone resource seeds under `templates/` or future standalone repos/packages.

## Testing guidance

- Add or update Vitest tests for behavior changes.
- For argument parsing, update tests in `test/args.test.ts`.
- For environment detection/context/version changes, check the corresponding `test/environment*.test.ts` files.
- For scaffold/template output, update `test/scaffold.test.ts` and/or `test/templates.test.ts`.
- For external resource copying/orchestration, update `test/external-assets.test.ts` and `test/repo-actions.test.ts` when relevant.
- For git/GitHub behavior, prefer mockable helpers and update existing tests rather than shelling out directly.

## Repository behavior notes

- The CLI stages generated results with `git add .` but does not commit.
- Source repositories are managed as Git submodules under `odoo/custom/src/private`.
- Product source repositories are intentionally not listed in `repos.yaml` for the Doodba-compatible engine.
- Compose engine resources are copied by the CLI and expose WPMoo source submodule addons through `/mnt/wpmoo-addons`.
- Maintenance commands rely on `.wpmoo/odoo-dev.json` inside generated environments.

## Agent workflow

- Inspect existing tests and implementations before changing behavior.
- Keep edits minimal and localized.
- Do not modify `package-lock.json` unless dependency changes require it.
- Do not commit changes unless explicitly asked.
