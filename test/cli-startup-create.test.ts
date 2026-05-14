import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MissingRepository, RepositoryCheckResult } from '../src/repository-preflight.js';
import type { UpdateCheckResult } from '../src/update-check.js';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async () => false),
  intro: vi.fn(),
  isCancel: vi.fn(() => false),
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
  installLatestPackage: vi.fn(async () => undefined),
  restartCli: vi.fn(async () => 1),
  isUpdateCheckSkipped: vi.fn((argv: string[]) => argv.includes('--no-update-check')),
  scaffold: vi.fn(async () => ({ plannedFiles: [], plannedCommands: [] })),
  repositoryPreflightAvailable: vi.fn(async () => true),
  checkGitHubRepositories: vi.fn<() => Promise<RepositoryCheckResult>>(async () => ({
    accessible: [],
    inaccessible: [],
  })),
  createGitHubRepositories: vi.fn(async () => undefined),
  manualCreateCommands: vi.fn((_repositories: MissingRepository[]) => []),
  getOriginUrl: vi.fn(async () => undefined),
  getGitHubAccounts: vi.fn(async () => [{ login: 'example-org', type: 'user' as const }]),
  renderBanner: vi.fn(() => 'mock banner'),
  renderVersionTag: vi.fn((latestVersion?: string) => `mock version${latestVersion ? ` -> ${latestVersion}` : ''}`),
  renderRepositorySetupNote: vi.fn(() => 'repo setup note'),
  installPromptCancelKeyTracker: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  confirm: mocks.confirm,
  intro: mocks.intro,
  isCancel: mocks.isCancel,
  note: mocks.note,
  outro: mocks.outro,
  select: mocks.select,
  text: mocks.text,
}));

vi.mock('../src/prompt-repositories.js', () => ({
  promptRepositoryUrl: mocks.promptRepositoryUrl,
}));

vi.mock('../src/environment.js', () => ({
  detectDevelopmentEnvironment: mocks.detectDevelopmentEnvironment,
}));

vi.mock('../src/update-check.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/update-check.js')>();
  return {
    ...actual,
    checkForUpdate: mocks.checkForUpdate,
    installLatestPackage: mocks.installLatestPackage,
    restartCli: mocks.restartCli,
    isUpdateCheckSkipped: mocks.isUpdateCheckSkipped,
  };
});

vi.mock('../src/scaffold.js', () => ({
  scaffold: mocks.scaffold,
}));

vi.mock('../src/repository-preflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repository-preflight.js')>();
  return {
    ...actual,
    repositoryPreflightAvailable: mocks.repositoryPreflightAvailable,
    checkGitHubRepositories: mocks.checkGitHubRepositories,
    createGitHubRepositories: mocks.createGitHubRepositories,
    manualCreateCommands: mocks.manualCreateCommands,
  };
});

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
    packageName: () => '@wpmoo/odoo',
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

