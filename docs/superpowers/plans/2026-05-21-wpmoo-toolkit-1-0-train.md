# WPMoo Toolkit 1.0 Stability Train Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for each train unless the train has only one tightly coupled task. Use one fresh codex-spark worker per independent workstream, review each worker's patch, and never let workers edit the same files at the same time. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `wpmoo-toolkit` from the current pre-1.0 line to a stable, test-backed Odoo lifecycle tool with reliable cockpit UX, safer generated environments, stronger Stage/Production guardrails, deeper read-only PostgreSQL diagnostics, and release-ready documentation.

**Architecture:** The work is split into eight release trains. Each train is a bounded batch of related user-facing improvements and hardening work. Each item inside a train must be implemented on its own `feature/<short-topic>` branch or isolated worktree, verified with focused Vitest files first, then merged into `main` only after the full gate passes.

**Tech Stack:** TypeScript, Node.js 20.17+, Vitest, GitHub Actions Trusted Publishing, npm scoped packages (`@wpmoo/toolkit`, `@wpmoo/odoo`, `@wpmoo/odoo-dev`), Docker Compose based generated Odoo environments, PostgreSQL diagnostics through read-only SQL.

---

## Execution Contract

When the user says **"next train"**, execute the next incomplete train from this document end-to-end:

1. Create a short train branch or one branch per item, depending on conflict risk.
2. Dispatch enough codex-spark subagents for independent analysis or implementation slices.
3. Keep each worker scoped to a disjoint file set.
4. Write or update failing tests before implementation where behavior changes.
5. Run focused tests after each item.
6. Run the full gate before merging a train into `main`:
   ```bash
   npm run typecheck
   npm test
   npm run build
   git diff --check
   ```
7. Commit and push all accepted feature branches.
8. Fast-forward or merge verified work into `main`.
9. Run `npm run release:check`.
10. If `release:check` bumps package files, commit and push the bump, then rerun the full gate and `release:check`.
11. If the train changes user-facing CLI behavior, generated-environment behavior, Stage/Production guardrails, diagnostics JSON contracts, scaffold output, or release workflow behavior, tag and push:
    ```bash
    git tag v$(node -p "require('./package.json').version")
    git push origin v$(node -p "require('./package.json').version")
    ```
12. Verify GitHub Actions publish and npm artefacts:
    ```bash
    gh run list --workflow publish.yml --limit 5
    npm view @wpmoo/toolkit@$(node -p "require('./package.json').version") version
    npm view @wpmoo/odoo@$(node -p "require('./package.json').version") version
    npm view @wpmoo/odoo-dev@$(node -p "require('./package.json').version") version
    npm run smoke:published
    ```
13. Treat `wpmoo@<version>` E404 as a non-blocking warning while scoped artefacts verify.

Do not run `npm publish` manually unless the user explicitly asks for a manual fallback.

## Shared Files And Ownership Map

- `src/cockpit/*`: cockpit command registry, top-level menu, palette, module browser, safety prompts.
- `src/prompts/index.ts`: prompt adapter and Inquirer integration. Any change here needs prompt adapter tests.
- `src/cli.ts`: direct command routing and cockpit loop. Any change here needs route tests.
- `src/status.ts`: environment status and JSON output.
- `src/doctor.ts`: human and JSON diagnostics, including PostgreSQL diagnostics.
- `src/daily-actions.ts`: generated `./moo` action execution.
- `src/templates.ts`: generated environment scripts and files.
- `src/module-actions.ts`: module scaffold, list, add, remove, and source manifest integration.
- `src/module-quality.ts`: generated module quality checks.
- `src/source-manifest.ts`: source repository metadata and module registration.
- `src/service-runtime-status.ts`: Docker/Odoo service runtime status.
- `src/safe-reset.ts`: generated file recovery and preview behavior.
- `src/databases.ts`: PostgreSQL/database helper commands.
- `test/*.test.ts`: focused Vitest coverage. Add tests near the behavior being changed.
- `docs/*.md` and `README.md`: user-facing documentation.
- `.github/workflows/publish.yml`: release workflow. Modify only when release behavior changes.

## Train 1: Stability And Regression Lock

**Goal:** Freeze the most fragile user-facing behavior before adding large features.

