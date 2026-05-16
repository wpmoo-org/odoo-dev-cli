# WPMoo Toolkit Package Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the official CLI package to `@wpmoo/toolkit`, add `npx wpmoo` as a short alias, and keep `@wpmoo/odoo` plus `@wpmoo/odoo-dev` as compatibility entry points.

**Architecture:** The root package remains the only source package and publishes as `@wpmoo/toolkit`. Three small publishable alias packages live under `packages/` and depend on the exact root package version; their `wpmoo` bins import `runCli()` from `@wpmoo/toolkit`, with legacy packages printing a migration notice to stderr. Release scripts sync alias package versions and publish root first, then aliases.

**Tech Stack:** TypeScript CLI, npm package metadata, npm Trusted Publishing, Vitest, shell release scripts.

---

### Task 1: Package Metadata And Alias Package Tests

**Files:**
- Modify: `test/package.test.ts`
- Create: `test/alias-packages.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `packages/wpmoo/package.json`
- Create: `packages/wpmoo/bin/wpmoo.js`
- Create: `packages/odoo-compat/package.json`
- Create: `packages/odoo-compat/bin/wpmoo.js`
- Create: `packages/odoo-dev-compat/package.json`
- Create: `packages/odoo-dev-compat/bin/wpmoo.js`

- [ ] Update tests to expect root package name `@wpmoo/toolkit`, repository URL `wpmoo-toolkit`, and the `wpmoo` bin.
- [ ] Add alias package tests that verify package names, exact dependency on `@wpmoo/toolkit`, bin paths, and legacy migration notices.
- [ ] Run focused tests and confirm they fail before metadata/package files are changed.
- [ ] Patch package metadata and create alias packages.
- [ ] Run focused tests and confirm they pass.

### Task 2: Release And Publish Tooling

**Files:**
- Modify: `scripts/release-check.sh`
- Modify: `.github/workflows/publish.yml`
- Modify: `test/publish-release-script.test.ts`
- Modify: `test/publish-workflow.test.ts`
- Create: `scripts/sync-alias-packages.mjs`

- [ ] Update tests so release checks query all four publish targets: `@wpmoo/toolkit`, `wpmoo`, `@wpmoo/odoo`, and `@wpmoo/odoo-dev`.
- [ ] Add a sync script that keeps alias package versions and dependencies equal to the root package version.
- [ ] Update release check to sync aliases, bump if any target version exists, pack root and aliases, and run package metadata tests.
- [ ] Update publish workflow to verify all targets are unpublished, publish root, then publish all aliases.
- [ ] Run focused release/publish tests and confirm they pass.

### Task 3: CLI Text, Docs, And Generated Environment Fallbacks

**Files:**
- Modify: `src/help.ts`
- Modify: `src/status.ts`
- Modify: `src/templates.ts`
- Modify: `README.md`
- Modify: `docs/generated-environment-verification.md`
- Modify: `docs/handoff.md`
- Modify: `docs/external-resources.md`
- Modify affected tests under `test/`

- [ ] Replace official command examples with `npx @wpmoo/toolkit`.
- [ ] Mention `npx wpmoo` as the short alias and `@wpmoo/odoo` / `@wpmoo/odoo-dev` as legacy compatibility packages where useful.
- [ ] Ensure generated `./moo` fallback uses the current root `packageName()` so fresh environments fall back to `@wpmoo/toolkit@<version>`.
- [ ] Update tests that assert help/status/scaffold copy.
- [ ] Run focused help/status/template/generated-environment tests.

### Task 4: Verification And Commit

**Files:**
- All changed files.

- [ ] Run `npx vitest run test/package.test.ts test/alias-packages.test.ts test/publish-release-script.test.ts test/publish-workflow.test.ts test/smoke-published-script.test.ts test/help.test.ts test/args.test.ts test/status.test.ts test/templates.test.ts test/generated-environment-moo.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm test`.
- [ ] Run local `moo_olympiad_dev` smoke with `env WPMOO_SKIP_UPDATE_CHECK=1 node ../../wpmoo-toolkit/dist/cli.js`.
- [ ] Commit and push from `wpmoo-toolkit`; do not publish until npm trusted publishing is configured for all new package names.
