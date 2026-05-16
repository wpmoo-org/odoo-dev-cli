# Generated Environment Verification Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable verification matrix for generated WPMoo Odoo environments without requiring real Docker, GitHub, or network access in CI.

**Architecture:** Cover generated environments through behavior-focused Vitest tests and a short operator-facing matrix document. Tests should build disposable environments under the OS temp directory, use local compose fixtures or command runners, and verify the contracts users rely on: scaffolded files, local `./moo` commands, doctor checks, and maintenance lifecycle flows.

**Tech Stack:** TypeScript, Vitest, Node `fs/promises`, local Git fixtures where needed, Bash script execution through `execa`.

---

## File Ownership

- Worker A owns `test/generated-environment-scaffold.test.ts`.
- Worker B owns `test/generated-environment-moo.test.ts`.
- Worker C owns `test/generated-environment-doctor-matrix.test.ts`.
- Worker D owns `test/generated-environment-lifecycle.test.ts`.
- Worker E owns `docs/generated-environment-verification.md` and `README.md`.
- Coordinator owns final integration, optional cleanup, `WORKSPACE.md`, final verification, commit, and push.

Workers must not edit production source unless their tests reveal a real defect. If a production fix is needed, report `BLOCKED` or `DONE_WITH_CONCERNS` with the exact failing contract and proposed minimal fix.

## Shared Test Constraints

- Do not depend on the sibling `../odoo-docker-compose` repository in automated tests; CI for `wpmoo-toolkit` may only check out this child repo.
- Do not call real Docker, GitHub, npm registry, or public network services.
- Use temp directories created with `mkdtemp(join(tmpdir(), "..."))`.
- Use local compose fixtures with at least:
  - `docker-compose_19.0.yml`
  - `docker-compose_18.0.yml` when testing `.env` version switching
  - `scripts/up.sh`, `scripts/down.sh`, `scripts/logs.sh`, `scripts/restart.sh`, `scripts/shell.sh`, `scripts/psql.sh`, `scripts/install.sh`, `scripts/update.sh`, `scripts/test.sh`, `scripts/resetdb.sh`, `scripts/snapshot.sh`, `scripts/restore-snapshot.sh`, `scripts/lint.sh`, `scripts/pot.sh`
  - `etc/odoo.conf`
  - `README.md`
- Prefer focused new test files over broad edits to already-large test files.

## Task A: Scaffold Output Matrix

**Files:**
- Create: `test/generated-environment-scaffold.test.ts`

- [ ] **Step 1: Write tests for actual scaffold output with local compose fixture**

Create a local fixture writer in the test file:

```ts
async function writeComposeFixture(root: string): Promise<string> {
  const fixture = join(root, "compose-fixture");
  await mkdir(join(fixture, "scripts"), { recursive: true });
  await mkdir(join(fixture, "etc"), { recursive: true });
  await writeFile(join(fixture, "docker-compose_19.0.yml"), "services:\n  odoo:\n    image: odoo:19\n", "utf8");
  await writeFile(join(fixture, "etc/odoo.conf"), "[options]\naddons_path = /mnt/wpmoo-addons\n", "utf8");
  await writeFile(join(fixture, "README.md"), "# Compose Fixture\n", "utf8");
  for (const script of scriptNames) {
    await writeFile(join(fixture, "scripts", script), "#!/usr/bin/env bash\nexit 0\n", "utf8");
  }
  return fixture;
}
```

Test expectations:
- `scaffold({ skipSubmodules: true, stage: false, composeTemplateUrl: fixture })` writes `.wpmoo/odoo.json`, `moo`, `README.md`, `AGENTS.md`, `docs/appstore-release.md`, `.env.example`, `docker-compose_19.0.yml`, `docs/compose.md`, `etc/odoo.conf`, and every daily action script.
- `moo` has executable owner bits.
- `.wpmoo/odoo.json` records `engine: "compose"`, `odooVersion`, source repos, compose template URL, and addon names.
- `.env.example` includes `ODOO_VERSION=19.0`, selected postgres default, and `ODOO_TEST_MODULE=<first addon>`.
- `docs/compose.md` contains the fixture README content.

- [ ] **Step 2: Run focused test**

Run:

```bash
npx vitest run test/generated-environment-scaffold.test.ts
```

Expected: PASS.

## Task B: Local `./moo` Delegation Matrix

**Files:**
- Create: `test/generated-environment-moo.test.ts`

- [ ] **Step 1: Write tests that execute the generated `moo` script**

Use `renderMooDelegationScript()` or a scaffolded temp environment. Create executable stub scripts under `scripts/` that append their basename and arguments to a log file. Execute `./moo` with `execa`.

