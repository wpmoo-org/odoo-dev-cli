import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cockpitCommands, type CockpitCommand } from '../src/cockpit/command-registry.js';
import type { ServiceRuntimeStatus } from '../src/service-runtime-status.js';
import { packageVersion } from '../src/version.js';

const mocks = vi.hoisted(() => ({
  addModuleRepo: vi.fn(async () => undefined),
  addModuleToSourceRepo: vi.fn(async () => undefined),
  addRepoGitHubCreate: vi.fn(async () => undefined),
  commandOdooVersion: vi.fn(async () => '19.0'),
  detectDevelopmentEnvironment: vi.fn(async () => ({ isEnvironment: true })),
  environmentGitHubOwner: vi.fn(async () => 'example-org'),
  getGitHubAccounts: vi.fn(async () => [{ login: 'example-org', type: 'organization' }]),
  getGitHubRepositoryStatus: vi.fn(async () => ({ status: 'accessible', slug: 'example-org/repo' })),
  installPromptCancelKeyTracker: vi.fn(),
  isUpdateCheckSkipped: vi.fn(() => true),
  listEnvironmentDatabases: vi.fn(async () => ['devel', 'postgres']),
  findDatabaseSnapshots: vi.fn(() => ({ snapshots: [], snapshotPaths: [], newestSnapshotAgeMs: null })),
  getServiceRuntimeStatus: vi.fn(async () => ({ kind: 'stopped' } as ServiceRuntimeStatus)),
  getDoctorReport: vi.fn(async () => ({
    schemaVersion: 1 as const,
    command: 'doctor' as const,
    ok: true,
    target: '/tmp/environment',
    checks: ['OK docker CLI'],
    warnings: [],
    errors: [],
    appliedFixes: [],
    sections: [
      {
        id: 'host-tools' as const,
        title: 'Host tools',
        checks: ['OK docker CLI'],
        warnings: [],
        errors: [],
      },
    ],
  })),
  listSources: vi.fn(async () => [
    {
      type: 'private',
      path: 'odoo_sample_module',
      url: 'https://github.com/example-org/odoo_sample_module.git',
      addons: ['odoo_sample_module'],
    },
  ]),
  listModuleRepos: vi.fn(async () => ['odoo_sample_module']),
  listModulesInEnvironment: vi.fn(async () => [
    {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private' as const,
    },
  ]),
  listModulesInSourceRepo: vi.fn(async () => ['odoo_sample_module_base']),
  removeModuleFromSourceRepo: vi.fn(async () => undefined),
  removeModuleRepo: vi.fn(async () => undefined),
  runDoctor: vi.fn(async () => 'doctor report'),
  runDailyAction: vi.fn(async () => undefined),
  runDailyActionWithStyledOutput: vi.fn(async () => undefined),
  renderBanner: vi.fn(() => 'mock banner'),
  renderSafeResetPreview: vi.fn(() => 'safe reset preview'),
  renderSafeResetSelectedPreview: vi.fn(() => 'safe reset selected preview'),
  safeResetSelectableGeneratedPaths: vi.fn(() => [] as string[]),
  renderEnvironmentStatusForTarget: vi.fn(async () => 'environment status report'),
  repositoryPreflightAvailable: vi.fn(async () => true),
  getGitHubPrerequisiteStatus: vi.fn(async () => ({ status: 'ready' as const })),
  renderGitHubPrerequisiteGuidance: vi.fn(() => 'GitHub CLI (`gh`) is not available or not authenticated.'),
  renderEnvironmentStatusSummary: vi.fn(() => 'Status summary'),
  getEnvironmentStatus: vi.fn(async () => ({
    kind: 'environment',
    target: '/tmp/environment',
    metadataPath: '/tmp/environment/.wpmoo/odoo.json',
    recommendedNextAction: 'Run ./moo.',
    odooVersion: '19.0',
    sourceRepoCount: 1,
    sourceRepoPaths: ['odoo/custom/src/private/moo_olympiad'] as string[],
    invalidSourceRepoPaths: [] as string[],
    moduleCandidateCount: 0,
    composeFiles: ['compose.yaml'] as string[],
    composeErrors: [] as string[],
    missingCoreFiles: [] as string[],
    moduleQuality: {
      totalModules: 0,
      installableModules: 0,
      nonInstallableModules: 0,
      modulesWithMenuActions: 0,
      modulesMissingMenuActions: 0,
      issues: [],
    },
  })),
  safeResetEnvironment: vi.fn(async () => undefined),
}));

function cockpitCommand(id: string): CockpitCommand {
  const command = cockpitCommands.find((entry) => entry.id === id);
  expect(command).toBeDefined();
  return command!;
}

vi.mock('../src/prompts/index.js', () => {
  const confirm = vi.fn(async () => false);
  const intro = vi.fn();
  const isPromptCancel = vi.fn(() => false);
  const note = vi.fn();
  const outro = vi.fn();
  const promptSeparator = vi.fn((label: string) => ({ type: 'separator', separator: label }));
  const select = vi.fn();
  const text = vi.fn();
  return {
    confirm,
    confirmPrompt: confirm,
    intro,
    introPrompt: intro,
    isCancel: isPromptCancel,
    isPromptCancel,
    note,
    notePrompt: note,
    outro,
    outroPrompt: outro,
    promptSeparator,
    select,
    selectPrompt: select,
    text,
    textPrompt: text,
  };
});

vi.mock('../src/environment.js', () => ({
  detectDevelopmentEnvironment: mocks.detectDevelopmentEnvironment,
}));

