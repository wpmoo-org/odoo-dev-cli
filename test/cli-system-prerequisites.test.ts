import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvironmentTargetState } from '../src/environment-target-preflight.js';
import type { SystemPrerequisiteStatus } from '../src/system-prerequisites.js';
import type { UpdateCheckResult } from '../src/update-check.js';

const readyStatus: SystemPrerequisiteStatus = {
  ok: true,
  checks: [
    { tool: 'node', label: 'Node.js 20+', status: 'found', detail: 'v20.17.0' },
    { tool: 'git', label: 'Git', status: 'found', detail: 'git version 2.54.0' },
    { tool: 'docker', label: 'Docker Desktop', status: 'found', detail: 'Docker version 28.5.1' },
    { tool: 'docker-compose', label: 'Docker Compose', status: 'found', detail: 'Docker Compose version v2.40.2' },
    { tool: 'docker-engine', label: 'Docker Engine', status: 'found', detail: '28.5.1' },
  ],
  issues: [],
};

const missingStatus: SystemPrerequisiteStatus = {
  ok: false,
  checks: [
    { tool: 'node', label: 'Node.js 20+', status: 'found', detail: 'v20.17.0' },
    { tool: 'git', label: 'Git', status: 'missing' },
    { tool: 'docker', label: 'Docker Desktop', status: 'missing' },
  ],
  issues: [
    { tool: 'git', reason: 'missing' },
    { tool: 'docker', reason: 'missing' },
  ],
};

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async () => false),
  intro: vi.fn(),
  isPromptCancel: vi.fn(() => false),
  note: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  promptRepositoryUrl: vi.fn(),
  detectDevelopmentEnvironment: vi.fn(async () => ({ isEnvironment: false, source: 'none' as const })),
  checkForUpdate: vi.fn<() => Promise<UpdateCheckResult>>(async () => ({
    status: 'current',
    currentVersion: '0.0.0-test',
    latestVersion: '0.0.0-test',
  })),
  isUpdateCheckSkipped: vi.fn((argv: string[]) => argv.includes('--no-update-check')),
  scaffold: vi.fn(async () => ({ plannedFiles: [], plannedCommands: [] })),
  getSystemPrerequisiteStatus: vi.fn(async () => readyStatus),
  renderSystemPrerequisiteGuidance: vi.fn(() => 'mock prerequisite guidance'),
  inspectEnvironmentTarget: vi.fn<(target: string) => Promise<EnvironmentTargetState>>(async (target) => ({ kind: 'missing_target', target })),
  getOriginUrl: vi.fn(async () => undefined),
  getGitHubAccounts: vi.fn(async () => [{ login: 'example-org', type: 'user' as const }]),
  getGitHubPrerequisiteStatus: vi.fn(async () => ({ status: 'ready' as const })),
  renderRepositorySetupNote: vi.fn(() => 'repo setup note'),
  checkGitHubRepositories: vi.fn(async () => ({ accessible: [], inaccessible: [], blocked: [] })),
  renderBanner: vi.fn(() => 'mock banner'),
  renderVersionTag: vi.fn((latestVersion?: string) => `mock version${latestVersion ? ` -> ${latestVersion}` : ''}`),
  installPromptCancelKeyTracker: vi.fn(),
}));

vi.mock('../src/prompts/index.js', () => ({
  confirm: mocks.confirm,
  confirmPrompt: mocks.confirm,
  intro: mocks.intro,
  introPrompt: mocks.intro,
  isCancel: mocks.isPromptCancel,
  isPromptCancel: mocks.isPromptCancel,
  note: mocks.note,
  notePrompt: mocks.note,
  outro: mocks.outro,
  outroPrompt: mocks.outro,
  promptSeparator: vi.fn((label: string) => ({ type: 'separator', separator: label })),
  select: mocks.select,
  selectPrompt: mocks.select,
  text: mocks.text,
  textPrompt: mocks.text,
}));

vi.mock('../src/system-prerequisites.js', () => ({
  getSystemPrerequisiteStatus: mocks.getSystemPrerequisiteStatus,
  renderSystemPrerequisiteGuidance: mocks.renderSystemPrerequisiteGuidance,
}));

vi.mock('../src/environment.js', () => ({
  detectDevelopmentEnvironment: mocks.detectDevelopmentEnvironment,
}));

vi.mock('../src/environment-target-preflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/environment-target-preflight.js')>();
  return {
    ...actual,
    inspectEnvironmentTarget: mocks.inspectEnvironmentTarget,
  };
});

vi.mock('../src/update-check.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/update-check.js')>();
  return {
    ...actual,
    checkForUpdate: mocks.checkForUpdate,
    isUpdateCheckSkipped: mocks.isUpdateCheckSkipped,
  };
});

vi.mock('../src/scaffold.js', () => ({
  scaffold: mocks.scaffold,
}));

vi.mock('../src/prompt-repositories.js', () => ({
  promptRepositoryUrl: mocks.promptRepositoryUrl,
}));

vi.mock('../src/git.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/git.js')>();
  return {
    ...actual,
    getOriginUrl: mocks.getOriginUrl,
    realGit: {},
  };
});

vi.mock('../src/github.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/github.js')>();
  return {
    ...actual,
    getGitHubAccounts: mocks.getGitHubAccounts,
    realGitHub: {},
  };
});