Cover these contracts:
- `./moo start` executes `scripts/up.sh` with no args.
- `./moo logs` defaults to `scripts/logs.sh odoo`.
- `./moo logs db` executes `scripts/logs.sh db`.
- `./moo test sale --db devel --mode update --tags /sale` delegates all args to `scripts/test.sh`.
- `./moo restore-snapshot snap1 devel` delegates to `scripts/restore-snapshot.sh snap1 devel`.
- `./moo doctor` falls back to `npx --yes @wpmoo/toolkit@latest doctor`; stub `npx` in `PATH` and assert the arguments.
- Invalid usage, for example `./moo start extra`, exits with code `2` and prints `Usage: ./moo start`.
- Missing target daily script exits with code `1` and prints `Missing daily action script: scripts/<name>.sh`.

- [ ] **Step 2: Run focused test**

Run:

```bash
npx vitest run test/generated-environment-moo.test.ts
```

Expected: PASS.

## Task C: Doctor Health Matrix

**Files:**
- Create: `test/generated-environment-doctor-matrix.test.ts`

- [ ] **Step 1: Write tests around generated environment doctor checks**

Build temp environments from local fixture files or direct writes. Use `runDoctor(target, runner)` with a fake runner.

Cover these contracts:
- A complete generated compose environment passes with:
  - `OK metadata .wpmoo/odoo.json`
  - `OK engine compose`
  - `OK compose docker-compose_19.0.yml`
  - `OK scripts 14 checked`
  - `OK docker CLI`
  - `OK docker compose`
  - `Doctor checks passed.`
- `.env` with `ODOO_VERSION=18.0` requires both `docker-compose_19.0.yml` and `docker-compose_18.0.yml`.
- Invalid `.env` ports produce doctor failure with `Invalid HTTP_PORT...` or `HTTP_PORT and GEVENT_PORT...`.
- Missing one daily action script fails with `Missing daily action script: scripts/<script>`.
- GitHub auth runner failure is a warning, not a hard failure.
- Source submodule status output with `-<sha> odoo/custom/src/private/<repo>` fails as uninitialized.

- [ ] **Step 2: Run focused test**

Run:

```bash
npx vitest run test/generated-environment-doctor-matrix.test.ts
```

Expected: PASS.

## Task D: Lifecycle And Maintenance Matrix

**Files:**
- Create: `test/generated-environment-lifecycle.test.ts`

- [ ] **Step 1: Write tests for generated environment lifecycle operations**

Use local bare Git remotes and the same fixture strategy as existing `test/git-integration.test.ts`, but keep this file focused on user workflows:
- Create a dev environment with `scaffold` and `skipSubmodules: false`.
- Commit the initial environment.
- Run `addModuleRepo` for a second source repo and assert:
  - `.gitmodules` contains the new submodule path.
  - `listModuleRepos(target)` returns both repos.
  - `etc/odoo.conf` still contains `/mnt/wpmoo-addons`.
- Create a module directory with `__manifest__.py`, run `addModuleToSourceRepo`, and assert the module file exists under the source repo.
- Run `removeModuleFromSourceRepo` with `deleteFiles: false` and assert the source module directory remains.
- Run `safeResetEnvironment({ target, stage: false })` and assert generated files refresh while source repo directories remain.

Do not start Docker containers. Use Git only through local temp repositories.

- [ ] **Step 2: Run focused test**

Run:

```bash
npx vitest run test/generated-environment-lifecycle.test.ts
```

Expected: PASS.

## Task E: Operator Matrix Documentation

**Files:**
- Create: `docs/generated-environment-verification.md`
- Modify: `README.md`

- [ ] **Step 1: Document the generated environment verification matrix**

Create a concise document with these sections:
- Scope: disposable generated environments, no staging/production.
- Command split: `npx @wpmoo/toolkit ...` for package/operator commands, `./moo ...` inside generated environments for daily commands.
- Matrix table:
  - Scaffold files and metadata
  - Compose resource files
  - `./moo` delegation
  - Doctor checks
  - Source repo add/remove
  - Module add/remove
  - Safe reset
  - Snapshot/restore and lint/pot are delegated to compose scripts
- Local verification commands:
  - `npm run typecheck`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`

Add a short README link near the maintenance/doctor section.

- [ ] **Step 2: Run doc sanity check**

Run:

```bash
rg -n "Generated environment verification|generated-environment-verification" README.md docs/generated-environment-verification.md
```

Expected: both files are matched.

## Final Coordinator Verification

After workers finish:

- [ ] Review all diffs and confirm production source changes are absent unless justified by a failing contract.
- [ ] Run focused tests for each new matrix file.
- [ ] Run:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
```

- [ ] Commit with:

```bash
git add test/generated-environment-scaffold.test.ts test/generated-environment-moo.test.ts test/generated-environment-doctor-matrix.test.ts test/generated-environment-lifecycle.test.ts docs/generated-environment-verification.md README.md
git commit -m "test: add generated environment verification matrix"
```

- [ ] Push `main`.
- [ ] Check GitHub Actions CI and confirm the Coveralls upload step succeeds.
