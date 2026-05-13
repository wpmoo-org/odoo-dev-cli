# Handoff Notes

## Current status

- Package version was bumped from `0.8.25` to `0.8.26`.
- Latest commit:
  - `dd2e1e8 Use standalone compose resources by default`
- NPM publish was attempted but did not complete because this machine is not authenticated with npm.

## What changed

- Docker Compose is now the default environment engine.
- Doodba is no longer the default path; it remains only as a legacy `--engine doodba` option.
- `odoo-dev-cli` no longer reads compose/skill resources from its own `templates/` directory.
- External resources are copied from standalone repositories by default:
  - `gh:wpmoo-org/odoo-docker-compose`
  - `gh:wpmoo-org/odoo-skills`
- The local `templates/` directory was removed from this repo.
- New external resource copy logic was added:
  - `src/external-assets.ts`
  - `src/external-templates.ts`
- Project-local Odoo skills are copied from the `skills/` subdirectory into:
  - `.agents/skills/`
- Compose resources are copied into the generated environment, while their README is preserved as:
  - `docs/compose.md`

## Created GitHub repositories

- `https://github.com/wpmoo-org/odoo-skills`
  - Public
  - Intended package name: `@wpmoo/odoo-skills`
  - Topics: `agent-skills`, `oca`, `odoo`, `pi-package`, `wpmoo`
- `https://github.com/wpmoo-org/odoo-docker-compose`
  - Public
  - Standalone Docker Compose files for Odoo 17, 18, and 19
  - Topics: `docker-compose`, `odoo`, `odoo-development`, `wpmoo`

## Test environment created

A test environment was generated at:

```text
/Users/cng/wpmoo-org/wpmoo-test/moo_test_dev
```

The command used was:

```bash
node /Users/cng/wpmoo-org/odoo-dev-cli/dist/cli.js create \
  --product moo_test \
  --dev-repo-url https://github.com/wpmoo-org/moo_test_dev.git \
  --source-repo-url https://github.com/wpmoo-org/moo_test.git \
  --agent-skills-template \
  --init-empty-repos \
  --stage=true \
  --no-update-check
```

Validation run there:

```bash
docker compose -f docker-compose_19.0.yml config
```

Result: passed.

Note: the existing `moo_test_dev` repo had an old `moo_test_pro` submodule. It was removed from the working tree during the test. Changes are staged in that test repo but were not committed/pushed.

## Checks already run

From this repository:

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run --json
```

Result: all passed.

## Publish status

Publish command attempted:

```bash
npm publish --access public
```

It failed with:

```text
npm error ENEEDAUTH
You need to authorize this machine using `npm adduser`
```

Next step:

```bash
npm login
npm publish --access public
```

## Suggested next steps

1. Authenticate npm on this machine:

   ```bash
   npm login
   ```

2. Publish `@wpmoo/odoo-dev@0.8.26`:

   ```bash
   npm publish --access public
   ```

3. Optionally commit/push the test environment in:

   ```text
   /Users/cng/wpmoo-org/wpmoo-test/moo_test_dev
   ```

4. Consider publishing `@wpmoo/odoo-skills` from the standalone `odoo-skills` repo later.

5. Continue improving `wpmoo-org/odoo-docker-compose`, especially future Traefik/reverse-proxy overlays.