vi.mock('../src/github-prerequisites.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/github-prerequisites.js')>();
  return {
    ...actual,
    getGitHubPrerequisiteStatus: mocks.getGitHubPrerequisiteStatus,
  };
});

vi.mock('../src/repository-preflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repository-preflight.js')>();
  return {
    ...actual,
    checkGitHubRepositories: mocks.checkGitHubRepositories,
  };
});

vi.mock('../src/templates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/templates.js')>();
  return {
    ...actual,
    renderBanner: mocks.renderBanner,
  };
});

vi.mock('../src/version.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/version.js')>();
  return {
    ...actual,
    packageName: () => '@wpmoo/toolkit',
    packageVersion: () => '0.0.0-test',
    renderVersionTag: mocks.renderVersionTag,
  };
});

vi.mock('../src/prompt-copy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/prompt-copy.js')>();
  return {
    ...actual,
    renderRepositorySetupNote: mocks.renderRepositorySetupNote,
  };
});

vi.mock('../src/menu-navigation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/menu-navigation.js')>();
  return {
    ...actual,
    installPromptCancelKeyTracker: mocks.installPromptCancelKeyTracker,
  };
});

async function loadCli() {
  vi.resetModules();
  return import('../src/cli.js');
}

function mockLocalCreatePrompts() {
  mocks.text.mockImplementation(async (prompt: { message?: string }) => {
    if ((prompt.message ?? '').includes('Product slug')) return 'odoo_sample_module';
    if ((prompt.message ?? '').includes('Environment folder')) return './odoo_sample_module_dev';
    return '';
  });
  mocks.select.mockImplementation(async (prompt: { message?: string; initialValue?: unknown }) => {
    const message = prompt.message ?? '';
    if (message.includes('Connect this environment to Git/GitHub now')) return false;
    if (message.includes('Odoo version')) return '19.0';
    if (message.includes('Install project-local Odoo Agent Skills')) return false;
    if (message.includes('If you have installed the prerequisites')) return 'check-again';
    return prompt.initialValue;
  });
}

describe('cli system prerequisite gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.getSystemPrerequisiteStatus.mockResolvedValue(readyStatus);
    mocks.inspectEnvironmentTarget.mockImplementation(async (target: string) => ({ kind: 'missing_target', target }));
    mocks.checkForUpdate.mockResolvedValue({
      status: 'current',
      currentVersion: '0.0.0-test',
      latestVersion: '0.0.0-test',
    });
  });

  it('continues create flow when all system prerequisites are available', async () => {
    mockLocalCreatePrompts();
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.getSystemPrerequisiteStatus).toHaveBeenCalledTimes(1);
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('shows missing prerequisites before create prompts with a single retry action', async () => {
    mockLocalCreatePrompts();
    mocks.getSystemPrerequisiteStatus.mockResolvedValueOnce(missingStatus).mockResolvedValueOnce(readyStatus);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.intro).not.toHaveBeenCalledWith('Prerequisite Check');
    expect(console.log).toHaveBeenCalledWith('mock prerequisite guidance');
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Actions:'));
    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'If you have installed the prerequisites',
        options: [
          {
            value: 'check-again',
            label: 'Check again (Enter to re-check again)',
          },
        ],
        initialValue: 'check-again',
        loop: false,
        navigationHelp: 'exit',
      }),
    );
    expect(mocks.note).not.toHaveBeenCalledWith('mock prerequisite guidance', 'Required tools');
    expect(mocks.outro).not.toHaveBeenCalledWith('Install the missing prerequisites, then run npx @wpmoo/toolkit again.');
    expect(mocks.select.mock.invocationCallOrder[0]).toBeLessThan(mocks.text.mock.invocationCallOrder[0]);
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('rechecks prerequisites when the user chooses check again', async () => {
    mockLocalCreatePrompts();
    mocks.getSystemPrerequisiteStatus.mockResolvedValueOnce(missingStatus).mockResolvedValueOnce(readyStatus);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.getSystemPrerequisiteStatus).toHaveBeenCalledTimes(2);
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('re-renders the prerequisite page shell after checking again', async () => {
    mockLocalCreatePrompts();
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    mocks.getSystemPrerequisiteStatus
      .mockResolvedValueOnce(missingStatus)
      .mockResolvedValueOnce(missingStatus)
      .mockResolvedValueOnce(readyStatus);
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/workspace');

      expect(mocks.getSystemPrerequisiteStatus).toHaveBeenCalledTimes(3);
      expect(mocks.renderBanner).toHaveBeenCalledTimes(3);
      expect(writeSpy).toHaveBeenCalledWith('\u001B[3J\u001B[2J\u001B[H');
      expect(console.log).toHaveBeenCalledWith('mock prerequisite guidance');
      expect(mocks.scaffold).toHaveBeenCalledTimes(1);
    } finally {
      writeSpy.mockRestore();
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
    }
  });

  it('fails non-interactive create before scaffold when prerequisites are missing', async () => {
    mocks.getSystemPrerequisiteStatus.mockResolvedValueOnce(missingStatus);
    const { runCli } = await loadCli();

    await expect(
      runCli(
        [
          'create',
          '--product',
          'odoo_sample_module',
          '--source-repo-url',
          'https://github.com/example-org/odoo_sample_module.git',
        ],
        '/tmp/workspace',
      ),
    ).rejects.toThrow('mock prerequisite guidance');
    expect(mocks.scaffold).not.toHaveBeenCalled();
  });
});
