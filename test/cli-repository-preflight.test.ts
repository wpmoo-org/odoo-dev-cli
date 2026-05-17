import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  getSystemPrerequisiteStatus: vi.fn(async () => ({ ok: true, checks: [], issues: [] })),
  renderSystemPrerequisiteGuidance: vi.fn(() => 'mock prerequisite guidance'),
  repositoryPreflightAvailable: vi.fn(async () => true),
  checkGitHubRepositories: vi.fn<() => Promise<RepositoryCheckResult>>(async () => ({
    accessible: [],
    inaccessible: [],
    blocked: [],
  })),
  createGitHubRepositories: vi.fn(async () => undefined),
  manualCreateCommands: vi.fn<(_repositories: MissingRepository[]) => string[]>((_repositories) => []),
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
  expectedTargetConfirmation: vi.fn(() => true),
  backupTargetPath: vi.fn((target: string) => `${target}.backup-20260516-000000`),
  renderExistingEnvironmentSummary: vi.fn((state: { target: string }) => `Existing WPMoo environment detected at ${state.target}`),
  renderForeignEnvironmentTargetWarning: vi.fn((state: { target: string }) => `Target already exists: ${state.target}`),
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

vi.mock('../src/system-prerequisites.js', () => ({
  getSystemPrerequisiteStatus: mocks.getSystemPrerequisiteStatus,
  renderSystemPrerequisiteGuidance: mocks.renderSystemPrerequisiteGuidance,
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
  initEmptyRepos?: boolean;
  createMissingRepositories?: boolean;
  repoVisibility?: 'private' | 'public';
  githubUnavailableAction?: 'retry' | 'continue-local-only' | 'cancel';
}) {
  const product = options?.product ?? 'odoo_sample_module';
  const environmentFolder = options?.environmentFolder ?? `./${product}_dev`;
  const connectGitHub = options?.connectGitHub ?? true;
  const odooVersion = options?.odooVersion ?? '19.0';
  const initEmptyRepos = options?.initEmptyRepos ?? true;
  const devRepoUrl = `https://github.com/example-org/${product}_dev.git`;
  const sourceRepoUrl = `https://github.com/example-org/${product}.git`;

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
    if (message.includes('Install project-local Odoo Agent Skills')) return false;
    if (message.includes('Initialize repositories that exist but have no commits')) return initEmptyRepos;
    if (message.includes('Create the inaccessible repositories with GitHub CLI')) {
      return options?.createMissingRepositories ?? prompt.initialValue;
    }
    if (message.includes('Visibility for new repositories')) {
      return options?.repoVisibility ?? prompt.initialValue;
    }
    if (message.includes('GitHub repository prerequisites')) {
      return options?.githubUnavailableAction ?? prompt.initialValue;
    }
    return prompt.initialValue;
  });
}

