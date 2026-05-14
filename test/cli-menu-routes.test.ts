import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  listModuleRepos: vi.fn(async () => ['odoo_sample_module']),
  listModulesInSourceRepo: vi.fn(async () => ['odoo_sample_module_base']),
  removeModuleFromSourceRepo: vi.fn(async () => undefined),
  removeModuleRepo: vi.fn(async () => undefined),
  renderBanner: vi.fn(() => 'mock banner'),
  renderSafeResetPreview: vi.fn(() => 'safe reset preview'),
  repositoryPreflightAvailable: vi.fn(async () => true),
  renderEnvironmentStatusSummary: vi.fn(() => 'Status summary'),
  getEnvironmentStatus: vi.fn(async () => ({ mock: true })),
  safeResetEnvironment: vi.fn(async () => undefined),
}));

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => false),
  intro: vi.fn(),
  isCancel: vi.fn(() => false),
  note: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
}));

vi.mock('../src/environment.js', () => ({
  detectDevelopmentEnvironment: mocks.detectDevelopmentEnvironment,
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

async function loadCli() {
  vi.resetModules();
  return import('../src/cli.js');
}

describe('cli menu environment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('returns without action when menu action is exit', async () => {
    const prompts = await import('@clack/prompts');
    vi.mocked(prompts.select).mockResolvedValueOnce('exit');
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.detectDevelopmentEnvironment).toHaveBeenCalledWith('/tmp/environment');
    expect(mocks.addModuleRepo).not.toHaveBeenCalled();
    expect(mocks.removeModuleRepo).not.toHaveBeenCalled();
    expect(mocks.addModuleToSourceRepo).not.toHaveBeenCalled();
    expect(mocks.removeModuleFromSourceRepo).not.toHaveBeenCalled();
    expect(mocks.safeResetEnvironment).not.toHaveBeenCalled();
    expect(mocks.getEnvironmentStatus).toHaveBeenCalledWith('/tmp/environment');
    expect(mocks.renderEnvironmentStatusSummary).toHaveBeenCalledWith({ mock: true });
    expect(vi.mocked(prompts.note)).toHaveBeenCalledWith('Status summary', 'Environment status');
    const noteOrder = vi.mocked(prompts.note).mock.invocationCallOrder[0] ?? 0;
    const selectOrder = vi.mocked(prompts.select).mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    expect(noteOrder).toBeLessThan(selectOrder);
  });

  it('routes add-repo through prompts, repository preflight, and addModuleRepo', async () => {
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('add-repo')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('private');
    vi.mocked(prompts.text).mockResolvedValueOnce('odoo_new_repo');
    mocks.getGitHubRepositoryStatus.mockResolvedValueOnce({
      status: 'inaccessible',
      slug: 'example-org/odoo_new_repo',
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.repositoryPreflightAvailable).toHaveBeenCalledTimes(1);
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
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });
  });

  it('routes remove-repo and calls removeModuleRepo with selected repository', async () => {
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.select).mockResolvedValueOnce('remove-repo').mockResolvedValueOnce('odoo_source_repo');
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
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.select).mockResolvedValueOnce('add-module').mockResolvedValueOnce('odoo_source_repo');
    vi.mocked(prompts.text).mockResolvedValueOnce('odoo_module_new');
    mocks.listModuleRepos.mockResolvedValueOnce(['odoo_source_repo']);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.addModuleToSourceRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoPath: 'odoo_source_repo',
      moduleName: 'odoo_module_new',
      odooVersion: '19.0',
      stage: true,
    });
  });

  it('routes remove-module and calls removeModuleFromSourceRepo with deleteFiles false', async () => {
    const prompts = await import('@clack/prompts');
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/environment');
    vi.mocked(prompts.select)
      .mockResolvedValueOnce('remove-module')
      .mockResolvedValueOnce('odoo_source_repo')
      .mockResolvedValueOnce('odoo_module_old');
    vi.mocked(prompts.confirm).mockResolvedValueOnce(false);
    mocks.listModuleRepos.mockResolvedValueOnce(['odoo_source_repo']);
    mocks.listModulesInSourceRepo.mockResolvedValueOnce(['odoo_module_old']);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.removeModuleFromSourceRepo).toHaveBeenCalledWith({
      target: '/tmp/environment',
      repoPath: 'odoo_source_repo',
      moduleName: 'odoo_module_old',
      deleteFiles: false,
      stage: true,
    });
  });

  it('routes reset and calls safeResetEnvironment after confirmation', async () => {
    const prompts = await import('@clack/prompts');
    vi.mocked(prompts.select).mockResolvedValueOnce('reset');
    vi.mocked(prompts.confirm).mockResolvedValueOnce(true);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(mocks.renderSafeResetPreview).toHaveBeenCalledWith('/tmp/environment', true);
    expect(mocks.safeResetEnvironment).toHaveBeenCalledWith({ target: '/tmp/environment', stage: true });
  });

  it('handles a back/cancel signal and loops to the menu again', async () => {
    const prompts = await import('@clack/prompts');
    vi.mocked(prompts.select).mockResolvedValueOnce('add-repo').mockResolvedValueOnce('exit');
    vi.mocked(prompts.isCancel)
      .mockImplementationOnce(() => true)
      .mockImplementation(() => false);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/environment');

    expect(prompts.select).toHaveBeenCalledTimes(2);
    expect(mocks.addModuleRepo).not.toHaveBeenCalled();
  });
});
