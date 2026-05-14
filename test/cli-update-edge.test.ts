import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import type { GitHubAccount } from '../src/github.js';
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
  checkGitHubRepositories: vi.fn(async () => ({ accessible: [], inaccessible: [] })),
  createGitHubRepositories: vi.fn(async () => undefined),
  manualCreateCommands: vi.fn(() => []),
  getOriginUrl: vi.fn(async () => undefined),
  getGitHubAccounts: vi.fn<() => Promise<GitHubAccount[]>>(async () => [{ login: 'example-org', type: 'user' }]),
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
  environmentFolder?: string;
  devRepoUrl?: string;
  sourceRepoUrl?: string;
  selectedOwner?: string;
}) {
  const product = options?.product ?? 'odoo_sample_module';
  const environmentFolder = options?.environmentFolder ?? `./${product}_dev`;
  const devRepoUrl = options?.devRepoUrl ?? `https://github.com/example-org/${product}_dev.git`;
  const sourceRepoUrl = options?.sourceRepoUrl ?? `https://github.com/example-org/${product}.git`;

  mocks.text.mockImplementation(async (prompt: { message?: string }) => {
    const message = prompt?.message ?? '';
    if (message.includes('Product slug')) return product;
    if (message.includes('Environment folder')) return environmentFolder;
    return '';
  });
  mocks.select.mockImplementation(async (prompt: { message?: string; initialValue?: unknown }) => {
    const message = prompt?.message ?? '';
    if (message.includes('Connect this environment to Git/GitHub now')) return true;
    if (message.includes('GitHub account/organization')) return options?.selectedOwner ?? prompt.initialValue;
    if (message.includes('Odoo version')) return '19.0';
    if (message.includes('Add another source repo')) return false;
    if (message.includes('Install project-local Odoo Agent Skills')) return false;
    if (message.includes('Initialize repositories that exist but have no commits')) return true;
    return prompt.initialValue;
  });
  mocks.promptRepositoryUrl.mockImplementation(async (prompt: { label?: string }) => {
    const label = prompt?.label ?? '';
    if (label.includes('Dev environment repo URL')) return devRepoUrl;
    return sourceRepoUrl;
  });
}

describe('cli startup update edge branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
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
    mocks.getGitHubAccounts.mockResolvedValue([{ login: 'example-org', type: 'user' }]);
  });

  it('continues prompt create when accepted update install fails', async () => {
    mockCreatePrompts();
    mocks.checkForUpdate.mockResolvedValue({
      status: 'update-available',
      currentVersion: '0.0.0-test',
      latestVersion: '9.9.9',
      tarball: 'https://registry.example.com/pkg.tgz',
    });
    mocks.confirm.mockResolvedValueOnce(true);
    mocks.installLatestPackage.mockRejectedValueOnce(new Error('npm install failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.installLatestPackage).toHaveBeenCalledWith('@wpmoo/odoo', '9.9.9');
    expect(warnSpy).toHaveBeenCalledWith('Update failed: npm install failed. Continuing with v.0.0.0-test.');
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('exits with code 0 when update restart succeeds', async () => {
    mockCreatePrompts();
    mocks.checkForUpdate.mockResolvedValue({
      status: 'update-available',
      currentVersion: '0.0.0-test',
      latestVersion: '9.9.9',
      tarball: 'https://registry.example.com/pkg.tgz',
    });
    mocks.confirm.mockResolvedValueOnce(true);
    mocks.restartCli.mockResolvedValueOnce(0);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.installLatestPackage).toHaveBeenCalledWith('@wpmoo/odoo', '9.9.9');
    expect(mocks.restartCli).toHaveBeenCalledWith('@wpmoo/odoo', '9.9.9', []);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });
});

describe('cli startup github owner selection edges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectDevelopmentEnvironment.mockResolvedValue({ isEnvironment: false, source: 'none' });
    mocks.checkForUpdate.mockResolvedValue({
      status: 'current',
      currentVersion: '0.0.0-test',
      latestVersion: '0.0.0-test',
    });
    mocks.confirm.mockResolvedValue(false);
  });

  it('falls back to owner inferred from dev repo URL when github account lookup throws', async () => {
    mockCreatePrompts({
      product: 'awesome_mod',
      devRepoUrl: 'https://github.com/inferred-owner/awesome_mod_dev.git',
      sourceRepoUrl: 'https://github.com/inferred-owner/awesome_mod.git',
    });
    mocks.getGitHubAccounts.mockRejectedValueOnce(new Error('gh failed'));
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.promptRepositoryUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        label: 'Source repo URL',
        suggestedUrl: 'https://github.com/inferred-owner/awesome_mod.git',
      }),
    );
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('keeps source repo suggestion undefined when no owner can be inferred', async () => {
    mockCreatePrompts({
      product: 'custom_mod',
      devRepoUrl: 'git@gitlab.com:team/custom_mod_dev.git',
      sourceRepoUrl: 'git@gitlab.com:team/custom_mod.git',
    });
    mocks.getGitHubAccounts.mockRejectedValueOnce(new Error('gh failed'));
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.promptRepositoryUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        label: 'Source repo URL',
        suggestedUrl: undefined,
      }),
    );
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });

  it('uses selected owner from multiple github accounts as initial repo suggestion', async () => {
    mocks.getGitHubAccounts.mockResolvedValue([
      { login: 'acct-one', type: 'user' },
      { login: 'team-two', type: 'organization' },
    ]);
    mockCreatePrompts({
      product: 'multi_mod',
      selectedOwner: 'team-two',
      devRepoUrl: 'https://github.com/team-two/multi_mod_dev.git',
      sourceRepoUrl: 'https://github.com/team-two/multi_mod.git',
    });
    const { runCli } = await loadCli();

    await runCli([], '/tmp/workspace');

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'GitHub account/organization',
        initialValue: 'acct-one',
      }),
    );
    expect(mocks.promptRepositoryUrl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        label: 'Dev environment repo URL',
        suggestedUrl: 'https://github.com/team-two/multi_mod_dev.git',
      }),
    );
    expect(mocks.scaffold).toHaveBeenCalledTimes(1);
  });
});

describe('cli direct executable catch branch', () => {
  it('prints error and exits with code 1 when direct execution throws', () => {
    const cliPath = resolve(process.cwd(), 'dist/cli.js');
    if (!existsSync(cliPath)) {
      return;
    }

    const run = spawnSync(process.execPath, [cliPath, 'doctor', '--unexpected'], {
      encoding: 'utf8',
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Usage: wpmoo doctor');
  });
});
