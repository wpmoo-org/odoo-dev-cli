# Coverage Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise `@wpmoo/toolkit` test coverage materially above the current baseline while preserving CLI behavior.

**Architecture:** Add behavior-focused Vitest coverage around the largest uncovered surfaces. Prioritize real unit tests over configuration exclusions; keep production changes minimal and only when needed to make code testable.

**Tech Stack:** TypeScript, Vitest 3.2.4, V8 coverage, GitHub Actions/Coveralls.

---

## Baseline

Fresh command:

```bash
npm run test:coverage
```

Current result:

```text
Statements   : 66.95% (1986/2966)
Branches     : 84.05% (622/740)
Functions    : 91.66% (198/216)
Lines        : 66.95% (1986/2966)
```

Largest missed line counts:

```text
src/cli.ts                  756 missed lines, 0.0% lines
src/update-check.ts          26 missed lines, 76.4% lines
src/repository-preflight.ts  23 missed lines, 58.9% lines
src/safe-reset.ts            22 missed lines, 85.5% lines
src/github.ts                18 missed lines, 80.2% lines
src/args.ts                  17 missed lines, 93.6% lines
src/daily-actions.ts         17 missed lines, 89.0% lines
src/external-assets.ts       16 missed lines, 85.6% lines
```

## Division Of Work

### Task 1: CLI Entrypoint Coverage

**Owner:** Worker A

**Files:**
- Modify: `src/cli.ts`
- Create: `test/cli.test.ts`
- May update: `test/cli-source.test.ts` only if source assertions need to track the refactor.

**Goal:** Cover non-interactive CLI branches without shelling out to child processes.

- [ ] **Step 1: Make `src/cli.ts` import-testable**

Export a testable function while preserving direct CLI execution:

```ts
export async function runCli(argv = process.argv.slice(2), cwd = process.cwd()): Promise<void> {
  // Move the current main body here.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
```

Use `pathToFileURL` from `node:url`. Keep user-facing output unchanged.

- [ ] **Step 2: Write behavior tests for easy branches**

In `test/cli.test.ts`, mock direct dependencies with `vi.mock` before dynamically importing `../src/cli.js`.

Cover at least these branches:

```ts
await runCli(['--help'], '/tmp/example');
await runCli(['--version'], '/tmp/example');
await runCli(['doctor'], '/tmp/example');
await runCli(['start'], '/tmp/example');
await runCli(['reset', '--target', '/tmp/example', '--stage=false'], '/tmp/example');
await runCli([
  'create',
  '--product', 'odoo_sample_module',
  '--dev-repo-url', 'https://github.com/example-org/odoo_sample_module_dev.git',
  '--source-repo-url', 'https://github.com/example-org/odoo_sample_module.git',
  '--dry-run',
], '/tmp/example');
```

Assertions should verify calls into mocked helpers such as `runDoctor`, `runDailyAction`, `safeResetEnvironment`, `scaffold`, and console output for help/version/dry-run. Do not test exact banner art.

- [ ] **Step 3: Run focused tests**

```bash
npx vitest run test/cli.test.ts test/cli-source.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Run coverage and report impact**

```bash
npm run test:coverage
```

Expected: total line coverage increases significantly from 66.95%.

### Task 2: Update Check, GitHub, Repository Preflight Coverage

**Owner:** Worker B

**Files:**
- Modify: `test/update-check.test.ts`
- Modify: `test/github.test.ts`
- Modify: `test/repository-preflight.test.ts`

**Goal:** Add tests for existing branches in npm update metadata parsing, GitHub runner error handling, and repository preflight helpers. Do not modify production files unless a test exposes a real bug.

- [ ] **Step 1: Add update-check branch tests**

Add tests for:

```ts
compareVersions('v1.2.3-beta.1', '1.2.3') === 0
checkForUpdate('@wpmoo/toolkit', '0.5.0', runnerReturningDottedTarball) resolves current/update
checkForUpdate('@wpmoo/toolkit', '0.4.1', runnerReturningEmptyStdout) resolves unavailable
installLatestPackage('@wpmoo/toolkit', '0.8.44', runner) calls ['install', '-g', '@wpmoo/toolkit@0.8.44']
```

- [ ] **Step 2: Add GitHub branch tests**

Add tests for:

```ts
isGitHubCliAvailable(runnerThatThrows) === false
isGitHubAuthenticated(runnerThatThrows) === false
getAuthenticatedGitHubLogin(runnerReturningWhitespace) rejects with 'GitHub CLI is not authenticated'
getGitHubRepositoryStatus(runner, 'https://not-github.example/repo.git') returns { status: 'unsupported' }
createGitHubRepository(runner, 'https://not-github.example/repo.git', 'private') rejects
```

- [ ] **Step 3: Add repository-preflight branch tests**

Add tests for:

```ts
findInaccessibleGitHubRepositories(options, runner) returns only inaccessible repositories
createGitHubRepositories(missingRepos, 'public', runner) calls create for each repo with public visibility
repositoryPreflightAvailable(runnerWithUnavailableGh) === false
repositoryPreflightAvailable(runnerWithUnauthenticatedGh) === false
```

- [ ] **Step 4: Run focused tests**

```bash
npx vitest run test/update-check.test.ts test/github.test.ts test/repository-preflight.test.ts
```

Expected: all tests pass.

### Task 3: Safe Reset, Daily Actions, External Assets Coverage

**Owner:** Worker C

**Files:**
- Modify: `test/safe-reset.test.ts`
- Modify: `test/daily-actions.test.ts`
- Modify: `test/external-assets.test.ts`

**Goal:** Cover existing failure and fallback branches in file generation/orchestration helpers. Do not modify production files unless a test exposes a real bug.

- [ ] **Step 1: Add safe-reset branch tests**

Cover:

```ts
renderSafeResetPreview('/tmp/env', false) contains 'Generated changes will not be staged.'
safeResetEnvironment({ target, stage: false }) does not call git add
safeResetEnvironment infers repo URLs from .gitmodules when metadata omits a URL
safeResetEnvironment falls back to source path when .gitmodules is missing
```

- [ ] **Step 2: Add daily-actions branch tests**

Cover:

```ts
runDailyAction('logs', ['web']) delegates service argument
runDailyAction('test', ['module_a', '--db', 'custom', '--mode', 'update', '--tags', 'tag']) renders expected script args
runDailyAction('restore-snapshot', ['snapshot-name', 'customdb']) renders expected script args
invalid/missing daily action arguments reject with existing error wording
```

- [ ] **Step 3: Add external-assets branch tests**

Cover:

```ts
applyExternalAsset skips excluded paths
applyExternalAsset creates executable files when mode is present
applyExternalAsset handles gh: source refs through the existing URL/ref parser path
```

- [ ] **Step 4: Run focused tests**

```bash
npx vitest run test/safe-reset.test.ts test/daily-actions.test.ts test/external-assets.test.ts
```

Expected: all tests pass.

## Coordinator Verification

After worker integration:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Acceptance criteria:
- Full test suite passes.
- `npm run test:coverage` line coverage is above the 66.95% baseline.
- No secret values are added to the repository.
- `wpmoo-toolkit` release still follows `npm run release:check`, version bump commit if needed, annotated tag, GitHub Actions Publish workflow, then `npm view`.
