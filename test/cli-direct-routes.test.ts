import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  addModuleRepo: vi.fn(async () => undefined),
  removeModuleRepo: vi.fn(async () => undefined),
  addModuleToSourceRepo: vi.fn(async () => undefined),
  removeModuleFromSourceRepo: vi.fn(async () => undefined),
  safeResetEnvironment: vi.fn(async () => undefined),
  listSources: vi.fn(async () => [] as unknown[]),
  renderSourceList: vi.fn(() => 'mock source list'),
  syncSources: vi.fn(async () => [] as unknown[]),
  runDoctor: vi.fn(async () => 'doctor report'),
  renderBanner: vi.fn(() => 'mock banner'),
  commandOdooVersion: vi.fn(async () => '18.0-mocked'),
  installPromptCancelKeyTracker: vi.fn(),
  isUpdateCheckSkipped: vi.fn(() => false),
}));

const promptMocks = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
}));

vi.mock('@clack/prompts', () => promptMocks);

vi.mock('../src/repo-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repo-actions.js')>();
  return {
    ...actual,
    addModuleRepo: mocks.addModuleRepo,
    removeModuleRepo: mocks.removeModuleRepo,
    listModuleRepos: vi.fn(async () => []),
  };
});

vi.mock('../src/module-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/module-actions.js')>();
  return {
    ...actual,
    addModuleToSourceRepo: mocks.addModuleToSourceRepo,
    removeModuleFromSourceRepo: mocks.removeModuleFromSourceRepo,
    listModulesInSourceRepo: vi.fn(async () => []),
  };
});

vi.mock('../src/safe-reset.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/safe-reset.js')>();
  return {
    ...actual,
    safeResetEnvironment: mocks.safeResetEnvironment,
  };
});

vi.mock('../src/source-actions.js', () => ({
  listSources: mocks.listSources,
  renderSourceList: mocks.renderSourceList,
  syncSources: mocks.syncSources,
}));

vi.mock('../src/doctor.js', () => ({
  runDoctor: mocks.runDoctor,
}));

vi.mock('../src/templates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/templates.js')>();
  return {
    ...actual,
    renderBanner: mocks.renderBanner,
  };
});