**Subagent split:**
- Worker A: cockpit disabled/empty-state matrix (`src/cockpit/*`, `test/cli-cockpit-categories.test.ts`, `test/cli-menu-empty-states.test.ts`).
- Worker B: CLI route parity (`src/cli.ts`, `test/cli-menu-routes.test.ts`, `test/cli-direct-routes.test.ts`).
- Worker C: prompt adapter stability (`src/prompts/index.ts`, `test/prompt-adapter.test.ts`, `test/menu-navigation.test.ts`).
- Worker D: error surface standard (`src/cli.ts`, `src/help.ts`, `test/cli*.test.ts`).

### Item 1.1: Cockpit Disabled-State Contract

**Intent:** Lock the rule that disabled rows stay compact and the bottom error shows only the active disabled item reason.

**Files:**
- Modify: `src/cockpit/menu.ts`
- Modify: `src/prompts/index.ts`
- Test: `test/cli-cockpit-categories.test.ts`
- Test: `test/prompt-adapter.test.ts`

**Steps:**
- [ ] Add table-driven tests for every disabled reason: `Already running.`, `Services stopped.`, `Docker not running.`, `No modules found.`
- [ ] Assert disabled rows do not render reason suffixes in `theme.style.disabled`.
- [ ] Assert `theme.i18n.disabledError` includes only the active disabled item reason after rendering the active row.
- [ ] Assert inactive disabled reasons do not leak into the active error message.
- [ ] Run:
  ```bash
  npx vitest run test/prompt-adapter.test.ts test/cli-cockpit-categories.test.ts
  ```

**Acceptance:**
- No menu row repeats `No modules found.`
- Selecting `Install module` with zero modules shows only `Reason: No modules found.`
- Selecting `Start services` while services are running shows only `Reason: Already running.`

### Item 1.2: Empty-State Matrix

**Intent:** Make cockpit behavior deterministic for empty or unavailable resources.

**Files:**
- Modify: `src/cockpit/menu.ts`
- Modify: `src/cli.ts`
- Test: `test/cli-menu-empty-states.test.ts`
- Test: `test/cli-cockpit-categories.test.ts`

**Scenarios to cover:**
- Environment has zero source repositories.
- Environment has one source repository and zero modules.
- Services are stopped.
- Docker is not running.
- No snapshots exist.
- No database name can be resolved.

**Steps:**
- [ ] Add a semantic choice matrix helper in tests that extracts `command.id`, category, disabled state, and expected reason.
- [ ] Verify `add-repo` remains enabled when there are no repositories.
- [ ] Verify `add-module` is disabled only when there are no source repositories.
- [ ] Verify `list-modules`, `install`, `update`, `test`, `lint`, `pot`, and `remove-module` are disabled when module count is zero.
- [ ] Verify `restore-snapshot` is disabled when no snapshots exist after snapshot discovery exists.
- [ ] Run:
  ```bash
  npx vitest run test/cli-menu-empty-states.test.ts test/cli-cockpit-categories.test.ts
  ```

**Acceptance:**
- Empty states are expressed as disabled menu choices with actionable selected-item reasons.
- Direct commands still return clear notes or errors instead of silently doing nothing.

### Item 1.3: Command Routing Parity

**Intent:** Ensure cockpit choices and direct commands call the same backend behavior.

**Files:**
- Modify: `src/cli.ts`
- Test: `test/cli-menu-routes.test.ts`
- Test: `test/cli-direct-routes.test.ts`
- Test: `test/cli-cockpit-daily-actions.test.ts`

**Commands to include:**
- `start`
- `stop`
- `restart`
- `logs`
- `shell`
- `list-modules`
- `install`
- `update`
- `test`
- `lint`
- `pot`
- `add-module`
- `remove-module`
- `psql`
- `snapshot`
- `restore-snapshot`
- `resetdb`
- `status`
- `doctor`
- `add-repo`
- `remove-repo`
- `safe-reset`

**Steps:**
- [ ] Add a route parity fixture mapping command ids to backend mock calls.
- [ ] Add direct command tests for any command not already covered.
- [ ] Add cockpit selection tests for the same command ids.
- [ ] Assert cockpit and direct command routes pass matching options to backend helpers.
- [ ] Run:
  ```bash
  npx vitest run test/cli-menu-routes.test.ts test/cli-direct-routes.test.ts test/cli-cockpit-daily-actions.test.ts
  ```

