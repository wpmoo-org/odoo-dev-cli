import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

import type { MissingRepository, RepositoryCheckResult } from '../src/repository-preflight.js';
import type { UpdateCheckResult } from '../src/update-check.js';
import type { EnvironmentTargetState } from '../src/environment-target-preflight.js';
import type { GitHubPrerequisiteStatus } from '../src/github-prerequisites.js';

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
    blocked: [],
  })),
  createGitHubRepositories: vi.fn(async () => undefined),
  manualCreateCommands: vi.fn((_repositories: MissingRepository[]) => []),
  getGitHubPrerequisiteStatus: vi.fn<() => Promise<GitHubPrerequisiteStatus>>(async () => ({ status: 'ready' })),
  renderGitHubPrerequisiteGuidance: vi.fn(
    () =>
      'GitHub CLI (`gh`) is not available or not authenticated.\nInstall and authenticate it to auto-create missing GitHub repositories:\n\nbrew install gh\ngh auth login',
  ),
  getOriginUrl: vi.fn(async () => undefined),
  getGitHubAccounts: vi.fn(async () => [{ login: 'example-org', type: 'user' as const }]),
  renderBanner: vi.fn(() => 'mock banner'),
  renderVersionTag: vi.fn((latestVersion?: string) => `mock version${latestVersion ? ` -> ${latestVersion}` : ''}`),
  renderRepositorySetupNote: vi.fn(() => 'repo setup note'),
  installPromptCancelKeyTracker: vi.fn(),
  inspectEnvironmentTarget: vi.fn<(target: string) => Promise<EnvironmentTargetState>>(async (target) => ({ kind: 'missing_target', target })),
  expectedTargetConfirmation: vi.fn((target: string, input: string) => target.endsWith(input)),
  backupTargetPath: vi.fn((target: string) => `${target}.backup-20260516-000000`),
  renderExistingEnvironmentSummary: vi.fn((state: { target: string }) => `Existing WPMoo environment detected at ${state.target}`),
  renderForeignEnvironmentTargetWarning: vi.fn((state: { target: string }) => `Target already exists: ${state.target}`),
  safeResetEnvironment: vi.fn(async () => undefined),
}));

