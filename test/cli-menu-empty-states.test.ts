import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cockpitCommands, type CockpitCommand } from '../src/cockpit/command-registry.js';

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
  listSources: vi.fn(async () => [] as { type: 'private' | 'oca' | 'external'; path: string; url: string; addons: string[] }[]),
  listModuleRepos: vi.fn(async () => ['odoo_source_repo']),
  listModulesInSourceRepo: vi.fn(async () => ['odoo_module_old']),
  removeModuleFromSourceRepo: vi.fn(async () => undefined),
  removeModuleRepo: vi.fn(async () => undefined),
  renderBanner: vi.fn(() => 'mock banner'),
  renderSafeResetPreview: vi.fn(() => 'safe reset preview'),
  repositoryPreflightAvailable: vi.fn(async () => true),
  renderEnvironmentStatusSummary: vi.fn(() => 'Status summary'),
  getEnvironmentStatus: vi.fn(async () => ({ mock: true })),
  safeResetEnvironment: vi.fn(async () => undefined),
}));

function cockpitCommand(id: string): CockpitCommand {
  const command = cockpitCommands.find((entry) => entry.id === id);
  expect(command).toBeDefined();
  return command!;
}

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => false),
  intro: vi.fn(),
  isCancel: vi.fn(() => false),
  note: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
}));

vi.mock('../src/environment.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/environment.js')>();
  return {
    ...actual,
    detectDevelopmentEnvironment: mocks.detectDevelopmentEnvironment,
  };
});

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
    listModulesInSourceRepo: mocks.listModulesInSourceRepo,
    removeModuleFromSourceRepo: mocks.removeModuleFromSourceRepo,
  };
});

vi.mock('../src/safe-reset.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/safe-reset.js')>();
  return {
    ...actual,
    renderSafeResetPreview: mocks.renderSafeResetPreview,
    safeResetEnvironment: mocks.safeResetEnvironment,
  };
});

vi.mock('../src/repository-preflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repository-preflight.js')>();
  return {
    ...actual,
    repositoryPreflightAvailable: mocks.repositoryPreflightAvailable,
  };
});

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

vi.mock('../src/source-actions.js', () => ({
  listSources: mocks.listSources,
}));

async function loadCli() {
  vi.resetModules();
  return import('../src/cli.js');
}

describe('cli menu empty and cancel states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('shows note and loops back when remove-repo has no source repos', async () => {
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('repositories')
      .mockResolvedValueOnce(cockpitCommand('remove-repo'))
      .mockResolvedValueOnce('exit');
    mocks.listModuleRepos.mockResolvedValueOnce([]);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(prompts.note).toHaveBeenCalledWith(
      'No module submodules found under /tmp/environment/odoo/custom/src/private.\nNext: choose "Add source repo" first.',
      'Nothing to remove',
    );
    expect(prompts.select).toHaveBeenCalledTimes(3);
    expect(mocks.removeModuleRepo).not.toHaveBeenCalled();
  });

  it('shows note and loops back when add-module has no source repos', async () => {
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('modules')
      .mockResolvedValueOnce(cockpitCommand('add-module'))
      .mockResolvedValueOnce('exit');
    mocks.listModuleRepos.mockResolvedValueOnce([]);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(prompts.note).toHaveBeenCalledWith(
      'No source repos found under /tmp/environment/odoo/custom/src.\nNext: choose "Add source repo" first.',
      'Nothing to select',
    );
    expect(prompts.select).toHaveBeenCalledTimes(3);
    expect(mocks.addModuleToSourceRepo).not.toHaveBeenCalled();
  });

  it('shows note and loops back when remove-module has no modules in selected repo', async () => {
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('modules')
      .mockResolvedValueOnce(cockpitCommand('remove-module'))
      .mockResolvedValueOnce('odoo_source_repo')
      .mockResolvedValueOnce('exit');
    mocks.listModuleRepos.mockResolvedValueOnce(['odoo_source_repo']);
    mocks.listModulesInSourceRepo.mockResolvedValueOnce([]);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(prompts.note).toHaveBeenCalledWith(
      'No Odoo modules found under /tmp/environment/odoo/custom/src/private/odoo_source_repo.\nNext: choose "Add module to source repo" first.',
      'Nothing to remove',
    );
    expect(prompts.select).toHaveBeenCalledTimes(4);
    expect(mocks.removeModuleFromSourceRepo).not.toHaveBeenCalled();
  });

  it('loops back when safe reset confirmation is false and does not call safe reset', async () => {
    const prompts = await import('@clack/prompts');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('maintenance')
      .mockResolvedValueOnce(cockpitCommand('safe-reset'))
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.confirm).mockResolvedValueOnce(false);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderSafeResetPreview).toHaveBeenCalledWith('/tmp/environment', true);
    expect(prompts.select).toHaveBeenCalledTimes(3);
    expect(mocks.safeResetEnvironment).not.toHaveBeenCalled();
  });

  it('handles submenu prompt cancellation via isCancel as back and returns to menu', async () => {
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should not be called');
    });
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('repositories')
      .mockResolvedValueOnce(cockpitCommand('remove-repo'))
      .mockResolvedValueOnce('cancelled')
      .mockResolvedValueOnce('exit');
    vi.mocked(prompts.isCancel)
      .mockImplementationOnce(() => false)
      .mockImplementationOnce(() => false)
      .mockImplementationOnce(() => true)
      .mockImplementation(() => false);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(prompts.select).toHaveBeenCalledTimes(4);
    expect(mocks.removeModuleRepo).not.toHaveBeenCalled();
  });
});