**Acceptance:**
- No cockpit-only behavior differs from direct CLI behavior unless a test explicitly documents the reason.

### Item 1.4: Prompt Adapter Stability

**Intent:** Prevent Inquirer upgrades from breaking hidden prompts, disabled rows, escape handling, and navigation warnings.

**Files:**
- Modify: `src/prompts/index.ts`
- Test: `test/prompt-adapter.test.ts`
- Test: `test/menu-navigation.test.ts`

**Steps:**
- [ ] Add tests for hidden message, cursor icon, disabled styling, keys help, back-navigation help, escape ignore, and ctrl+c cancel.
- [ ] Add tests for `disabled` boolean and `disabled` string choices.
- [ ] Add tests proving `navigationWarning` function output is evaluated at render time.
- [ ] Run:
  ```bash
  npx vitest run test/prompt-adapter.test.ts test/menu-navigation.test.ts
  ```

**Acceptance:**
- Prompt behavior is covered as a stable adapter contract, not as incidental menu behavior.

### Item 1.5: CLI Error Surface Standard

**Intent:** Standardize human output, JSON output, and exit code behavior.

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/help.ts`
- Test: `test/cli.test.ts`
- Test: `test/cli-status-route.test.ts`
- Test: `test/cli-direct-routes.test.ts`

**Steps:**
- [ ] Identify current error patterns in `src/cli.ts`.
- [ ] Introduce a small typed error result shape if needed:
  ```ts
  type CliErrorKind = 'user-action-needed' | 'environment-unavailable' | 'internal-error';
  ```
- [ ] Ensure JSON routes emit structured errors without banners.
- [ ] Ensure human routes preserve readable notes and non-zero exit behavior.
- [ ] Run:
  ```bash
  npx vitest run test/cli.test.ts test/cli-status-route.test.ts test/cli-direct-routes.test.ts
  ```

**Acceptance:**
- User-fixable failures are distinguishable from internal failures in tests and output.

**Train 1 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish after Train 1 because it changes user-facing CLI/cockpit behavior and regression hardening.

## Train 2: Test, Release, And Acceptance Hardening

**Goal:** Make release confidence measurable and repeatable before adding deeper lifecycle features.

**Subagent split:**
- Worker A: release workflow and artefact verification.
- Worker B: published-package smoke expansion.
- Worker C: coverage/risky-file analysis.
- Worker D: generated environment acceptance fixture.

### Item 2.1: Release Candidate Rule Documentation And Tests

**Files:**
- Modify: `README.md`
- Modify: `docs/handoff.md`
- Modify: `test/publish-release-script.test.ts`
- Modify: `test/publish-workflow.test.ts`

**Steps:**
- [ ] Document the release candidate rules in user-facing terms.
- [ ] Add tests for required scoped packages and optional `wpmoo` alias handling.
- [ ] Assert release workflow does not fail the release when only the optional short alias fails.
- [ ] Run:
  ```bash
  npx vitest run test/publish-release-script.test.ts test/publish-workflow.test.ts
  ```

**Acceptance:**
- Release policy is documented and executable tests enforce it.

### Item 2.2: Publish Workflow Observability

**Files:**
- Modify: `.github/workflows/publish.yml`
- Modify: `test/publish-workflow.test.ts`
- Modify: `docs/handoff.md`

**Steps:**
- [ ] Add workflow summary lines for required artefacts.
- [ ] Add workflow summary line for optional `wpmoo` alias result.
- [ ] Add summary line for smoke command expectation.
- [ ] Test the workflow YAML or workflow text invariants.

**Acceptance:**
- A failed or warning release is understandable from GitHub Actions summary without reading raw logs.

### Item 2.3: Published Smoke Expansion

**Files:**
- Modify: `scripts/smoke-published.sh`
- Modify: `test/smoke-published-script.test.ts`

**Steps:**
- [ ] Smoke `@wpmoo/toolkit@<version> --help`.
- [ ] Smoke `@wpmoo/toolkit@<version> create --help`.
- [ ] Smoke `@wpmoo/toolkit@<version> doctor --help`.
- [ ] Smoke `@wpmoo/toolkit@<version> status --help`.
- [ ] Smoke scoped alias redirect packages if npm cache allows.
- [ ] Keep generated environment acceptance opt-in behind the existing environment flag.

**Acceptance:**
- Published package smoke proves the CLI entrypoints work beyond a single help command.

### Item 2.4: Coverage And Risk Report

**Files:**
- Modify: `package.json` only if adding a non-blocking script is useful.
- Create: `docs/generated-environment-verification.md` section or new docs section if report is retained.
- Test: no production test required unless scripts are added.

**Steps:**
- [ ] Run:
  ```bash
  npm run test:coverage
  ```
- [ ] Identify risky low-coverage files: `src/cli.ts`, `src/templates.ts`, `src/doctor.ts`, `src/module-actions.ts`, `src/prompts/index.ts`.
- [ ] Add a documented “coverage watchlist” instead of a hard threshold if thresholds would be noisy.
- [ ] Add focused tests only for uncovered critical branches discovered during the audit.

**Acceptance:**
- Train 3 and Train 4 know which files need additional test protection.

### Item 2.5: Generated Environment Acceptance Fixture

**Files:**
- Modify: `test/generated-environment-scaffold.test.ts`
- Modify: `test/generated-environment-moo.test.ts`
- Modify: `src/templates.ts` only if fixture exposes a real gap.

**Steps:**
- [ ] Build a minimal generated environment fixture through the scaffold path.
- [ ] Assert generated `./moo --help`, `./moo status`, and `./moo doctor --help`.
- [ ] Assert generated scripts are executable where applicable.
- [ ] Assert status works without running Docker when it can report static environment facts.

**Acceptance:**
- Generated environment basics are verified as an acceptance path, not only as string template snapshots.

**Train 2 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish after Train 2 if workflow, smoke behavior, or generated environment acceptance behavior changes. Documentation-only changes do not require publish.

## Train 3: Cockpit UX And Daily Developer Flow

**Goal:** Make daily cockpit use fast, compact, and predictable.

**Subagent split:**
- Worker A: menu copy and semantic menu tests.
- Worker B: command palette and search keywords.
- Worker C: contextual next-step notes.
- Worker D: status/banner source-of-truth sync.

### Item 3.1: Cockpit Action Description Compression

**Files:**
- Modify: `src/cockpit/command-registry.ts`
- Test: `test/cli-cockpit-categories.test.ts`

**Steps:**
- [ ] Shorten descriptions so common terminal widths do not wrap.
- [ ] Keep labels action-oriented.
- [ ] Add a test asserting max description length for top-level commands.

**Acceptance:**
- The top-level cockpit menu is visually compact without losing meaning.

### Item 3.2: Command Palette Search Improvements

**Files:**
- Modify: `src/cockpit/command-palette.ts`
- Modify: `src/cockpit/command-registry.ts`
- Test: `test/cli-cockpit-palette.test.ts`

**Steps:**
- [ ] Add searchable keywords per command: category, slash alias, direct command, common synonyms.
- [ ] Support searches such as `/module`, `/db`, `/test`, `/snapshot`, `/safe`.
- [ ] Keep exact slash aliases first in ranking.

**Acceptance:**
- Users can find daily commands without remembering exact command labels.

### Item 3.3: Contextual Next-Step Notes

**Files:**
- Modify: `src/cockpit/menu.ts`
- Modify: `src/prompts/index.ts` only if the existing disabled reason hook is insufficient.
- Test: `test/cli-cockpit-categories.test.ts`

**Steps:**
- [ ] Add concise reason-to-next-step mapping.
- [ ] Show next step only for the selected disabled item.
- [ ] Examples:
  - `No modules found.` -> `Next: choose "Add module" first.`
  - `Services stopped.` -> `Next: choose "Start services" first.`
  - `Already running.` -> `Next: choose "Stop services" or "Restart services".`

**Acceptance:**
- Disabled selections explain how to unblock the action without expanding each menu row.

### Item 3.4: Cockpit Status Source Sync

**Files:**
- Modify: `src/status.ts`
- Modify: `src/cli.ts`
- Test: `test/status.test.ts`
- Test: `test/cli-menu-routes.test.ts`

**Steps:**
- [ ] Ensure banner facts and `status --json` share the same status computation where possible.
- [ ] Add tests for repo count, module count, service state, and compose errors.
- [ ] Prevent banner/status drift.

**Acceptance:**
- The cockpit header and automation status output agree on core environment facts.

### Item 3.5: Semantic Menu Snapshot Tests

**Files:**
- Test: `test/cli-cockpit-categories.test.ts`
- Test: `test/cli-menu-empty-states.test.ts`

**Steps:**
- [ ] Add semantic snapshots of category order, command ids, defaults, disabled reasons, and enabled actions.
- [ ] Avoid ANSI or pixel snapshots.
- [ ] Keep snapshots readable as plain object fixtures.

**Acceptance:**
- Future menu regressions are caught with low-noise tests.

**Train 3 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish after Train 3 because it changes cockpit UX and command discovery.

## Train 4: Odoo Module Lifecycle Depth

**Goal:** Make generated modules and module operations safer and closer to Odoo standards.

**Subagent split:**
- Worker A: module quality score.
- Worker B: manifest parser.
- Worker C: dependency graph.
- Worker D: install/update/test target resolver.
- Worker E: scaffold v2, only after A-D contracts are stable.

### Item 4.1: Module Quality Score v2

**Files:**
- Modify: `src/module-quality.ts`
- Modify: `src/status.ts`
- Test: `test/status.test.ts`
- Test: `test/generated-environment-scaffold.test.ts`

**Checks:**
- `__manifest__.py` exists.
- `installable` is not false.
- `license` exists.
- `depends` exists and includes `base` for generated modules that create Odoo models, actions, menus, views, security rules, or demo data.
- `__init__.py` imports `models` when models exist.
- `models/__init__.py` imports model files.
- `security/ir.model.access.csv` exists for persistent models.
- Views XML exists.
- Action/menu XML exists when user-facing module is generated.
- Tests directory exists for generated modules.

**Acceptance:**
- `status` can explain why a module is not ready to install.

### Item 4.2: Manifest Parser Hardening

**Files:**
- Modify: `src/module-quality.ts`
- Create or modify: `src/module-manifest.ts` if parser separation is needed.
- Test: `test/module-actions.test.ts`
- Test: `test/status.test.ts`

**Steps:**
- [ ] Parse Python manifest dictionaries safely without executing code.
- [ ] Report invalid syntax as a quality issue.
- [ ] Report missing keys as quality issues.
- [ ] Preserve current behavior for simple manifests.

**Acceptance:**
- Bad manifests produce actionable diagnostics, not crashes.

### Item 4.3: Dependency Graph Report

**Files:**
- Modify: `src/module-quality.ts`
- Modify: `src/status.ts`
- Test: `test/status.test.ts`

**Steps:**
- [ ] Build dependency graph from parsed manifests.
- [ ] Detect missing local dependencies.
- [ ] Detect obvious cycles among local modules.
- [ ] Classify dependencies as local, OCA/external unknown, or unresolved.

**Acceptance:**
- Users can see dependency risks before install/update.

### Item 4.4: Install/Update/Test Target Resolver

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/cockpit/module-action-menu.ts`
- Modify: `src/module-actions.ts`
- Test: `test/cli-direct-routes.test.ts`
- Test: `test/cockpit-module-action-menu.test.ts`

