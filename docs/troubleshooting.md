# Troubleshooting

This cookbook lists common WPMoo Toolkit failure states and the safest next
step for each one. Run commands from the generated environment root unless the
example explicitly starts with `npx @wpmoo/toolkit`.

## Docker Is Missing Or Stopped

Symptoms:

- The create wizard stops before writing files.
- `./moo start`, `./moo status`, or `./moo doctor` reports Docker or Docker
  Compose as unavailable.
- The cockpit disables database or module runtime actions because Docker,
  services, or the database are not ready.

Check:

```bash
docker version
docker compose version
```

Next steps:

1. Install Docker Desktop or another Docker Engine distribution.
2. Start Docker Desktop and wait until the engine is ready.
3. Open a new terminal if Docker was added to `PATH`.
4. Run the WPMoo command again.

The create wizard intentionally stops before setup questions when required
runtime tools are missing. That protects the workspace from half-created
environments.

If Docker is running but the cockpit says the database is not ready, wait for
PostgreSQL readiness or choose `Restart services`.

## No Modules Found

Symptoms:

- The cockpit disables module actions.
- `List modules`, `Install module`, `Update module`, `Run tests`, `Run
  environment lint`, `Generate POT`, or `Remove module` says no modules are
  available.

Check the source inventory:

```bash
./moo status
npx @wpmoo/toolkit source list
```

Next steps:

1. Add or sync a source repository.

   ```bash
   npx @wpmoo/toolkit add-repo --repo-url https://github.com/example-org/odoo-addons.git --source-type private
   npx @wpmoo/toolkit source sync
   ```

2. Add a new module skeleton if the repository exists but has no installable
   module yet.

   ```bash
   npx @wpmoo/toolkit add-module --repo odoo-addons --module moo_test --source-type private
   ```

3. Reopen the cockpit or run `./moo status` again.

Expected result:

- Module actions become selectable once at least one installable module is
  detected.
- If a module has no actionable Odoo menu, `status` reports it so you can fix
  the generated menu/action metadata.

## No Source Repositories

Symptoms:

- `source list` is empty.
- Module actions cannot find a target repository.
- The generated environment exists but `odoo/custom/src/private`,
  `odoo/custom/src/oca`, and `odoo/custom/src/external` contain no usable
  source checkout.

Check:

```bash
npx @wpmoo/toolkit source list --json
```

Next steps:

```bash
npx @wpmoo/toolkit add-repo --repo-url https://github.com/example-org/odoo-addons.git --source-type private
npx @wpmoo/toolkit source sync
```

Use `--source-type oca` or `--source-type external` when the repository belongs
outside the private source category.

## Dirty Module Deletion Is Refused

Symptoms:

- `remove-module` refuses to delete module files.
- The command reports local changes or an unsafe module worktree.

Check the source repository directly:

```bash
git -C odoo/custom/src/private/<repo> status --short
```

Next steps:

1. Commit, stash, or intentionally discard the local module changes from inside
   the source repository.
2. Re-run the removal.

   ```bash
   npx @wpmoo/toolkit remove-module --repo <repo> --module <module> --source-type private --delete-files
   ```

WPMoo refuses dirty deletion because module repositories are product source
code, not disposable generated files.

## Optional `wpmoo` Alias Reports E404

Symptoms:

- Release checks or manual npm checks report `wpmoo@<version>` as missing.
- Scoped packages are available.

Required packages:

```bash
npm view @wpmoo/toolkit@<version> version
npm view @wpmoo/odoo@<version> version
npm view @wpmoo/odoo-dev@<version> version
```

Interpretation:

- `@wpmoo/toolkit`, `@wpmoo/odoo`, and `@wpmoo/odoo-dev` are the supported
  release artifacts.
- The unscoped `wpmoo` short alias is best-effort. An E404 for `wpmoo` does not
  invalidate a release when the three scoped packages verify.

Use the supported package path in automation:

```bash
npx @wpmoo/toolkit --version
```

## Published Smoke Is Not Reproducible

Symptoms:

- Smoke succeeds once and fails later, or output differs between runs.
- The smoke step fails on one environment but not another with the same tag.

Use an explicit package spec so each smoke run uses the same published package
artifact:

```bash
VERSION="$(node -p "require('./package.json').version")"
WPMOO_PUBLISHED_PACKAGE_SPEC="@wpmoo/toolkit@$VERSION" \
  npm run smoke:published -- "$VERSION"
```

That script runs in temporary directories and uses a temporary npm cache when
`NPM_CONFIG_CACHE` is not already set. Set a fixed cache path only when you need
to reproduce with a shared cache.

For `1.0.0`, include generated-environment acceptance smoke:

```bash
WPMOO_SMOKE_ENVIRONMENT=1 WPMOO_PUBLISHED_PACKAGE_SPEC="@wpmoo/toolkit@$VERSION" \
  npm run smoke:published -- "$VERSION"
```

## PostgreSQL Diagnostics Are Unavailable

Symptoms:

- `./moo doctor --postgres` prints an advisory warning.
- `./moo doctor --json --postgres` includes `postgres.available: false`.

Check that services are running:

```bash
./moo status
./moo start
./moo doctor --postgres
```

Next steps:

1. Confirm the database service is running and reachable.
2. Run the JSON form to inspect the structured reason.

   ```bash
   ./moo doctor --json --postgres
   ```

3. Treat PostgreSQL diagnostics as advisory. WPMoo only runs read-only checks
   and does not tune PostgreSQL automatically.

Expected result when available:

- The JSON payload includes `postgres.contractVersion`.
- The diagnostics object includes `schemaVersion`.
- The optional `sections` array groups PostgreSQL warnings under the
  `postgresql` section while preserving the flat `warnings` array.
- Missing or malformed metric rows are reported as unavailable diagnostics
  instead of being treated as success.

## Stage Or Production Guard Failure

Symptoms:

- `install`, `update`, `test`, `resetdb`, or `restore-snapshot` is refused in
  `WPMOO_ENV=stage` or `WPMOO_ENV=prod`.
- The message names a required `WPMOO_ALLOW_*` flag.

Safe preview commands:

```bash
./moo restore-snapshot --dry-run <snapshot-name> devel
./moo doctor
./moo doctor --postgres
```

Intentional stage lifecycle command:

```bash
WPMOO_ENV=stage WPMOO_ALLOW_STAGE_LIFECYCLE=1 ./moo update <module> devel
```

Intentional production lifecycle command:

```bash
WPMOO_ENV=prod WPMOO_ALLOW_PROD_LIFECYCLE=1 ./moo test <module> --db devel
```

Intentional destructive command:

```bash
WPMOO_ENV=stage WPMOO_ALLOW_DESTRUCTIVE=1 WPMOO_ALLOW_NO_RECENT_SNAPSHOT=1 ./moo resetdb devel
```

Use the guard flag only when the command is intentional, reviewed, and has an
appropriate rollback path. Migration-risk lifecycle commands may also require
`WPMOO_ALLOW_MIGRATIONS=1`.