vi.mock('../src/prompts/index.js', () => ({
  confirm: mocks.confirm,
  confirmPrompt: mocks.confirm,
  intro: mocks.intro,
  introPrompt: mocks.intro,
  isCancel: mocks.isCancel,
  isPromptCancel: mocks.isCancel,
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

vi.mock('../src/prompt-repositories.js', () => ({
  promptRepositoryUrl: mocks.promptRepositoryUrl,
}));

vi.mock('../src/environment-target-preflight.js', () => ({
  inspectEnvironmentTarget: mocks.inspectEnvironmentTarget,
  expectedTargetConfirmation: mocks.expectedTargetConfirmation,
  backupTargetPath: mocks.backupTargetPath,
  renderExistingEnvironmentSummary: mocks.renderExistingEnvironmentSummary,
  renderForeignEnvironmentTargetWarning: mocks.renderForeignEnvironmentTargetWarning,
}));

vi.mock('../src/github-prerequisites.js', () => ({
  getGitHubPrerequisiteStatus: mocks.getGitHubPrerequisiteStatus,
  renderGitHubPrerequisiteGuidance: mocks.renderGitHubPrerequisiteGuidance,
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

vi.mock('../src/safe-reset.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/safe-reset.js')>();
  return {
    ...actual,
    safeResetEnvironment: mocks.safeResetEnvironment,
  };
});

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
  environmentFolder?: string;
  connectGitHub?: boolean;
  odooVersion?: string;
  devRepoUrl?: string;
  sourceRepoUrl?: string;
  installAgentSkills?: boolean;
  initEmptyRepos?: boolean;
  createMissingRepositories?: boolean;
  repoVisibility?: 'private' | 'public';
  existingEnvironmentAction?: 'update-existing' | 'reinstall-environment' | 'delete-environment' | 'cancel';
  foreignTargetAction?: 'choose-another-folder' | 'cancel';
}) {
  const product = options?.product ?? 'odoo_sample_module';
  const environmentFolder = options?.environmentFolder ?? `./${product}_dev`;
  const connectGitHub = options?.connectGitHub ?? true;
  const odooVersion = options?.odooVersion ?? '19.0';
  const devRepoUrl = options?.devRepoUrl ?? `https://github.com/example-org/${product}_dev.git`;
  const sourceRepoUrl = options?.sourceRepoUrl ?? `https://github.com/example-org/${product}.git`;
  const installAgentSkills = options?.installAgentSkills ?? false;
  const initEmptyRepos = options?.initEmptyRepos ?? true;

  mocks.text.mockImplementation(async (prompt: { message?: string }) => {
    const message = prompt?.message ?? '';
    if (message.includes('Product slug')) return product;
    if (message.includes('Environment folder')) return environmentFolder;
    return '';
  });
  mocks.promptRepositoryUrl.mockImplementation(async (prompt: { label?: string }) => {
    const label = prompt?.label ?? '';
    if (label.includes('Dev environment repo URL')) return devRepoUrl;
    return sourceRepoUrl;
  });
  mocks.select.mockImplementation(async (prompt: { message?: string; initialValue?: unknown }) => {
    const message = prompt?.message ?? '';
    if (message.includes('Connect this environment to Git/GitHub now')) return connectGitHub;
    if (message.includes('Odoo version')) return odooVersion;
    if (message.includes('Add another source repo')) return false;
    if (message.includes('Install project-local Odoo Agent Skills')) return installAgentSkills;
    if (message.includes('Initialize repositories that exist but have no commits')) return initEmptyRepos;
    if (message.includes('This environment folder already exists')) {
      return options?.existingEnvironmentAction ?? prompt.initialValue;
    }
    if (message.includes('What do you want to do?')) {
      return options?.foreignTargetAction ?? prompt.initialValue;
    }
    if (message.includes('Create the inaccessible repositories with GitHub CLI')) {
      return options?.createMissingRepositories ?? prompt.initialValue;
    }
    if (message.includes('Visibility for new repositories')) {
      return options?.repoVisibility ?? prompt.initialValue;
    }
    return prompt.initialValue;
  });
}

describe('cli startup/create flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectDevelopmentEnvironment.mockResolvedValue({ isEnvironment: false, source: 'none' });
    mocks.inspectEnvironmentTarget.mockImplementation(async (target: string) => ({ kind: 'missing_target', target }));
    mocks.getGitHubPrerequisiteStatus.mockResolvedValue({ status: 'ready' });
    mocks.safeResetEnvironment.mockResolvedValue(undefined);
    mocks.repositoryPreflightAvailable.mockResolvedValue(true);
    mocks.checkGitHubRepositories.mockResolvedValue({ accessible: [], inaccessible: [], blocked: [] });
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

    expect(mocks.installLatestPackage).not.toHaveBeenCalled();
    expect(mocks.restartCli).toHaveBeenCalledWith('@wpmoo/toolkit', '9.9.9', []);
    expect(warnSpy).toHaveBeenCalledWith('Update restart exited with code 42; continuing with v.0.0.0-test.');
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('collects prompt-based create options in menu mode and runs repository preflight + scaffold', async () => {
    mockCreatePrompts({
      product: 'cool_module',
      environmentFolder: './custom_cool_env',
      connectGitHub: true,
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
      blocked: [],
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
      target: resolve('./custom_cool_env'),
      dryRun: false,
      initEmptyRepos: false,
      stage: true,
      agentSkillsTemplateUrl: 'https://example.com/agent-skills.tar.gz',
      createMissingRepos: false,
      repoVisibility: 'private',
    });
  });

  it('asks for a custom environment folder and passes it as scaffold target', async () => {
    mockCreatePrompts({
      product: 'folder_module',
      environmentFolder: './custom_folder_env',
      connectGitHub: true,
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.text).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Environment folder',
        initialValue: './folder_module_dev',
      }),
    );
    expect(mocks.scaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        target: resolve('./custom_folder_env'),
      }),
    );
  });

  it('scaffolds local-only when the user skips Git/GitHub connection', async () => {
    mockCreatePrompts({
      product: 'local_module',
      environmentFolder: './local_only_env',
      connectGitHub: false,
      odooVersion: '19.0',
      installAgentSkills: false,
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.promptRepositoryUrl).not.toHaveBeenCalled();
    expect(mocks.getGitHubAccounts).not.toHaveBeenCalled();
    expect(mocks.checkGitHubRepositories).not.toHaveBeenCalled();
    expect(mocks.createGitHubRepositories).not.toHaveBeenCalled();
    expect(mocks.scaffold).toHaveBeenCalledWith({
      product: 'local_module',
      odooVersion: '19.0',
      engine: 'compose',
      devRepo: 'local_only_env',
      devRepoUrl: resolve('./local_only_env'),
      sourceRepos: [],
      target: resolve('./local_only_env'),
      dryRun: false,
      initEmptyRepos: false,
      stage: false,
      agentSkillsTemplateUrl: undefined,
      createMissingRepos: false,
      repoVisibility: 'private',
      skipSubmodules: true,
    });
  });

  it('shows next-step guidance after creating an environment from prompts', async () => {
    mockCreatePrompts({
      product: 'learn_module',
      environmentFolder: './learn_module_dev',
      connectGitHub: false,
      installAgentSkills: false,
    });
    const { runCli } = await loadCli();

    await runCli([], process.cwd());

    expect(mocks.note).toHaveBeenCalledWith(
      expect.stringContaining('cd learn_module_dev'),
      'Next steps',
    );
    expect(mocks.note).toHaveBeenCalledWith(
      expect.stringContaining('./moo'),
      'Next steps',
    );
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
      blocked: [],
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

  it('updates an existing environment instead of scaffolding over it', async () => {
    mockCreatePrompts({
      product: 'existing_module',
      environmentFolder: './existing_module_dev',
      existingEnvironmentAction: 'update-existing',
    });
    const target = resolve('./existing_module_dev');
    mocks.inspectEnvironmentTarget.mockResolvedValueOnce({
      kind: 'existing_environment',
      target,
      metadata: {
        tool: '@wpmoo/toolkit',
        version: '0.0.0-test',
        product: 'existing_module',
        odooVersion: '19.0',
        devRepo: 'existing_module_dev',
        devRepoUrl: 'https://github.com/example-org/existing_module_dev.git',
        sourceRepos: [],
      },
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.safeResetEnvironment).toHaveBeenCalledWith({ target, stage: true });
    expect(mocks.scaffold).not.toHaveBeenCalled();
    expect(mocks.outro).toHaveBeenCalledWith(`Updated existing Odoo dev overlay in ${target}.`);
  });

  it('does not scaffold over a foreign folder when the user cancels', async () => {
    mockCreatePrompts({
      product: 'foreign_module',
      environmentFolder: './foreign_module_dev',
      foreignTargetAction: 'cancel',
    });
    const target = resolve('./foreign_module_dev');
    mocks.inspectEnvironmentTarget.mockResolvedValueOnce({ kind: 'foreign_target', target });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.renderForeignEnvironmentTargetWarning).toHaveBeenCalledWith({ kind: 'foreign_target', target });
    expect(mocks.scaffold).not.toHaveBeenCalled();
    expect(mocks.outro).toHaveBeenCalledWith('Create flow cancelled.');
  });

  it('blocks non-interactive create over an existing WPMoo environment target', async () => {
    const target = resolve('/tmp/workspace/existing-direct-dev');
    mocks.inspectEnvironmentTarget.mockResolvedValueOnce({
      kind: 'existing_environment',
      target,
      metadata: {
        tool: '@wpmoo/toolkit',
        version: '0.0.0-test',
        product: 'existing_direct',
        odooVersion: '19.0',
        devRepo: 'existing-direct-dev',
        devRepoUrl: 'https://github.com/example-org/existing-direct-dev.git',
        sourceRepos: [],
      },
    });
    const { runCli } = await loadCli();

    await expect(
      runCli(
        [
          'create',
          '--product',
          'existing_direct',
          '--target',
          target,
          '--source-repo-url',
          'https://github.com/example-org/existing_direct.git',
        ],
        '/tmp/workspace',
      ),
    ).rejects.toThrow(`Target already contains a WPMoo environment: ${target}`);

    expect(mocks.scaffold).not.toHaveBeenCalled();
  });

  it('blocks non-interactive create over a foreign target folder', async () => {
    const target = resolve('/tmp/workspace/foreign-direct-dev');
    mocks.inspectEnvironmentTarget.mockResolvedValueOnce({ kind: 'foreign_target', target });
    const { runCli } = await loadCli();

    await expect(
      runCli(
        [
          'create',
          '--product',
          'foreign_direct',
          '--target',
          target,
          '--source-repo-url',
          'https://github.com/example-org/foreign_direct.git',
        ],
        '/tmp/workspace',
      ),
    ).rejects.toThrow(`Target already exists: ${target}`);

    expect(mocks.scaffold).not.toHaveBeenCalled();
  });
});