vi.mock('../src/daily-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/daily-actions.js')>();
  return {
    ...actual,
    runDailyAction: mocks.runDailyAction,
    runDailyActionWithStyledOutput: mocks.runDailyActionWithStyledOutput,
  };
});

vi.mock('../src/databases.js', () => ({
  findDatabaseSnapshots: mocks.findDatabaseSnapshots,
  listEnvironmentDatabases: mocks.listEnvironmentDatabases,
  normalizeDatabaseListResult: (result: unknown) =>
    Array.isArray(result) ? { ok: true, databases: result } : result,
}));

vi.mock('../src/repo-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repo-actions.js')>();
  return {
    ...actual,
    addModuleRepo: mocks.addModuleRepo,
    listModuleRepos: mocks.listModuleRepos,
    removeModuleRepo: mocks.removeModuleRepo,
  };
});

vi.mock('../src/module-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/module-actions.js')>();
  return {
    ...actual,
    addModuleToSourceRepo: mocks.addModuleToSourceRepo,
    listModulesInEnvironment: mocks.listModulesInEnvironment,
    listModulesInSourceRepo: mocks.listModulesInSourceRepo,
    removeModuleFromSourceRepo: mocks.removeModuleFromSourceRepo,
  };
});

vi.mock('../src/source-actions.js', () => ({
  listSources: mocks.listSources,
  renderSourceList: vi.fn(),
}));

vi.mock('../src/safe-reset.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/safe-reset.js')>();
  return {
    ...actual,
    renderSafeResetPreview: mocks.renderSafeResetPreview,
    renderSafeResetSelectedPreview: mocks.renderSafeResetSelectedPreview,
    safeResetSelectableGeneratedPaths: mocks.safeResetSelectableGeneratedPaths,
    safeResetEnvironment: mocks.safeResetEnvironment,
  };
});

vi.mock('../src/service-runtime-status.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/service-runtime-status.js')>();
  return {
    ...actual,
    getServiceRuntimeStatus: mocks.getServiceRuntimeStatus,
  };
});

vi.mock('../src/repository-preflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repository-preflight.js')>();
  return {
    ...actual,
    repositoryPreflightAvailable: mocks.repositoryPreflightAvailable,
  };
});

vi.mock('../src/github-prerequisites.js', () => ({
  getGitHubPrerequisiteStatus: mocks.getGitHubPrerequisiteStatus,
  renderGitHubPrerequisiteGuidance: mocks.renderGitHubPrerequisiteGuidance,
}));

vi.mock('../src/github.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/github.js')>();
  return {
    ...actual,
    createGitHubRepository: mocks.addRepoGitHubCreate,
    getGitHubAccounts: mocks.getGitHubAccounts,
    getGitHubRepositoryStatus: mocks.getGitHubRepositoryStatus,
  };
});

vi.mock('../src/environment-version.js', () => ({
  commandOdooVersion: mocks.commandOdooVersion,
}));

vi.mock('../src/environment-context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/environment-context.js')>();
  return {
    ...actual,
    environmentGitHubOwner: mocks.environmentGitHubOwner,
  };
});

vi.mock('../src/templates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/templates.js')>();
  return {
    ...actual,
    renderBanner: mocks.renderBanner,
  };
});

vi.mock('../src/menu-navigation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/menu-navigation.js')>();
  return {
    ...actual,
    installPromptCancelKeyTracker: mocks.installPromptCancelKeyTracker,
  };
});

vi.mock('../src/update-check.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/update-check.js')>();
  return {
    ...actual,
    isUpdateCheckSkipped: mocks.isUpdateCheckSkipped,
  };
});

vi.mock('../src/doctor.js', () => ({
  getDoctorReport: mocks.getDoctorReport,
  runDoctor: mocks.runDoctor,
}));

vi.mock('../src/status.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/status.js')>();
  return {
    ...actual,
    getEnvironmentStatus: mocks.getEnvironmentStatus,
    renderEnvironmentStatusSummary: mocks.renderEnvironmentStatusSummary,
    renderEnvironmentStatusForTarget: mocks.renderEnvironmentStatusForTarget,
  };
});

async function loadCli() {
  vi.resetModules();
  return import('../src/cli.js');
}

type CockpitRoutePromptStep = {
  kind: 'text' | 'select';
  value: unknown;
};

type TopLevelCockpitDailyCase = {
  commandId: string;
  expectedCommand: string;
  expectedArgv: string[];
  prompts?: ReadonlyArray<CockpitRoutePromptStep>;
  confirm?: boolean;
  styled?: boolean;
};

const topLevelCockpitDailyCases: readonly TopLevelCockpitDailyCase[] = [
  { commandId: 'start', expectedCommand: 'start', expectedArgv: [], prompts: [] },
  { commandId: 'stop', expectedCommand: 'stop', expectedArgv: [], prompts: [], confirm: true },
  { commandId: 'restart', expectedCommand: 'restart', expectedArgv: [], prompts: [] },
  { commandId: 'logs', expectedCommand: 'logs', expectedArgv: ['odoo', '200'], prompts: [], styled: true },
  { commandId: 'shell', expectedCommand: 'shell', expectedArgv: [], prompts: [] },
  { commandId: 'psql', expectedCommand: 'psql', expectedArgv: ['devel'], prompts: [{ kind: 'select', value: 'devel' }] },
  {
    commandId: 'snapshot',
    expectedCommand: 'snapshot',
    expectedArgv: ['devel', 'before-update'],
    prompts: [{ kind: 'select', value: 'devel' }, { kind: 'text', value: '' }],
  },
  {
    commandId: 'restore-snapshot',
    expectedCommand: 'restore-snapshot',
    expectedArgv: ['pre-upgrade', 'devel'],
    prompts: [{ kind: 'text', value: 'pre-upgrade' }, { kind: 'select', value: 'devel' }],
    confirm: true,
  },
  {
    commandId: 'resetdb',
    expectedCommand: 'resetdb',
    expectedArgv: ['devel'],
    prompts: [{ kind: 'select', value: 'devel' }, { kind: 'select', value: '' }],
    confirm: true,
  },
];

