# System Prerequisite Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Git and Docker prerequisite gate before WPMoo creates a generated Odoo environment.

**Architecture:** Implement prerequisite detection and guidance in a focused `src/system-prerequisites.ts` module with injectable command execution. In interactive create flows, call it before the setup prompts. In non-interactive create flows, keep it before GitHub repository checks and scaffold writes.

**Tech Stack:** TypeScript, Node.js `child_process.execFile`, Vitest, existing Inquirer prompt wrappers.

---

### Task 1: Prerequisite Module

**Files:**
- Create: `src/system-prerequisites.ts`
- Test: `test/system-prerequisites.test.ts`

- [x] Write failing tests for all-present, Git missing, Docker missing, Docker not running, forced missing tools, and official download-link guidance rendering.
- [x] Run `npx vitest run test/system-prerequisites.test.ts` and confirm it fails because the module does not exist.
- [x] Implement `getSystemPrerequisiteStatus()` and `renderSystemPrerequisiteGuidance()`.
- [x] Run `npx vitest run test/system-prerequisites.test.ts` and confirm it passes.

### Task 2: Create Flow Gate

**Files:**
- Modify: `src/cli.ts`
- Test: `test/cli-system-prerequisites.test.ts`

- [x] Write failing tests proving interactive missing prerequisites appear before product setup prompts.
- [x] Write failing tests proving scaffold is not called when prerequisites are missing.
- [x] Write failing tests for interactive actions: single-item check again with dim Enter guidance, default Ctrl+C exit bottom help, clean re-render after check again, and all-ready continuation.
- [x] Run `npx vitest run test/cli-system-prerequisites.test.ts` and confirm failures are about missing behavior.
- [x] Add `ensureSystemPrerequisites()` in `src/cli.ts`, call it before interactive setup prompts, and keep non-interactive create guarded before `ensureGitHubRepositories()`.
- [x] Run `npx vitest run test/cli-system-prerequisites.test.ts` and confirm it passes.

### Task 3: Docs and Verification

**Files:**
- Modify: `README.md`
- Optional modify: `src/help.ts` if command help references prerequisites.

- [x] Update prerequisites docs to mention WPMoo checks Git and Docker before setup starts.
- [x] Run focused tests: `npx vitest run test/system-prerequisites.test.ts test/cli-system-prerequisites.test.ts`.
- [x] Run full verification: `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