**Steps:**
- [ ] Add exact-match module resolution.
- [ ] Add clear multi-match candidate handling.
- [ ] Add no-match error with nearest candidates if a safe existing helper exists.
- [ ] Keep destructive or lifecycle guard behavior unchanged.

**Acceptance:**
- Users can target modules confidently from direct commands and cockpit flows.

### Item 4.5: Generated Module Scaffold v2

**Files:**
- Modify: `src/module-actions.ts`
- Modify: `src/templates.ts` only if scaffold template responsibilities are moved.
- Test: `test/module-actions.test.ts`
- Test: `test/generated-environment-scaffold.test.ts`

**Steps:**
- [ ] Add improved manifest metadata.
- [ ] Add predictable model naming.
- [ ] Add better view/action/menu XML naming.
- [ ] Keep existing generated files backward compatible.
- [ ] Do not overwrite existing user files.

**Acceptance:**
- New modules are closer to Odoo best practices and pass the quality score by default.

**Train 4 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish after Train 4 because scaffold output and module lifecycle behavior change.

## Train 5: Generated Environment Runtime

**Goal:** Make generated environments more self-diagnosing and less dependent on global package fallback for local facts.

**Subagent split:**
- Worker A: generated local doctor.
- Worker B: service readiness.
- Worker C: logs UX.
- Worker D: shell/psql safeguards.
- Worker E: safe reset preview.