async function expectCockpitTopLevelDailyRoute({
  commandId,
  expectedCommand,
  expectedArgv,
  prompts = [],
  confirm = false,
  styled = false,
}: TopLevelCockpitDailyCase) {
  const promptsModule = await import('../src/prompts/index.js');
  vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
  vi.mocked(promptsModule.selectPrompt).mockResolvedValueOnce(cockpitCommand(commandId));
  for (const promptStep of prompts) {
    if (promptStep.kind === 'text') {
      vi.mocked(promptsModule.textPrompt).mockResolvedValueOnce(promptStep.value as never);
      continue;
    }
    vi.mocked(promptsModule.selectPrompt).mockResolvedValueOnce(promptStep.value as never);
  }
  vi.mocked(promptsModule.confirmPrompt).mockResolvedValueOnce(confirm);
  vi.mocked(promptsModule.selectPrompt).mockResolvedValueOnce('exit');
  const { runCli } = await loadCli();

  await runCli([], '/tmp/environment');

  if (styled) {
    expect(mocks.runDailyActionWithStyledOutput).toHaveBeenCalledWith(
      expectedCommand,
      expectedArgv,
      '/tmp/environment',
      expect.any(Function),
      expect.any(Object),
    );
    expect(mocks.runDailyAction).not.toHaveBeenCalled();
    return;
  }

  expect(mocks.runDailyAction).toHaveBeenCalledWith(expectedCommand, expectedArgv, '/tmp/environment');
  expect(mocks.runDailyActionWithStyledOutput).not.toHaveBeenCalled();
}

