import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cockpitCommands, type CockpitCommand } from '../src/cockpit/command-registry.js';
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
  getServiceRuntimeStatus: vi.fn(async () => ({ kind: 'stopped' as const })),
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
  runDailyAction: vi.fn(async () => undefined),
  runDailyActionWithStyledOutput: vi.fn(async () => undefined),
  renderBanner: vi.fn(() => 'mock banner'),
  renderSafeResetPreview: vi.fn(() => 'safe reset preview'),
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
    sourceRepoPaths: ['odoo/custom/src/private/moo_olympiad'],
    invalidSourceRepoPaths: [],
    moduleCandidateCount: 0,
    composeFiles: ['compose.yaml'],
    composeErrors: [],
    missingCoreFiles: [],
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
  listEnvironmentDatabases: mocks.listEnvironmentDatabases,
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

vi.mock('../src/status.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/status.js')>();
  return {
    ...actual,
    getEnvironmentStatus: mocks.getEnvironmentStatus,
    renderEnvironmentStatusSummary: mocks.renderEnvironmentStatusSummary,
  };
});

async function loadCli() {
  vi.resetModules();
  return import('../src/cli.js');
}

describe('cli menu environment routes', () => {
  beforeEach(async () => {
    const prompts = await import('../src/prompts/index.js');
    vi.clearAllMocks();
    vi.mocked(prompts.isPromptCancel).mockImplementation(() => false);
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
    const bannerOrder = mocks.renderBanner.mock.invocationCallOrder[0] ?? 0;
    const selectOrder = vi.mocked(prompts.selectPrompt).mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    expect(bannerOrder).toBeLessThan(selectOrder);
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
  });

  it.each([
    ['update', 'update', ['odoo_sample_module_base'], 'Update module'],
    ['test', 'test', ['odoo_sample_module_base'], 'Test module'],
    ['lint', 'lint', [], 'Run lint'],
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
      expect(writeSpy).toHaveBeenCalledWith('\u001B[2J\u001B[H');
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
      expect(writeSpy).toHaveBeenCalledWith('\u001B[2J\u001B[H');
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
      commandId: 'lint',
      title: 'Run lint',
      textValues: [],
      selectValuesAfterModule: [],
      expectedCommand: 'lint',
      expectedArgv: [],
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
      expect(writeSpy).toHaveBeenCalledWith('\u001B[2J\u001B[H');
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
      expect(writeSpy).not.toHaveBeenCalledWith('\u001B[2J\u001B[H');
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