### Item 5.1: Local-First `./moo doctor`

**Files:**
- Modify: `src/templates.ts`
- Modify: `src/daily-actions.ts`
- Test: `test/generated-environment-moo.test.ts`
- Test: `test/templates.test.ts`

**Steps:**
- [ ] Add generated local doctor script for static environment checks.
- [ ] Keep package fallback for advanced checks.
- [ ] Verify offline doctor behavior when Docker is unavailable.

**Acceptance:**
- Generated environments can explain basic local problems without relying entirely on package fallback.

### Item 5.2: Service Readiness Probes

**Files:**
- Modify: `src/service-runtime-status.ts`
- Modify: `src/cli.ts`
- Test: `test/service-runtime-status.test.ts`
- Test: `test/cli-menu-routes.test.ts`

**Steps:**
- [ ] Distinguish Docker services running from Odoo HTTP ready.
- [ ] Add a readiness message for DB ready, Odoo not ready, and fully ready.
- [ ] Preserve existing simple service status for compatibility.

**Acceptance:**
- Users do not confuse container running with Odoo ready.

### Item 5.3: Logs UX

**Files:**
- Modify: `src/daily-actions.ts`
- Modify: `src/cockpit/daily-prompts.ts`
- Test: `test/daily-actions.test.ts`
- Test: `test/cli-cockpit-daily-actions.test.ts`