vi.mock('../src/external-templates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/external-templates.js')>();
  return {
    ...actual,
    defaultAgentSkillsTemplateUrl: 'https://example.com/agent-skills.tar.gz',
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

function mockCreatePrompts(options?: {
  product?: string;
  odooVersion?: string;
  devRepoUrl?: string;
  sourceRepoUrl?: string;
  installAgentSkills?: boolean;
  initEmptyRepos?: boolean;
}) {
  const product = options?.product ?? 'odoo_sample_module';
  const odooVersion = options?.odooVersion ?? '19.0';
  const devRepoUrl = options?.devRepoUrl ?? `https://github.com/example-org/${product}_dev.git`;
  const sourceRepoUrl = options?.sourceRepoUrl ?? `https://github.com/example-org/${product}.git`;
  const installAgentSkills = options?.installAgentSkills ?? false;
  const initEmptyRepos = options?.initEmptyRepos ?? true;

  mocks.text.mockResolvedValueOnce(product);
  mocks.select.mockResolvedValueOnce(odooVersion);
  mocks.promptRepositoryUrl.mockResolvedValueOnce(devRepoUrl);
  mocks.promptRepositoryUrl.mockResolvedValueOnce(sourceRepoUrl);
  mocks.select.mockResolvedValueOnce(false);
  mocks.select.mockResolvedValueOnce(installAgentSkills);
  mocks.select.mockResolvedValueOnce(initEmptyRepos);
}

describe('cli startup/create flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectDevelopmentEnvironment.mockResolvedValue({ isEnvironment: false, source: 'none' });
    mocks.repositoryPreflightAvailable.mockResolvedValue(true);
    mocks.checkGitHubRepositories.mockResolvedValue({ accessible: [], inaccessible: [] });
    mocks.checkForUpdate.mockResolvedValue({
      status: 'current',
      currentVersion: '0.0.0-test',
      latestVersion: '0.0.0-test',
    });
    mocks.confirm.mockResolvedValue(false);
    mocks.installLatestPackage.mockResolvedValue(undefined);
    mocks.restartCli.mockResolvedValue(1);
  });

  it('skips update check with --no-update-check and continues prompt create', async () => {
    mockCreatePrompts();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['--no-update-check'], '/tmp/workspace');

    expect(mocks.checkForUpdate).not.toHaveBeenCalled();
    expect(mocks.renderVersionTag).toHaveBeenCalledWith();
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(logSpy).toHaveBeenCalledWith('mock version');
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('shows update tag, skips install/restart when user rejects update, and continues create', async () => {
    mockCreatePrompts();
    mocks.checkForUpdate.mockResolvedValue({
      status: 'update-available',
      currentVersion: '0.0.0-test',
      latestVersion: '9.9.9',
      tarball: 'https://registry.example.com/pkg.tgz',
    });
    mocks.confirm.mockResolvedValueOnce(false);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.renderVersionTag).toHaveBeenCalledWith('9.9.9');
    expect(mocks.installLatestPackage).not.toHaveBeenCalled();
    expect(mocks.restartCli).not.toHaveBeenCalled();
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('warns and continues when update restart fails after accepting update', async () => {
    mockCreatePrompts();
    mocks.checkForUpdate.mockResolvedValue({
      status: 'update-available',
      currentVersion: '0.0.0-test',
      latestVersion: '9.9.9',
      tarball: 'https://registry.example.com/pkg.tgz',
    });
    mocks.confirm.mockResolvedValueOnce(true);
    mocks.restartCli.mockResolvedValueOnce(42);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.installLatestPackage).toHaveBeenCalledWith('@wpmoo/odoo', '9.9.9');
    expect(mocks.restartCli).toHaveBeenCalledWith('@wpmoo/odoo', '9.9.9', []);
    expect(warnSpy).toHaveBeenCalledWith('Update restart exited with code 42; continuing with v.0.0.0-test.');
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('collects prompt-based create options in menu mode and runs repository preflight + scaffold', async () => {
    mockCreatePrompts({
      product: 'cool_module',
      odooVersion: '18.0',
      devRepoUrl: 'https://github.com/example-org/cool_module_dev.git',
      sourceRepoUrl: 'https://github.com/example-org/cool_module.git',
      installAgentSkills: true,
      initEmptyRepos: false,
    });
    mocks.checkGitHubRepositories.mockResolvedValueOnce({
      accessible: [
        {
          label: 'Dev environment repo',
          slug: 'example-org/cool_module_dev',
          url: 'https://github.com/example-org/cool_module_dev.git',
          defaultVisibility: 'private',
        },
      ],
      inaccessible: [],
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.checkGitHubRepositories).toHaveBeenCalledTimes(1);
    expect(mocks.scaffold).toHaveBeenCalledWith({
      product: 'cool_module',
      odooVersion: '18.0',
      engine: 'compose',
      devRepo: 'cool_module_dev',
      devRepoUrl: 'https://github.com/example-org/cool_module_dev.git',
      sourceRepos: [
        {
          url: 'https://github.com/example-org/cool_module.git',
          path: 'cool_module',
          addons: ['cool_module'],
        },
      ],
      target: `${process.cwd()}/cool_module_dev`,
      dryRun: false,
      initEmptyRepos: false,
      stage: true,
      agentSkillsTemplateUrl: 'https://example.com/agent-skills.tar.gz',
      createMissingRepos: false,
      repoVisibility: 'private',
    });
  });

  it('creates missing repositories for non-interactive direct args when --create-missing-repos is set', async () => {
    const missing = [
      {
        label: 'Source repo: dry_module',
        slug: 'example-org/dry_module',
        url: 'https://github.com/example-org/dry_module.git',
        defaultVisibility: 'private' as const,
      },
    ];
    mocks.checkGitHubRepositories.mockResolvedValueOnce({
      accessible: [],
      inaccessible: missing,
    });
    const { runCli } = await loadCli();

    await runCli(
      [
        'create',
        '--product',
        'dry_module',
        '--source-repo-url',
        'https://github.com/example-org/dry_module.git',
        '--create-missing-repos',
        '--repo-visibility',
        'public',
      ],
      '/tmp/workspace',
    );

    expect(mocks.createGitHubRepositories).toHaveBeenCalledWith(missing, 'public');
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });
});