describe('cli menu environment routes', () => {
  beforeEach(async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.clearAllMocks();
    vi.mocked(prompts.isPromptCancel).mockImplementation(() => false);
    vi.mocked(prompts.confirmPrompt).mockReset();
    vi.mocked(prompts.confirmPrompt).mockResolvedValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.getGitHubPrerequisiteStatus.mockResolvedValue({ status: 'ready' });
  });

  it('returns without action when menu action is exit', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce('exit');
    mocks.getEnvironmentStatus.mockResolvedValueOnce({
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Run ./moo.',
      odooVersion: '19.0',
      sourceRepoCount: 1,
      sourceRepoPaths: ['odoo/custom/src/private/moo_olympiad'],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 0,
      composeFiles: ['compose.yaml'],
      composeErrors: [],
      missingCoreFiles: [],
      moduleQuality: {
        totalModules: 0,
        installableModules: 0,
        nonInstallableModules: 0,
        modulesWithMenuActions: 0,
        modulesMissingMenuActions: 0,
        issues: [],
      },
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.detectDevelopmentEnvironment).toHaveBeenCalledWith('/tmp/environment');
    expect(mocks.addModuleRepo).not.toHaveBeenCalled();
    expect(mocks.removeModuleRepo).not.toHaveBeenCalled();
    expect(mocks.addModuleToSourceRepo).not.toHaveBeenCalled();
    expect(mocks.removeModuleFromSourceRepo).not.toHaveBeenCalled();
    expect(mocks.safeResetEnvironment).not.toHaveBeenCalled();
    expect(mocks.getEnvironmentStatus).toHaveBeenCalledWith('/tmp/environment');
    expect(mocks.renderBanner).toHaveBeenCalledWith(
      ['Environment: Odoo 19.0 · 1 repo · 0 modules', 'Status: ● Services stopped', 'Last: Ready'],
      { version: `v${packageVersion()}` },
    );
    expect(mocks.renderEnvironmentStatusSummary).not.toHaveBeenCalled();
    expect(vi.mocked(prompts.introPrompt)).not.toHaveBeenCalledWith('WPMoo Toolkit');
    expect(vi.mocked(prompts.notePrompt)).not.toHaveBeenCalledWith('Status summary', 'Environment status');
    const topLevelPromptArgs = vi.mocked(prompts.selectPrompt).mock.calls[0]?.[0] as {
      choices?: Array<{ value?: unknown; disabled?: unknown }>;
      disabledError?: unknown;
    };
    const moduleDisabledIds = ['list-modules', 'install', 'update', 'test', 'pot', 'remove-module'];
    for (const commandId of moduleDisabledIds) {
      expect(
        topLevelPromptArgs.choices?.find((choice) => (choice.value as CockpitCommand | undefined)?.id === commandId)
          ?.disabled,
      ).toBe('No modules found.');
    }
    expect(
      topLevelPromptArgs.choices?.find((choice) => (choice.value as CockpitCommand | undefined)?.id === 'add-module')
        ?.disabled,
    ).toBeUndefined();
    expect(
      topLevelPromptArgs.choices?.find((choice) => (choice.value as CockpitCommand | undefined)?.id === 'lint')
        ?.disabled,
    ).toBeUndefined();
    const disabledError =
      typeof topLevelPromptArgs.disabledError === 'function'
        ? (topLevelPromptArgs.disabledError as (activeReason?: string) => string)('No modules found.')
        : topLevelPromptArgs.disabledError;
    expect(disabledError).toContain('Action unavailable');
    expect(disabledError).toContain('Reason  No modules found.');
    expect(disabledError).toContain('Next    choose "Add module" first.');
    const bannerOrder = mocks.renderBanner.mock.invocationCallOrder[0] ?? 0;
    const selectOrder = vi.mocked(prompts.selectPrompt).mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    expect(bannerOrder).toBeLessThan(selectOrder);
  });

  it('uses an alternate terminal screen for the interactive cockpit', async () => {
    const prompts = await import('../src/prompts/index.js');
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');

      expect(writeSpy).toHaveBeenCalledWith('\u001B[?1049h');
      expect(writeSpy).toHaveBeenCalledWith('\u001B[?1049l');
      expect(writeSpy.mock.calls.at(-1)?.[0]).toBe('\u001B[?1049l');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
    }
  });

  it('renders startup banner with service state and repository/module header line', async () => {
    const prompts = await import('../src/prompts/index.js');
    mocks.getServiceRuntimeStatus.mockResolvedValueOnce({ kind: 'running' });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce('exit');
    mocks.getEnvironmentStatus.mockResolvedValueOnce({
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Run ./moo.',
      odooVersion: '19.0',
      sourceRepoCount: 2,
      sourceRepoPaths: ['odoo/custom/src/private/moo_olympiad', 'odoo/custom/src/private/custom_repo'],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 5,
      composeFiles: ['compose.yaml'],
      composeErrors: ['Missing overlay'],
      missingCoreFiles: ['README.md'],
      moduleQuality: {
        totalModules: 0,
        installableModules: 0,
        nonInstallableModules: 0,
        modulesWithMenuActions: 0,
        modulesMissingMenuActions: 0,
        issues: [],
      },
    });

    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderBanner).toHaveBeenCalledWith(
      ['Environment: Odoo 19.0 · 2 repos · 5 modules · 2 issues', 'Status: ● Services running', 'Last: Ready'],
      { version: `v${packageVersion()}` },
    );
  });

  it('renders startup banner with DB ready service state', async () => {
    const prompts = await import('../src/prompts/index.js');
    mocks.getServiceRuntimeStatus.mockResolvedValueOnce({ kind: 'db-ready' });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce('exit');
    mocks.getEnvironmentStatus.mockResolvedValueOnce({
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Run ./moo.',
      odooVersion: '19.0',
      sourceRepoCount: 0,
      sourceRepoPaths: [],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 0,
      composeFiles: ['compose.yaml'],
      composeErrors: [],
      missingCoreFiles: [],
      moduleQuality: {
        totalModules: 0,
        installableModules: 0,
        nonInstallableModules: 0,
        modulesWithMenuActions: 0,
        modulesMissingMenuActions: 0,
        issues: [],
      },
    });

    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderBanner).toHaveBeenCalledWith(
      ['Environment: Odoo 19.0 · 0 repos · 0 modules', 'Status: ● DB ready', 'Last: Ready'],
      { version: `v${packageVersion()}` },
    );
  });

  it('renders startup banner with Odoo not ready service state', async () => {
    const prompts = await import('../src/prompts/index.js');
    mocks.getServiceRuntimeStatus.mockResolvedValueOnce({ kind: 'odoo-not-ready' });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce('exit');
    mocks.getEnvironmentStatus.mockResolvedValueOnce({
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Run ./moo.',
      odooVersion: '19.0',
      sourceRepoCount: 0,
      sourceRepoPaths: [],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 0,
      composeFiles: ['compose.yaml'],
      composeErrors: [],
      missingCoreFiles: [],
      moduleQuality: {
        totalModules: 0,
        installableModules: 0,
        nonInstallableModules: 0,
        modulesWithMenuActions: 0,
        modulesMissingMenuActions: 0,
        issues: [],
      },
    });

    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderBanner).toHaveBeenCalledWith(
      ['Environment: Odoo 19.0 · 0 repos · 0 modules', 'Status: ● Odoo not ready', 'Last: Ready'],
      { version: `v${packageVersion()}` },
    );
  });

  it('renders startup banner with fully ready service state', async () => {
    const prompts = await import('../src/prompts/index.js');
    mocks.getServiceRuntimeStatus.mockResolvedValueOnce({ kind: 'fully-ready' });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce('exit');
    mocks.getEnvironmentStatus.mockResolvedValueOnce({
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Run ./moo.',
      odooVersion: '19.0',
      sourceRepoCount: 0,
      sourceRepoPaths: [],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 0,
      composeFiles: ['compose.yaml'],
      composeErrors: [],
      missingCoreFiles: [],
      moduleQuality: {
        totalModules: 0,
        installableModules: 0,
        nonInstallableModules: 0,
        modulesWithMenuActions: 0,
        modulesMissingMenuActions: 0,
        issues: [],
      },
    });

    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderBanner).toHaveBeenCalledWith(
      ['Environment: Odoo 19.0 · 0 repos · 0 modules', 'Status: ● Fully ready', 'Last: Ready'],
      { version: `v${packageVersion()}` },
    );
  });

  it('includes compose issues in startup banner header so menu status reflects environment drift', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce('exit');
    mocks.getEnvironmentStatus.mockResolvedValueOnce({
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Run ./moo.',
      odooVersion: '19.0',
      sourceRepoCount: 0,
      sourceRepoPaths: [],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 0,
      composeFiles: ['compose.yaml'],
      composeErrors: ['Invalid WPMOO_ENV in .env: expected a simple compose overlay name, got ../stage'],
      missingCoreFiles: [],
      moduleQuality: {
        totalModules: 0,
        installableModules: 0,
        nonInstallableModules: 0,
        modulesWithMenuActions: 0,
        modulesMissingMenuActions: 0,
        issues: [],
      },
    });

    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderBanner).toHaveBeenCalledWith(
      [
        'Environment: Odoo 19.0 · 0 repos · 0 modules · 1 issue',
        'Status: ● Services stopped',
        'Last: Ready',
      ],
      { version: `v${packageVersion()}` },
    );
  });

  it('routes add-repo through prompts, repository preflight, and addModuleRepo', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('add-repo'))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('private')
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.textPrompt).mockResolvedValueOnce('odoo_new_repo');
    mocks.getGitHubRepositoryStatus.mockResolvedValueOnce({
      status: 'inaccessible',
      slug: 'example-org/odoo_new_repo',
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.getGitHubPrerequisiteStatus).toHaveBeenCalledTimes(1);
    expect(mocks.getGitHubRepositoryStatus).toHaveBeenCalledWith(
      expect.anything(),
      'https://github.com/example-org/odoo_new_repo.git',
    );
    expect(mocks.addRepoGitHubCreate).toHaveBeenCalledWith(
      expect.anything(),
      'https://github.com/example-org/odoo_new_repo.git',
      'private',
    );
    expect(mocks.addModuleRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoUrl: 'https://github.com/example-org/odoo_new_repo.git',
      sourceType: 'private',
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });
    expect(mocks.renderBanner).toHaveBeenNthCalledWith(
      2,
      [
        'Environment: Odoo 19.0 · 1 repo · 0 modules',
        'Status: ● Services stopped',
        'Last: Add source repo ✓ completed',
      ],
      { version: `v${packageVersion()}` },
    );
    expect(vi.mocked(console.log).mock.calls.filter((call) => call.length === 0)).toHaveLength(2);
  });

  it('keeps the cockpit open and records an error status when a command fails', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('add-repo'))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('private')
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.textPrompt).mockResolvedValueOnce('odoo_new_repo');
    mocks.getGitHubRepositoryStatus.mockResolvedValueOnce({
      status: 'inaccessible',
      slug: 'example-org/odoo_new_repo',
    });
    mocks.addModuleRepo.mockRejectedValueOnce(new Error('submodule add failed'));
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderBanner).toHaveBeenNthCalledWith(
      2,
      [
        'Environment: Odoo 19.0 · 1 repo · 0 modules',
        'Status: ● Services stopped',
        'Last: Add source repo ✗ Error: submodule add failed',
      ],
      { version: `v${packageVersion()}` },
    );
    expect(vi.mocked(prompts.selectPrompt)).toHaveBeenCalledTimes(4);
  });

  it('refreshes runtime state before running a selected cockpit command', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    mocks.getServiceRuntimeStatus
      .mockResolvedValueOnce({ kind: 'running' })
      .mockResolvedValueOnce({ kind: 'stopped' })
      .mockResolvedValueOnce({ kind: 'stopped' });
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('stop'))
      .mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.runDailyAction).not.toHaveBeenCalled();
    expect(vi.mocked(prompts.notePrompt)).toHaveBeenCalledWith(
      expect.stringContaining('Reason  Services stopped.'),
      'Action unavailable',
    );
  });

  it('runs environment lint in a readable result page instead of module selection', async () => {
    const prompts = await import('../src/prompts/index.js');
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('lint'))
      .mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');

      expect(mocks.runDailyActionWithStyledOutput).toHaveBeenCalledWith(
        'lint',
        [],
        '/tmp/environment',
      );
      expect(writeSpy).toHaveBeenCalledWith('\u001B[H\u001B[2J\u001B[3J\u001B[H');
      expect(vi.mocked(prompts.introPrompt)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(prompts.introPrompt)).toHaveBeenCalledWith('Run environment lint');
      expect(mocks.listModulesInEnvironment).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
    }
  });

  it('uses the prompt cancel guard for result page back navigation', async () => {
    const prompts = await import('../src/prompts/index.js');
    const originalIsTTY = process.stdin.isTTY;
    const originalSetRawMode = process.stdin.setRawMode;
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    Object.defineProperty(process.stdin, 'setRawMode', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    let menuCount = 0;
    vi.mocked(prompts.selectPrompt).mockImplementation(async (options) => {
      if (options.message === 'Result') {
        return 'back';
      }
      menuCount += 1;
      return menuCount === 1 ? cockpitCommand('lint') : 'exit';
    });
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');

      expect(vi.mocked(prompts.selectPrompt)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Result',
          hideMessage: true,
          navigationHelp: 'back',
        }),
      );
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalIsTTY });
      Object.defineProperty(process.stdin, 'setRawMode', { configurable: true, value: originalSetRawMode });
    }
  });

  it('shows diagnostics in result pages before returning to the cockpit', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('status'))
      .mockResolvedValueOnce(cockpitCommand('doctor'))
      .mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(vi.mocked(prompts.notePrompt)).toHaveBeenCalledWith(
      expect.stringContaining('Environment status'),
      'Environment status',
    );
    expect(vi.mocked(prompts.notePrompt)).toHaveBeenCalledWith(
      expect.not.stringContaining('Run doctor'),
      'Doctor',
    );
    expect(mocks.renderBanner).toHaveBeenCalledWith(
      ['Environment: Odoo 19.0 · 1 repo · 0 modules', 'Status: ● Services stopped', 'Last: Environment status'],
      { version: `v${packageVersion()}` },
    );
    expect(mocks.renderBanner).toHaveBeenCalledWith(
      ['Environment: Odoo 19.0 · 1 repo · 0 modules', 'Status: ● Services stopped', 'Last: Run doctor'],
      { version: `v${packageVersion()}` },
    );
  });

  it('routes remove-repo and calls removeModuleRepo with selected repository', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('remove-repo'))
      .mockResolvedValueOnce('odoo_source_repo')
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.confirmPrompt).mockResolvedValueOnce(true);
    mocks.listModuleRepos.mockResolvedValueOnce(['odoo_source_repo']);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.removeModuleRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoPath: 'odoo_source_repo',
      stage: true,
    });
  });

  it('routes add-module and calls addModuleToSourceRepo with selected repo and module', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('add-module'))
      .mockResolvedValueOnce('odoo_source_repo')
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.textPrompt).mockResolvedValueOnce('odoo_module_new');
    mocks.listModuleRepos.mockResolvedValueOnce(['odoo_source_repo']);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    const modulePromptArgs = vi.mocked(prompts.textPrompt).mock.calls[0]?.[0];
    expect(modulePromptArgs?.validate?.('invalid-module')).toBe(
      'Invalid module name: use lower snake_case letters, numbers, and underscores, and start with a letter.',
    );
    expect(modulePromptArgs?.validate?.('odoo_module_new')).toBeUndefined();

    expect(mocks.addModuleToSourceRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoPath: 'odoo_source_repo',
      sourceType: 'private',
      moduleName: 'odoo_module_new',
      odooVersion: '19.0',
      stage: true,
    });
  });

  it('shows source-repo context and routes add-module with selected repo type', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    mocks.listSources.mockResolvedValueOnce([
      {
        type: 'private',
        path: 'odoo_source_repo',
        url: 'https://github.com/example-org/odoo_source_repo.git',
        addons: ['odoo_source_repo'],
      },
      {
        type: 'oca',
        path: 'odoo_source_repo',
        url: 'https://github.com/OCA/odoo_source_repo.git',
        addons: ['odoo_source_repo'],
      },
      {
        type: 'external',
        path: 'external_repo',
        url: 'https://github.com/example-org/external_repo.git',
        addons: ['external_repo'],
      },
    ]);

    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('add-module'))
      .mockResolvedValueOnce({ repoPath: 'odoo_source_repo', sourceType: 'oca' })
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.textPrompt).mockResolvedValueOnce('odoo_module_new');

    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    const repoSelectionArgs = vi.mocked(prompts.selectPrompt).mock.calls[1]?.[0];
    expect(repoSelectionArgs).toMatchObject({
      options: [
        { value: { repoPath: 'odoo_source_repo', sourceType: 'private' }, label: 'private/odoo_source_repo' },
        { value: { repoPath: 'odoo_source_repo', sourceType: 'oca' }, label: 'oca/odoo_source_repo' },
        { value: { repoPath: 'external_repo', sourceType: 'external' }, label: 'external/external_repo' },
      ],
    });
    expect(mocks.addModuleToSourceRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoPath: 'odoo_source_repo',
      sourceType: 'oca',
      moduleName: 'odoo_module_new',
      odooVersion: '19.0',
      stage: true,
    });
  });

  it('routes remove-module and calls removeModuleFromSourceRepo with deleteFiles false', async () => {
    const prompts = await import('../src/prompts/index.js');
    const selectedModule = {
      moduleName: 'odoo_module_old',
      repoPath: 'odoo_source_repo',
      sourceType: 'private' as const,
    };
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('remove-module'))
      .mockResolvedValueOnce(selectedModule)
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.confirmPrompt).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.listModulesInEnvironment.mockResolvedValueOnce([selectedModule]);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    const modulePromptArgs = vi.mocked(prompts.selectPrompt).mock.calls[1]?.[0];
    expect(modulePromptArgs).toMatchObject({
      message: '',
      hideMessage: true,
      navigationHelp: 'back',
      loop: false,
    });
    expect(mocks.removeModuleFromSourceRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoPath: 'odoo_source_repo',
      sourceType: 'private',
      moduleName: 'odoo_module_old',
      deleteFiles: false,
      stage: true,
    });
    expect(vi.mocked(prompts.confirmPrompt)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Delete module files too?',
        initialValue: true,
      }),
    );
  });

  it.each(topLevelCockpitDailyCases)('routes top-level %s command from cockpit menu to runDailyAction', async ({
    commandId,
    expectedCommand,
    expectedArgv,
    prompts,
    confirm,
    styled,
  }) => {
    await expectCockpitTopLevelDailyRoute({
      commandId,
      expectedCommand,
      expectedArgv,
      prompts,
      confirm,
      styled,
    });
  });

  it('routes status menu selection to status rendering', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce(cockpitCommand('status')).mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.getEnvironmentStatus).toHaveBeenCalledWith('/tmp/environment');
    expect(vi.mocked(prompts.notePrompt)).toHaveBeenCalledWith(
      expect.stringContaining('Environment status'),
      'Environment status',
    );
  });

  it('routes doctor menu selection to runDoctor and shows doctor output', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce(cockpitCommand('doctor')).mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.getDoctorReport).toHaveBeenCalledWith('/tmp/environment');
    expect(vi.mocked(prompts.notePrompt)).toHaveBeenCalledWith(expect.not.stringContaining('Run doctor'), 'Doctor');
  });

  it.each([
    ['update', 'update', ['odoo_sample_module_base'], 'Update module'],
    ['test', 'test', ['odoo_sample_module_base'], 'Test module'],
    ['lint', 'lint', [], 'Run environment lint'],
  ] as const)('routes list-modules selected module action %s to a result page', async (moduleAction, dailyAction, argv, title) => {
    const prompts = await import('../src/prompts/index.js');
    const selectedModule = {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private' as const,
    };
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    mocks.listModulesInEnvironment.mockResolvedValueOnce([selectedModule]);
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('list-modules'))
      .mockResolvedValueOnce(selectedModule)
      .mockResolvedValueOnce(moduleAction)
      .mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');

      expect(mocks.listModulesInEnvironment).toHaveBeenCalledWith('/tmp/environment');
      expect(vi.mocked(prompts.introPrompt)).toHaveBeenCalledWith('List modules');
      expect(vi.mocked(prompts.introPrompt)).toHaveBeenCalledWith(title);
      expect(writeSpy).toHaveBeenCalledWith('\u001B[H\u001B[2J\u001B[3J\u001B[H');
      expect(mocks.runDailyActionWithStyledOutput).toHaveBeenCalledWith(dailyAction, argv, '/tmp/environment');
      expect(vi.mocked(prompts.notePrompt)).toHaveBeenCalledWith(expect.stringContaining('completed'), 'Done');
    } finally {
      writeSpy.mockRestore();
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
    }
  });

  it('returns from list-modules action results to the selected module action menu', async () => {
    const prompts = await import('../src/prompts/index.js');
    const selectedModule = {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private' as const,
    };
    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalStdinIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    mocks.listModulesInEnvironment.mockResolvedValue([selectedModule]);
    mocks.runDailyActionWithStyledOutput.mockImplementationOnce(async () => {
      setImmediate(() => process.stdin.emit('keypress', '', { name: 'escape' }));
    });
    vi.mocked(prompts.isPromptCancel).mockImplementation((value) => String(value).startsWith('cancelled'));
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('list-modules'))
      .mockResolvedValueOnce(selectedModule)
      .mockResolvedValueOnce('update')
      .mockResolvedValueOnce('cancelled-action-menu')
      .mockResolvedValueOnce('cancelled-module-list')
      .mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');

      expect(mocks.runDailyActionWithStyledOutput).toHaveBeenCalledWith('update', ['odoo_sample_module_base'], '/tmp/environment');
      const actionMenuCalls = vi.mocked(prompts.selectPrompt).mock.calls.filter((call) => {
        const options = call[0] as { message?: string };
        return options.message === 'Module: odoo_sample_module_base';
      });
      expect(actionMenuCalls).toHaveLength(2);
      expect(writeSpy).toHaveBeenCalledWith('\u001B[H\u001B[2J\u001B[3J\u001B[H');
      const actionMenuOrders = vi.mocked(prompts.selectPrompt).mock.invocationCallOrder.filter((_, index) => {
        const options = vi.mocked(prompts.selectPrompt).mock.calls[index]?.[0] as { message?: string };
        return options.message === 'Module: odoo_sample_module_base';
      });
      const runOrder = mocks.runDailyActionWithStyledOutput.mock.invocationCallOrder[0];
      const clearBeforeSecondMenu = writeSpy.mock.invocationCallOrder.find(
        (order) => order > runOrder && order < actionMenuOrders[1],
      );
      expect(clearBeforeSecondMenu).toBeDefined();
    } finally {
      writeSpy.mockRestore();
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalStdoutIsTTY });
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalStdinIsTTY });
    }
  });

  it.each([
    {
      commandId: 'update',
      title: 'Update module',
      textValues: [],
      selectValuesAfterModule: [],
      expectedCommand: 'update',
      expectedArgv: ['odoo_sample_module_base'],
      expectsDatabasePrompt: false,
    },
    {
      commandId: 'test',
      title: 'Run tests',
      textValues: [],
      selectValuesAfterModule: [],
      expectedCommand: 'test',
      expectedArgv: ['odoo_sample_module_base'],
      expectsDatabasePrompt: false,
    },
    {
      commandId: 'pot',
      title: 'Generate POT',
      textValues: [],
      selectValuesAfterModule: [],
      expectedCommand: 'pot',
      expectedArgv: ['odoo_sample_module_base'],
      expectsDatabasePrompt: false,
    },
  ] as const)('uses the grouped module browser for direct $title', async ({
    commandId,
    title,
    textValues,
    selectValuesAfterModule,
    expectedCommand,
    expectedArgv,
    expectsDatabasePrompt,
  }) => {
    const prompts = await import('../src/prompts/index.js');
    const selectedModule = {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private' as const,
    };
    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalStdinIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    mocks.listModulesInEnvironment.mockResolvedValue([selectedModule]);
    mocks.runDailyActionWithStyledOutput.mockImplementationOnce(async () => {
      setImmediate(() => process.stdin.emit('keypress', '', { name: 'escape' }));
    });
    vi.mocked(prompts.isPromptCancel).mockImplementation((value) => value === 'cancelled-module-selection');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand(commandId))
      .mockResolvedValueOnce(selectedModule);
    for (const selectedValue of selectValuesAfterModule) {
      vi.mocked(prompts.selectPrompt).mockResolvedValueOnce(selectedValue);
    }
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce('cancelled-module-selection')
      .mockResolvedValueOnce('exit');
    for (const textValue of textValues) {
      vi.mocked(prompts.textPrompt).mockResolvedValueOnce(textValue);
    }
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');

      expect(mocks.runDailyActionWithStyledOutput).toHaveBeenCalledWith(expectedCommand, expectedArgv, '/tmp/environment');
      expect(mocks.runDailyAction).not.toHaveBeenCalled();
      expect(vi.mocked(prompts.textPrompt)).not.toHaveBeenCalled();
      if (expectsDatabasePrompt) {
        expect(mocks.listEnvironmentDatabases).toHaveBeenCalledWith('/tmp/environment', {});
        const databaseSelectionCall = vi.mocked(prompts.selectPrompt).mock.calls.find((call) => {
          const options = call[0] as { message?: string; options?: Array<{ value: string }> };
          return options.options?.some((option) => option.value === 'devel');
        });
        expect(databaseSelectionCall?.[0]).toMatchObject({
          message: 'Odoo database',
        });
      } else {
        expect(mocks.listEnvironmentDatabases).not.toHaveBeenCalled();
      }
      const moduleSelectionCalls = vi.mocked(prompts.selectPrompt).mock.calls.filter((call) => {
        const options = call[0] as { choices?: Array<{ value?: { moduleName?: string } }> };
        return options.choices?.some((option) => option.value?.moduleName === 'odoo_sample_module_base');
      });
      expect(moduleSelectionCalls).toHaveLength(2);
      expect(vi.mocked(prompts.introPrompt)).toHaveBeenCalledWith(title);
      expect(writeSpy).toHaveBeenCalledWith('\u001B[H\u001B[2J\u001B[3J\u001B[H');
      const moduleSelectionOrders = vi.mocked(prompts.selectPrompt).mock.invocationCallOrder.filter((_, index) => {
        const options = vi.mocked(prompts.selectPrompt).mock.calls[index]?.[0] as { choices?: Array<{ value?: { moduleName?: string } }> };
        return options.choices?.some((option) => option.value?.moduleName === 'odoo_sample_module_base');
      });
      const runOrder = mocks.runDailyActionWithStyledOutput.mock.invocationCallOrder[0];
      const clearBeforeSecondSelection = writeSpy.mock.invocationCallOrder.find(
        (order) => order > runOrder && order < moduleSelectionOrders[1],
      );
      expect(clearBeforeSecondSelection).toBeDefined();
    } finally {
      writeSpy.mockRestore();
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalStdoutIsTTY });
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalStdinIsTTY });
    }
  });

  it('configures top-level Escape as a no-op in the active cockpit prompt', async () => {
    const prompts = await import('../src/prompts/index.js');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
    vi.mocked(prompts.selectPrompt).mockImplementation(async (options) => {
      const config = options as {
        escapeBehavior?: string;
      };

      expect(config.escapeBehavior).toBe('ignore');
      return 'exit';
    });
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');

      expect(vi.mocked(prompts.selectPrompt)).toHaveBeenCalledTimes(1);
      expect(writeSpy).not.toHaveBeenCalledWith('\u001B[H\u001B[2J\u001B[3J\u001B[H');
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('routes list-modules delete action to selected module removal', async () => {
    const prompts = await import('../src/prompts/index.js');
    const selectedModule = {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private' as const,
    };
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    mocks.listModulesInEnvironment.mockResolvedValueOnce([selectedModule]);
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('list-modules'))
      .mockResolvedValueOnce(selectedModule)
      .mockResolvedValueOnce('delete')
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.confirmPrompt).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.removeModuleFromSourceRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoPath: 'odoo_sample_module',
      sourceType: 'private',
      moduleName: 'odoo_sample_module_base',
      deleteFiles: false,
      stage: true,
    });
    expect(vi.mocked(prompts.confirmPrompt)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Delete module files too?',
        initialValue: true,
      }),
    );
  });

  it('routes reset and calls safeResetEnvironment after confirmation', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.mocked(prompts.selectPrompt).mockResolvedValueOnce(cockpitCommand('safe-reset')).mockResolvedValueOnce('exit');
    vi.mocked(prompts.confirmPrompt).mockResolvedValueOnce(true);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderSafeResetPreview).toHaveBeenCalledWith('/tmp/environment', true);
    expect(mocks.safeResetEnvironment).toHaveBeenCalledWith({ target: '/tmp/environment', stage: true });
  });

  it('lets safe reset generated file rows be toggled before confirmation', async () => {
    const prompts = await import('../src/prompts/index.js');
    const originalStdinIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    mocks.safeResetSelectableGeneratedPaths.mockReturnValueOnce(['README.md', '.env.example']);
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('safe-reset'))
      .mockResolvedValueOnce('toggle:README.md')
      .mockResolvedValueOnce('continue')
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.confirmPrompt).mockResolvedValueOnce(true);
    const { runCli } = await loadCli();

    try {
      await runCli([], '/tmp/environment');
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalStdinIsTTY });
    }

    expect(mocks.renderSafeResetSelectedPreview).toHaveBeenCalledWith(
      '/tmp/environment',
      true,
      ['README.md', '.env.example'],
    );
    expect(mocks.renderSafeResetSelectedPreview).toHaveBeenCalledWith('/tmp/environment', true, ['.env.example']);
    expect(mocks.safeResetEnvironment).toHaveBeenCalledWith({
      target: '/tmp/environment',
      stage: true,
      includeGeneratedPaths: ['.env.example'],
    });
  });

  it('handles a back/cancel signal and loops to the menu again', async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.mocked(prompts.selectPrompt)
      .mockResolvedValueOnce(cockpitCommand('add-repo'))
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.textPrompt).mockResolvedValueOnce('cancelled');
    vi.mocked(prompts.isPromptCancel).mockImplementationOnce(() => false).mockImplementationOnce(() => true);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(prompts.selectPrompt).toHaveBeenCalledTimes(2);
    expect(prompts.textPrompt).toHaveBeenCalledTimes(1);
    expect(mocks.addModuleRepo).not.toHaveBeenCalled();
  });
});