**Steps:**
- [ ] Support service selection for logs.
- [ ] Support tail count where generated scripts allow it.
- [ ] Add common Odoo error hints only as non-blocking notes.

**Acceptance:**
- Logs are easier to inspect without leaving cockpit.

### Item 5.4: Shell And PSQL Safeguards

**Files:**
- Modify: `src/databases.ts`
- Modify: `src/daily-actions.ts`
- Test: `test/databases.test.ts`
- Test: `test/daily-actions.test.ts`

**Steps:**
- [ ] Validate database names before constructing shell commands.
- [ ] Handle missing db container clearly.
- [ ] Preserve current command escaping strategy.

**Acceptance:**
- Shell/psql failures are clear and do not create unsafe command strings.

### Item 5.5: Safe Reset Preview v2

**Files:**
- Modify: `src/safe-reset.ts`
- Test: `test/safe-reset.test.ts`

**Steps:**
- [ ] Preview generated files that would change.
- [ ] Preview source repositories that will remain untouched.
- [ ] Warn about dirty generated files.
- [ ] Keep source repository safety guarantees.

**Acceptance:**
- Safe reset is explainable before it writes files.

**Train 5 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish after Train 5 if generated environment scripts or runtime behavior change.

## Train 6: Stage And Production Guardrails

**Goal:** Make non-dev behavior explicit, auditable, and dry-run-first.

**Subagent split:**
- Worker A: environment policy model.
- Worker B: backup-before-destructive checks.
- Worker C: dry-run output contract.
- Worker D: migration approval gate.
- Worker E: local audit log.

### Item 6.1: Central Environment Policy Model

**Files:**
- Create or modify: `src/environment-policy.ts`
- Modify: `src/cockpit/safety.ts`
- Modify: `src/daily-actions.ts`
- Test: `test/cli-cockpit-safety.test.ts`
- Test: `test/generated-environment-moo.test.ts`

**Steps:**
- [ ] Centralize dev/stage/prod command policy.
- [ ] Encode which commands require dry-run, explicit env flag, or destructive flag.
- [ ] Replace duplicated guard logic gradually.

**Acceptance:**
- Stage/prod command safety is readable from one policy table.

### Item 6.2: Backup Before Destructive Checks

**Files:**
- Modify: `src/daily-actions.ts`
- Modify: `src/databases.ts`
- Test: `test/daily-actions.test.ts`
- Test: `test/databases.test.ts`