describe('cli repository preflight in create flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.detectDevelopmentEnvironment.mockResolvedValue({ isEnvironment: false, source: 'none' });
    mocks.repositoryPreflightAvailable.mockResolvedValue(true);
    mocks.getSystemPrerequisiteStatus.mockResolvedValue({ ok: true, checks: [], issues: [] });
    mocks.getGitHubPrerequisiteStatus.mockResolvedValue({ status: 'ready' });
    mocks.inspectEnvironmentTarget.mockImplementation(async (target: string) => ({ kind: 'missing_target', target }));
    mocks.checkGitHubRepositories.mockResolvedValue({ accessible: [], inaccessible: [], blocked: [] });
    mocks.checkForUpdate.mockResolvedValue({
      status: 'current',
      currentVersion: '0.0.0-test',
      latestVersion: '0.0.0-test',
    });
  });

  it('throws gh install/auth guidance for non-interactive --create-missing-repos when preflight is unavailable', async () => {
    mocks.repositoryPreflightAvailable.mockResolvedValueOnce(false);
    mocks.getGitHubPrerequisiteStatus.mockResolvedValueOnce({ status: 'missing', reason: 'gh-missing' });
    const { runCli } = await loadCli();

    await expect(
      runCli(
        [
          'create',
          '--product',
          'dry_module',
          '--source-repo-url',
          'https://github.com/example-org/dry_module.git',
          '--create-missing-repos',
        ],
        '/tmp/workspace',
      ),
    ).rejects.toThrow(
      'GitHub CLI (`gh`) is not available or not authenticated.\nInstall and authenticate it to auto-create missing GitHub repositories:\n\nbrew install gh\ngh auth login',
    );

    expect(mocks.checkGitHubRepositories).not.toHaveBeenCalled();
    expect(mocks.scaffold).not.toHaveBeenCalled();
  });

  it('offers retry/local-only/cancel when interactive GitHub setup is selected but prerequisites are missing', async () => {
    mockCreatePrompts({ product: 'skipped_module', githubUnavailableAction: 'continue-local-only' });
    mocks.repositoryPreflightAvailable.mockResolvedValueOnce(false);
    mocks.getGitHubPrerequisiteStatus.mockResolvedValueOnce({ status: 'missing', reason: 'gh-missing' });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.note).toHaveBeenCalledWith(
      'GitHub CLI (`gh`) is not available or not authenticated.\nInstall and authenticate it to auto-create missing GitHub repositories:\n\nbrew install gh\ngh auth login',
      'GitHub prerequisites',
    );
    const hasPrerequisiteFallbackChoice = mocks.select.mock.calls.some((call) => {
      const prompt = call[0] as {
        options?: Array<{ value?: string }>;
      };
      const values = new Set((prompt?.options ?? []).map((option) => option?.value));
      return values.has('retry') && values.has('continue-local-only') && values.has('cancel');
    });
    expect(hasPrerequisiteFallbackChoice).toBe(true);
    expect(mocks.checkGitHubRepositories).not.toHaveBeenCalled();
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('throws manual creation instructions when user declines creating missing repositories interactively', async () => {
    const missing = [
      {
        label: 'Source repo: odoo_sample_module',
        slug: 'example-org/odoo_sample_module',
        url: 'https://github.com/example-org/odoo_sample_module.git',
        defaultVisibility: 'private' as const,
      },
    ];
    mockCreatePrompts({ createMissingRepositories: false });
    mocks.checkGitHubRepositories.mockResolvedValueOnce({
      accessible: [],
      inaccessible: missing,
      blocked: [],
    });
    mocks.manualCreateCommands.mockReturnValueOnce(['gh repo create example-org/odoo_sample_module --private']);
    const { runCli } = await loadCli();

    await expect(runCli([], '/tmp/workspace')).rejects.toThrow(
      'Required repositories are not accessible. Create them first:\n\ngh repo create example-org/odoo_sample_module --private',
    );

    expect(mocks.manualCreateCommands).toHaveBeenCalledWith(missing);
    expect(mocks.createGitHubRepositories).not.toHaveBeenCalled();
    expect(mocks.scaffold).not.toHaveBeenCalled();
  });

  it('creates missing repositories as public when user accepts interactive creation and selects public visibility', async () => {
    const missing = [
      {
        label: 'Source repo: odoo_sample_module',
        slug: 'example-org/odoo_sample_module',
        url: 'https://github.com/example-org/odoo_sample_module.git',
        defaultVisibility: 'private' as const,
      },
    ];
    mockCreatePrompts({ createMissingRepositories: true, repoVisibility: 'public' });
    mocks.checkGitHubRepositories.mockResolvedValueOnce({
      accessible: [],
      inaccessible: missing,
      blocked: [],
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.createGitHubRepositories).toHaveBeenCalledWith(missing, 'public');
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('accepts an existing empty dev repo and continues scaffolding', async () => {
    const originalIsTty = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;
    mockCreatePrompts({ product: 'accessible_module' });
    mocks.checkGitHubRepositories.mockResolvedValueOnce({
      accessible: [
        {
          label: 'Dev environment repo',
          slug: 'example-org/accessible_module_dev',
          url: 'https://github.com/example-org/accessible_module_dev.git',
          defaultVisibility: 'private',
        },
        {
          label: 'Source repo: accessible_module',
          slug: 'example-org/accessible_module',
          url: 'https://github.com/example-org/accessible_module.git',
          defaultVisibility: 'private',
        },
      ],
      inaccessible: [],
      blocked: [],
    });

    try {
      const { runCli } = await loadCli();

      await runCli([], '/tmp/workspace');

      expect(mocks.note).toHaveBeenCalledWith(
        expect.stringContaining('\u001B[2mThese GitHub repositories already exist and are accessible:'),
        'Repository check',
      );
      expect(mocks.note).toHaveBeenCalledWith(
        expect.stringContaining('- Dev environment repo: example-org/accessible_module_dev'),
        'Repository check',
      );
      expect(mocks.note).toHaveBeenCalledWith(
        expect.stringContaining('\u001B[22m'),
        'Repository check',
      );
      expect(mocks.note).toHaveBeenCalledWith(
        expect.stringContaining('accessible_module'),
        'Repository check',
      );
      expect(mocks.createGitHubRepositories).not.toHaveBeenCalled();
      expect(mocks.scaffold).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTty });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    }
  });

  it('warns and aborts when non-empty dev repo is blocked from re-use', async () => {
    mockCreatePrompts({ product: 'blocked_module' });
    mocks.checkGitHubRepositories.mockResolvedValueOnce({
      accessible: [],
      inaccessible: [],
      blocked: [
        {
          label: 'Dev environment repo',
          slug: 'example-org/blocked_module_dev',
          url: 'https://github.com/example-org/blocked_module_dev.git',
          defaultVisibility: 'private',
        },
      ],
    });
    const { runCli } = await loadCli();

    await expect(runCli([], '/tmp/workspace')).rejects.toThrow(/non-empty|blocked/i);

    expect(mocks.note).toHaveBeenCalledWith(
      expect.stringContaining('blocked'),
      expect.stringContaining('Repository check'),
    );
    expect(mocks.createGitHubRepositories).not.toHaveBeenCalled();
    expect(mocks.scaffold).not.toHaveBeenCalled();
  });
});