vi.mock('../src/environment-version.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/environment-version.js')>();
  return {
    ...actual,
    commandOdooVersion: mocks.commandOdooVersion,
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

async function loadCli() {
  vi.resetModules();
  return import('../src/cli.js');
}

describe('cli direct command routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes add-repo with full args to addModuleRepo and prints banner/outro', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-add-repo');

    await runCli(
      [
        'add-repo',
        '--repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--repo',
        'odoo_sample_module',
        '--target',
        target,
        '--odoo-version',
        '17.0',
        '--init-empty-repos=true',
        '--stage=false',
      ],
      '/tmp/ignored-cwd',
    );

    expect(mocks.commandOdooVersion).toHaveBeenCalledWith(target, '17.0');
    expect(mocks.addModuleRepo).toHaveBeenCalledWith({
      target,
      repoUrl: 'https://github.com/example-org/odoo_sample_module.git',
      repoPath: 'odoo_sample_module',
      sourceType: 'private',
      odooVersion: '18.0-mocked',
      initEmptyRepos: true,
      stage: false,
    });
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(promptMocks.outro).toHaveBeenCalledWith(`Added source repo under ${target}/odoo/custom/src/private/odoo_sample_module.`);
  });

  it('routes add-repo with --source-type oca to target the OCA source directory', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-add-repo-oca');

    await runCli(
      [
        'add-repo',
        '--repo-url',
        'https://github.com/example-org/odoo_sample_module_oca.git',
        '--source-type',
        'oca',
        '--repo',
        'odoo_sample_module_oca',
        '--target',
        target,
        '--stage=false',
      ],
      '/tmp/ignored-cwd',
    );

    expect(mocks.addModuleRepo).toHaveBeenCalledWith({
      target,
      repoUrl: 'https://github.com/example-org/odoo_sample_module_oca.git',
      repoPath: 'odoo_sample_module_oca',
      sourceType: 'oca',
      odooVersion: '18.0-mocked',
      initEmptyRepos: false,
      stage: false,
    });
    expect(promptMocks.outro).toHaveBeenCalledWith(`Added source repo under ${target}/odoo/custom/src/oca/odoo_sample_module_oca.`);
    expect(logSpy).toHaveBeenCalledWith('mock banner');
  });

  it('routes remove-repo with full args to removeModuleRepo and prints banner/outro', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-remove-repo');

    await runCli(
      ['remove-repo', '--repo', 'odoo_sample_module', '--target', target, '--stage=false'],
      '/tmp/ignored-cwd',
    );

    expect(mocks.removeModuleRepo).toHaveBeenCalledWith({
      target,
      repoPath: 'odoo_sample_module',
      stage: false,
    });
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(promptMocks.outro).toHaveBeenCalledWith(`Removed source repo odoo_sample_module from ${target}.`);
  });

  it('routes remove-repo with --source-type to remove the selected source directory', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-remove-repo-oca');

    await runCli(
      ['remove-repo', '--repo', 'odoo_sample_module', '--source-type', 'oca', '--target', target, '--stage=false'],
      '/tmp/ignored-cwd',
    );

    expect(mocks.removeModuleRepo).toHaveBeenCalledWith({
      target,
      repoPath: 'odoo_sample_module',
      sourceType: 'oca',
      stage: false,
    });
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(promptMocks.outro).toHaveBeenCalledWith(`Removed source repo odoo_sample_module from ${target}.`);
  });

  it('routes source list to render configured source repositories', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-source-list');
    const sources = [
      {
        type: 'oca' as const,
        path: 'server-tools',
        url: 'https://github.com/OCA/server-tools.git',
        branch: '19.0',
        addons: ['queue_job'],
      },
    ];
    mocks.listSources.mockResolvedValueOnce(sources);

    await runCli(['source', 'list', '--target', target], '/tmp/ignored-cwd');

    expect(mocks.listSources).toHaveBeenCalledWith(target);
    expect(mocks.renderSourceList).toHaveBeenCalledWith(sources);
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(logSpy).toHaveBeenCalledWith('mock source list');
  });

  it('routes source sync to regenerate source manifest state', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-source-sync');

    await runCli(['source', 'sync', '--target', target, '--stage=false'], '/tmp/ignored-cwd');

    expect(mocks.syncSources).toHaveBeenCalledWith({
      target,
      stage: false,
    });
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(promptMocks.outro).toHaveBeenCalledWith(`Synced source manifest in ${target}.`);
  });

  it('routes source add as an alias for add-repo', async () => {
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-source-add');

    await runCli(
      [
        'source',
        'add',
        '--repo-url',
        'https://github.com/OCA/server-tools.git',
        '--repo',
        'server-tools',
        '--source-type',
        'oca',
        '--target',
        target,
        '--stage=false',
      ],
      '/tmp/ignored-cwd',
    );

    expect(mocks.addModuleRepo).toHaveBeenCalledWith({
      target,
      repoUrl: 'https://github.com/OCA/server-tools.git',
      repoPath: 'server-tools',
      sourceType: 'oca',
      odooVersion: '18.0-mocked',
      initEmptyRepos: false,
      stage: false,
    });
    expect(promptMocks.outro).toHaveBeenCalledWith(`Added source repo under ${target}/odoo/custom/src/oca/server-tools.`);
  });

  it('routes source remove as an alias for remove-repo', async () => {
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-source-remove');

    await runCli(
      ['source', 'remove', '--repo', 'server-tools', '--source-type', 'oca', '--target', target, '--stage=false'],
      '/tmp/ignored-cwd',
    );

    expect(mocks.removeModuleRepo).toHaveBeenCalledWith({
      target,
      repoPath: 'server-tools',
      sourceType: 'oca',
      stage: false,
    });
    expect(promptMocks.outro).toHaveBeenCalledWith(`Removed source repo server-tools from ${target}.`);
  });

  it('routes add-module with full args to addModuleToSourceRepo and prints banner/outro', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-add-module');

    await runCli(
      [
        'add-module',
        '--repo',
        'odoo_sample_module',
        '--module',
        'sale_demo',
        '--target',
        target,
        '--odoo-version',
        '16.0',
        '--stage=false',
      ],
      '/tmp/ignored-cwd',
    );

    expect(mocks.commandOdooVersion).toHaveBeenCalledWith(target, '16.0');
    expect(mocks.addModuleToSourceRepo).toHaveBeenCalledWith({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'sale_demo',
      odooVersion: '18.0-mocked',
      stage: false,
    });
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(promptMocks.outro).toHaveBeenCalledWith('Added module sale_demo under source repo odoo_sample_module.');
  });

  it('routes remove-module with full args to removeModuleFromSourceRepo and prints banner/outro', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const target = resolve('/tmp/worker-a-remove-module');

    await runCli(
      [
        'remove-module',
        '--repo',
        'odoo_sample_module',
        '--module',
        'sale_demo',
        '--target',
        target,
        '--delete-files=true',
        '--stage=false',
      ],
      '/tmp/ignored-cwd',
    );

    expect(mocks.removeModuleFromSourceRepo).toHaveBeenCalledWith({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'sale_demo',
      deleteFiles: true,
      stage: false,
    });
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(promptMocks.outro).toHaveBeenCalledWith('Removed module sale_demo from source repo odoo_sample_module.');
  });

  it('throws doctor usage error when doctor is called with unexpected argv', async () => {
    const { runCli } = await loadCli();

    await expect(runCli(['doctor', '--unexpected'], '/tmp/example')).rejects.toThrow('Usage: wpmoo doctor');
    expect(mocks.runDoctor).not.toHaveBeenCalled();
  });
});