**Steps:**
- [ ] Detect whether a recent snapshot exists when a destructive command is requested.
- [ ] Warn or block in stage/prod according to policy.
- [ ] Keep dev behavior less restrictive.

**Acceptance:**
- Destructive stage/prod commands cannot proceed blindly.

### Item 6.3: Dry-Run Output Contract

**Files:**
- Modify: `src/daily-actions.ts`
- Modify: `src/cli.ts`
- Test: `test/daily-actions.test.ts`
- Test: `test/cli-direct-routes.test.ts`

**Steps:**
- [ ] Define dry-run output fields for destructive commands.
- [ ] Add JSON-compatible shape where routes support JSON.
- [ ] Keep human output concise.

**Acceptance:**
- Dry-run output is testable and script-friendly.

### Item 6.4: Migration Approval Gate

**Files:**
- Create or modify: `src/migrations.ts`
- Modify: `src/daily-actions.ts`
- Test: `test/daily-actions.test.ts`

**Steps:**
- [ ] Detect common Odoo migration directories or scripts.
- [ ] Require explicit approval flag for stage/prod migration-impacting commands.
- [ ] Report detected migration paths in dry-run output.

**Acceptance:**
- Stage/prod lifecycle commands surface migration risk before execution.

### Item 6.5: Production Command Audit Log

**Files:**
- Create or modify: `src/audit-log.ts`
- Modify: `src/daily-actions.ts`
- Test: `test/daily-actions.test.ts`

**Steps:**
- [ ] Write local audit log entries for prod-sensitive commands.
- [ ] Include command, environment, dry-run/real, timestamp, and approval flags.
- [ ] Keep secrets and command arguments that may contain secrets out of logs.

**Acceptance:**
- Production-sensitive local operations leave a minimal local audit trail.

**Train 6 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish after Train 6 because it changes Stage/Production safety behavior.

## Train 7: PostgreSQL Diagnostics Depth

**Goal:** Provide useful read-only PostgreSQL health and performance signals without applying tuning automatically.

**Subagent split:**
- Worker A: long transactions.
- Worker B: table health.
- Worker C: index readiness.
- Worker D: WAL/disk risk.
- Worker E: JSON schema stabilization.

### Item 7.1: Long Transaction Warning

**Files:**
- Modify: `src/doctor.ts`
- Test: `test/doctor.test.ts`
- Test: `test/generated-environment-doctor-matrix.test.ts`

**Steps:**
- [ ] Add read-only query for long-running transactions and idle-in-transaction sessions.
- [ ] Warn when age exceeds a conservative threshold.
- [ ] Handle unavailable rows as unavailable diagnostics.

**Acceptance:**
- `doctor --postgres` identifies long transaction risk.

### Item 7.2: Table Health Report

**Files:**
- Modify: `src/doctor.ts`
- Test: `test/doctor.test.ts`

**Steps:**
- [ ] Add table size, dead tuple count, last vacuum, and last analyze visibility.
- [ ] Limit output to top risky tables.
- [ ] Keep human output concise and JSON output structured.

**Acceptance:**
- Users can see likely table maintenance risks without manual SQL.

### Item 7.3: Index Readiness Report

**Files:**
- Modify: `src/doctor.ts`
- Test: `test/doctor.test.ts`

**Steps:**
- [ ] Report unused index candidates from read-only stats.
- [ ] Report index bloat candidates only when supporting stats are available.
- [ ] Avoid prescriptive drop/create commands.

**Acceptance:**
- Index diagnostics are advisory, not destructive.

### Item 7.4: WAL And Disk Risk Checks

**Files:**
- Modify: `src/doctor.ts`
- Modify: `src/databases.ts` only if helper commands are needed.
- Test: `test/doctor.test.ts`

**Steps:**
- [ ] Report WAL size visibility where possible.
- [ ] Report database size growth signals.
- [ ] Report disk/mount visibility when Docker exposes it safely.

**Acceptance:**
- PostgreSQL diagnostics warn about capacity risks before they become runtime failures.

### Item 7.5: PostgreSQL JSON Contract Versioning

**Files:**
- Modify: `src/doctor.ts`
- Test: `test/doctor.test.ts`
- Docs: `README.md`

