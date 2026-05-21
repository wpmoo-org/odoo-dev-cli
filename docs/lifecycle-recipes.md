# Lifecycle Recipes

These recipes show WPMoo Toolkit as a sequence of Dev, Stage, and Production
workflows. Replace repository names, module names, and database names with your
project values.

## Local Development Setup

Create a generated environment from a workspace directory:

```bash
npx @wpmoo/toolkit create \
  --product odoo_sample_module \
  --odoo-version 19.0 \
  --target ./odoo_sample_module_dev \
  --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \
  --source-repo-url https://github.com/example-org/odoo_sample_module.git
```

Enter the environment and start daily work:

```bash
cd odoo_sample_module_dev
./moo start
./moo status
./moo doctor
```

Use the cockpit for interactive workflows:

```bash
./moo
```

## Add A Source Repository

Add a private source repository:

```bash
npx @wpmoo/toolkit add-repo \
  --repo-url https://github.com/example-org/odoo-addons.git \
  --source-type private
```

Refresh the source manifest:

```bash
npx @wpmoo/toolkit source sync
npx @wpmoo/toolkit source list
```

Use `--source-type oca` for OCA repositories and `--source-type external` for
third-party repositories.

## Add A Module

Create a module skeleton:

```bash
npx @wpmoo/toolkit add-module \
  --repo odoo-addons \
  --module moo_test \
  --source-type private
```

Verify the generated module:

```bash
./moo status
./moo lint
```

Expected module files include `__manifest__.py`, model imports, security access
CSV, views, menus, and a post-install TransactionCase smoke test.

## Install And Update A Module

Start services and install the module into the development database:

```bash
./moo start
./moo install moo_test devel
```

After code changes, update the module:

```bash
./moo update moo_test devel
```

If the cockpit shows module actions as disabled, run:

```bash
./moo status
npx @wpmoo/toolkit source list
```

Then add or sync source repositories until installable modules are detected.

## Run Tests

Run module tests in development:

```bash
./moo test moo_test --db devel
```

Use explicit test mode when needed:

```bash
./moo test moo_test --db devel --mode update --tags /moo_test
```

For production, test execution is guarded:

```bash
WPMOO_ENV=prod WPMOO_ALLOW_PROD_LIFECYCLE=1 ./moo test moo_test --db devel
```

## Snapshot And Restore

Take a snapshot before risky changes:

```bash
./moo snapshot devel before-moo-test-update
```

Preview a restore:

```bash
./moo restore-snapshot --dry-run before-moo-test-update devel
```

Restore intentionally:

```bash
WPMOO_ENV=stage WPMOO_ALLOW_DESTRUCTIVE=1 ./moo restore-snapshot before-moo-test-update devel
```

When the no-recent-snapshot guard applies to a destructive command, either make
a fresh snapshot or set `WPMOO_ALLOW_NO_RECENT_SNAPSHOT=1` after review.

## Stage Dry-Run Validation

Use stage for preview-first validation:

```bash
WPMOO_ENV=stage ./moo doctor
WPMOO_ENV=stage ./moo doctor --postgres
WPMOO_ENV=stage ./moo restore-snapshot --dry-run before-moo-test-update devel
```

Run lifecycle commands only after review:

```bash
WPMOO_ENV=stage WPMOO_ALLOW_STAGE_LIFECYCLE=1 ./moo update moo_test devel
```

If migration scripts are detected, WPMoo may also require:

```bash
WPMOO_ENV=stage WPMOO_ALLOW_STAGE_LIFECYCLE=1 WPMOO_ALLOW_MIGRATIONS=1 ./moo update moo_test devel
```

## Production-Safe Preview

Production workflows should start with read-only checks:

```bash
WPMOO_ENV=prod ./moo status
WPMOO_ENV=prod ./moo doctor
WPMOO_ENV=prod ./moo doctor --postgres
WPMOO_ENV=prod ./moo restore-snapshot --dry-run before-change devel
```

Production lifecycle commands require explicit approval flags:

```bash
WPMOO_ENV=prod WPMOO_ALLOW_PROD_LIFECYCLE=1 ./moo update moo_test devel
```

Destructive production commands require a separate flag and a rollback plan:

```bash
WPMOO_ENV=prod WPMOO_ALLOW_DESTRUCTIVE=1 ./moo restore-snapshot before-change devel
```

Do not set production flags globally in a shell profile. Prefer one-command
environment variable prefixes so intent is visible in shell history.