**Steps:**
- [ ] Add a diagnostics contract version for `postgres` JSON.
- [ ] Ensure all new fields are optional or documented.
- [ ] Add tests for missing, unavailable, warning, and healthy states.

**Acceptance:**
- Automation consumers can trust the PostgreSQL JSON shape.

**Train 7 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish after Train 7 because diagnostics output and JSON contracts change.

## Train 8: Documentation And 1.0 Readiness

**Goal:** Prepare the project for a credible 1.0 release.

**Subagent split:**
- Worker A: troubleshooting cookbook.
- Worker B: command reference.
- Worker C: Dev/Stage/Prod recipes.
- Worker D: 1.0 compatibility checklist and audit.

### Item 8.1: Troubleshooting Cookbook

**Files:**
- Create: `docs/troubleshooting.md`
- Modify: `README.md`

**Topics:**
- Docker missing or not running.
- No modules found.
- No source repositories.
- Dirty module deletion refused.
- Optional `wpmoo` alias E404.
- PostgreSQL unavailable diagnostics.
- Stage/prod guard failures.

**Acceptance:**
- Common real-world failures have copy-pasteable next steps.

### Item 8.2: Command Reference

**Files:**
- Create: `docs/command-reference.md`
- Modify: `README.md`

**Content:**
- Direct commands.
- Cockpit equivalent.
- Environment variables.
- Exit behavior.
- JSON support.
- Stage/prod restrictions.

**Acceptance:**
- Users can script WPMoo without reading source code.

### Item 8.3: Dev/Stage/Prod Recipes

**Files:**
- Create: `docs/lifecycle-recipes.md`
- Modify: `README.md`

**Recipes:**
- Local development setup.
- Adding a source repository.
- Adding a module.
- Installing and updating a module.
- Running tests.
- Taking and restoring snapshots.
- Stage dry-run validation.
- Production-safe preview.

**Acceptance:**
- The intended lifecycle workflow is documented as sequences, not isolated commands.

### Item 8.4: 1.0 Compatibility Checklist

**Files:**
- Create: `docs/1-0-readiness.md`
- Modify: `docs/handoff.md`

**Content:**
- Stable command names.
- Stable JSON contracts.
- Deprecated alias policy.
- Generated file compatibility.
- Stage/prod policy.
- Release artefact policy.

**Acceptance:**
- Remaining pre-1.0 decisions are explicit.

### Item 8.5: 1.0 Release Readiness Audit

**Files:**
- Modify: `docs/1-0-readiness.md`
- Test: no new tests unless audit exposes gaps.

**Steps:**
- [ ] Run full gate.
- [ ] Run coverage.
- [ ] Run published smoke against latest release.
- [ ] Review open placeholder markers in source comments and failing docs links.
- [ ] Produce a final 1.0 gap list.

**Acceptance:**
- The next milestone can be either “ship 1.0” or “finish named gaps,” not an open-ended cleanup.

**Train 8 full gate:**
```bash
npm run typecheck
npm test
npm run build
git diff --check
```

**Publish rule:** Publish Train 8 only if docs are packaged in npm or behavior changes. Otherwise commit and push docs without tagging.

## Final 1.0 Release Gate

Run after all trains are complete:

```bash
npm run typecheck
npm test
npm run build
npm run test:coverage
npm run release:check
npm run smoke:published
git diff --check
```

Then prepare the 1.0 release decision:

- If API/CLI behavior is stable and docs are complete, bump to `1.0.0`.
- If risky behavior is still moving, continue `0.9.x` patch/minor releases.
- Never cut `1.0.0` until generated environment behavior, JSON contracts, Stage/Production guardrails, and release artefacts are documented and tested.

## Progress Ledger

- [ ] Train 1: Stability And Regression Lock
- [ ] Train 2: Test, Release, And Acceptance Hardening
- [ ] Train 3: Cockpit UX And Daily Developer Flow
- [ ] Train 4: Odoo Module Lifecycle Depth
- [ ] Train 5: Generated Environment Runtime
- [ ] Train 6: Stage And Production Guardrails
- [ ] Train 7: PostgreSQL Diagnostics Depth
- [ ] Train 8: Documentation And 1.0 Readiness
