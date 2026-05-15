#!/usr/bin/env node
import { confirm, intro, isCancel, note, outro, select, text } from '@clack/prompts';
import { realpathSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  commandFromArgs,
  isHelpRequested,
  isVersionRequested,
  optionsFromArgs,
  parseArgs,
  stripInternalFlags,
} from './args.js';
import type { CockpitCommand } from './cockpit/command-registry.js';
import { selectCockpitCommandFromPalette } from './cockpit/command-palette.js';
import { collectDailyActionArgs } from './cockpit/daily-prompts.js';
import { selectCockpitCategoryCommand, selectCockpitTopLevelMenu } from './cockpit/menu.js';
import { confirmCockpitCommandRisk } from './cockpit/safety.js';
import { detectDevelopmentEnvironment } from './environment.js';
import { commandOdooVersion } from './environment-version.js';
import { defaultAgentSkillsTemplateUrl } from './external-templates.js';
import { isDailyActionCommand, runDailyAction } from './daily-actions.js';
import { runDoctor } from './doctor.js';
import { getOriginUrl, realGit } from './git.js';
import { renderHelp } from './help.js';
import {
  addModuleToSourceRepo,
  listModulesInSourceRepo,
  removeModuleFromSourceRepo,
  type AddModuleOptions,
  type RemoveModuleOptions,
} from './module-actions.js';
import { supportedOdooVersions } from './odoo-versions.js';
import { renderRepositorySetupNote } from './prompt-copy.js';
import { promptRepositoryUrl } from './prompt-repositories.js';
import { inferGitHubOwner, inferRepoPath, normalizeRepositoryUrl } from './repo-url.js';
import { addModuleRepo, listModuleRepos, removeModuleRepo, type AddModuleRepoOptions, type RemoveModuleRepoOptions } from './repo-actions.js';
import { renderSafeResetPreview, safeResetEnvironment, type SafeResetOptions } from './safe-reset.js';
import { listSources, renderSourceList, syncSources, type SourceSyncOptions } from './source-actions.js';
import {
  checkGitHubRepositories,
  createGitHubRepositories,
  manualCreateCommands,
  repositoryPreflightAvailable,
} from './repository-preflight.js';
import { scaffold } from './scaffold.js';
import { renderBanner } from './templates.js';
import type { ScaffoldOptions, SourceRepo, SourceRepoType } from './types.js';
import { checkForUpdate, installLatestPackage, isUpdateCheckSkipped, restartCli } from './update-check.js';
import { packageName, packageVersion, renderVersion, renderVersionTag } from './version.js';
import {
  getEnvironmentStatus,
  renderEnvironmentStatusForTarget,
  renderEnvironmentStatusSummary,
} from './status.js';
import {
  getGitHubAccounts,
  getGitHubRepositoryStatus,
  githubRepositoryUrl,
  realGitHub,
  createGitHubRepository,
  type GitHubAccount,
  type RepositoryVisibility,
} from './github.js';
import { environmentGitHubOwner } from './environment-context.js';
import {
  handlePromptCancel,
  handleUnavailableMenuChoice,
  installPromptCancelKeyTracker,
  isMenuBackSignal,
  MenuBackSignal,
  menuIntroTitle,
  menuPromptMessage,
  type PromptCancelAction,
} from './menu-navigation.js';

function handleCancel(value: unknown, action: PromptCancelAction): void {
  handlePromptCancel(isCancel(value), action);
}

function showSubmenuIntro(title: string, showIntro: boolean, cancelAction: PromptCancelAction): void {
  if (showIntro) {
    intro(menuIntroTitle(title, cancelAction));
  }
}

function asString(value: unknown, fallback: string, cancelAction: PromptCancelAction = 'exit'): string {
  handleCancel(value, cancelAction);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function githubAccountLabel(account: GitHubAccount): string {
  return account.type === 'user' ? `${account.login} (personal)` : `${account.login} (organization)`;
}

async function selectDefaultGitHubOwner(
  cancelAction: PromptCancelAction = 'exit',
  preferredOwner?: string,
): Promise<string | undefined> {
  try {
    const accounts = await getGitHubAccounts(realGitHub);
    if (accounts.length === 0) {
      return preferredOwner;
    }

    if (accounts.length === 1) {
      return accounts[0].login;
    }

    const initialValue = accounts.some((account) => account.login === preferredOwner)
      ? preferredOwner
      : accounts[0].login;
    const selectedOwner = await select({
      message: 'GitHub account/organization',
      options: accounts.map((account) => ({
        value: account.login,
        label: githubAccountLabel(account),
      })),
      initialValue,
    });
    handleCancel(selectedOwner, cancelAction);

    return String(selectedOwner);
  } catch (error) {
    if (isMenuBackSignal(error)) throw error;
    return preferredOwner;
  }
}

function stringOption(values: Record<string, string | boolean>, key: string): string | undefined {
  const value = values[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalSourceTypeValue(values: Record<string, string | boolean>): SourceRepoType | undefined {
  const value = stringOption(values, 'sourceType');
  if (value === undefined) {
    return undefined;
  }

  if (value === 'private' || value === 'oca' || value === 'external') {
    return value;
  }

  throw new Error(`Invalid value for --source-type: ${value}`);
}

function sourceTypeValue(values: Record<string, string | boolean>): SourceRepoType {
  return optionalSourceTypeValue(values) ?? 'private';
}

function booleanOption(values: Record<string, string | boolean>, key: string, fallback: boolean): boolean {
  const value = values[key];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = value.toLowerCase().trim();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;

  throw new Error(`Invalid boolean value for --${key}: ${value}`);
}

function yellow(value: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined) return value;
  return `\u001b[33m${value}\u001b[39m`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function renderedSourceRepoPath(target: string, sourceType: SourceRepoType, repoPath?: string): string {
  if (repoPath) {
    return `${target}/odoo/custom/src/${sourceType}/${repoPath}`;
  }
  return `${target}/odoo/custom/src/${sourceType}`;
}

function renderPostCreateGuidance(target: string, cwd: string): string {
  const relativeTarget = relative(cwd, target) || '.';
  return yellow(
    [
      'Environment is ready. Enter the development folder, then run the local WPMoo cockpit:',
      '',
      `cd ${shellQuote(relativeTarget)}`,
      './moo',
    ].join('\n'),
  );
}

function validateRepoName(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return 'Enter a repository name.';
  if (normalized.includes('/') || normalized.includes(':')) return 'Enter only the repository name, not a URL.';
  return undefined;
}

async function showStartup(argv: string[], skipUpdateCheck: boolean): Promise<void> {
  console.log(renderBanner());
  if (skipUpdateCheck) {
    console.log(renderVersionTag());
    console.log();
    return;
  }

  const updateCheck = await checkForUpdate(packageName(), packageVersion());
  console.log(renderVersionTag(updateCheck.status === 'update-available' ? updateCheck.latestVersion : undefined));
  if (updateCheck.status === 'update-available') {
    const shouldUpdate = await confirm({
      message: `Update to v.${updateCheck.latestVersion}? (Y/n)`,
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });
    handleCancel(shouldUpdate, 'exit');
    if (shouldUpdate) {
      try {
        await installLatestPackage(packageName(), updateCheck.latestVersion);
        const code = await restartCli(packageName(), updateCheck.latestVersion, argv);
        if (code === 0) {
          process.exit(0);
        }
        console.warn(`Update restart exited with code ${code ?? 'unknown'}; continuing with v.${packageVersion()}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Update failed: ${message}. Continuing with v.${packageVersion()}.`);
      }
    }
  }
  console.log();
}

async function selectCockpitCommandFromMenu(): Promise<CockpitCommand | 'exit'> {
  const selection = await selectCockpitTopLevelMenu();

  if (selection.kind === 'exit') {
    return 'exit';
  }

  if (selection.kind === 'command-palette') {
    return selectCockpitCommandFromPalette();
  }

  return selectCockpitCategoryCommand(selection.category);
}

async function optionsFromPrompts(showIntro = true, cancelAction: PromptCancelAction = 'exit'): Promise<ScaffoldOptions> {
  if (showIntro) {
    intro('Create Odoo dev environment');
  }

  const product = asString(
    await text({
      message: 'Product slug',
      placeholder: 'odoo_sample_module',
      validate: (value) => (value.trim() ? undefined : 'Enter a product/module slug.'),
    }),
    'odoo_sample_module',
    cancelAction,
  );

  const defaultTarget = `./${product}_dev`;
  const target = resolve(
    asString(
      await text({
        message: 'Environment folder',
        placeholder: defaultTarget,
        defaultValue: defaultTarget,
        initialValue: defaultTarget,
      }),
      defaultTarget,
      cancelAction,
    ),
  );

  const connectGitHub = await select({
    message: 'Connect this environment to Git/GitHub now?',
    options: [
      { value: true, label: 'Yes, connect Git/GitHub repositories' },
      { value: false, label: 'No, scaffold local-only' },
    ],
    initialValue: true,
  });
  handleCancel(connectGitHub, cancelAction);

  let selectedGitHubOwner: string | undefined;
  if (connectGitHub) {
    note(renderRepositorySetupNote(product), 'Repository setup');
    selectedGitHubOwner = await selectDefaultGitHubOwner(cancelAction);
  }

  const selectedVersion = await select({
    message: menuPromptMessage('Odoo version', cancelAction),
    options: supportedOdooVersions.map((version) => ({ value: version, label: version })),
    initialValue: supportedOdooVersions[0],
  });
  handleCancel(selectedVersion, cancelAction);
  const odooVersion = String(selectedVersion);

  async function promptInstallAgentSkills(): Promise<boolean> {
    const installAgentSkills = await select({
      message: 'Install project-local Odoo Agent Skills?',
      options: [
        { value: true, label: 'Yes, install latest default skills' },
        { value: false, label: 'No' },
      ],
      initialValue: false,
    });
    handleCancel(installAgentSkills, cancelAction);

    return Boolean(installAgentSkills);
  }

  if (!connectGitHub) {
    const installAgentSkills = await promptInstallAgentSkills();

    return {
      product,
      odooVersion,
      engine: 'compose',
      devRepo: basename(target),
      devRepoUrl: target,
      sourceRepos: [],
      target,
      dryRun: false,
      initEmptyRepos: false,
      stage: false,
      agentSkillsTemplateUrl: installAgentSkills ? defaultAgentSkillsTemplateUrl : undefined,
      createMissingRepos: false,
      repoVisibility: 'private',
      skipSubmodules: true,
    };
  }

  const detectedDevRepoUrl = await getOriginUrl(realGit, target);
  const defaultDevRepoUrl = selectedGitHubOwner
    ? githubRepositoryUrl(selectedGitHubOwner, `${product}_dev`)
    : undefined;
  const devRepoUrl = normalizeRepositoryUrl(
    await promptRepositoryUrl({
      label: 'Dev environment repo URL',
      suggestedUrl: detectedDevRepoUrl ?? defaultDevRepoUrl,
      placeholder: `https://github.com/your-account/${product}_dev.git`,
      cancelAction,
    }),
  );
  const defaultOwner = inferGitHubOwner(devRepoUrl) ?? selectedGitHubOwner;

  const sourceRepos: SourceRepo[] = [];
  let addAnother = true;

  while (addAnother) {
    const repoIndex = sourceRepos.length;
    const suggestedRepo =
      defaultOwner === undefined
        ? undefined
        : githubRepositoryUrl(defaultOwner, repoIndex === 0 ? product : `${product}_${repoIndex + 1}`);
    const sourceRepoUrl = normalizeRepositoryUrl(
      await promptRepositoryUrl({
        label: repoIndex === 0 ? 'Source repo URL' : `Additional source repo ${repoIndex + 1} URL`,
        suggestedUrl: suggestedRepo,
        placeholder: `https://github.com/owner/${repoIndex === 0 ? product : `${product}_${repoIndex + 1}`}.git`,
        cancelAction,
      }),
    );
    const sourcePath = inferRepoPath(sourceRepoUrl);

    sourceRepos.push({
      url: sourceRepoUrl,
      path: sourcePath,
      addons: [sourcePath],
    });

    const shouldAddAnother = await select({
      message: 'Add another source repo?',
      options: [
        { value: false, label: 'No' },
        { value: true, label: 'Yes' },
      ],
      initialValue: false,
    });
    handleCancel(shouldAddAnother, cancelAction);
    addAnother = Boolean(shouldAddAnother);
  }

  const installAgentSkills = await promptInstallAgentSkills();

  const initEmpty = await select({
    message: 'Initialize repositories that exist but have no commits?',
    options: [
      { value: true, label: 'Yes, create the selected Odoo branch' },
      { value: false, label: 'No, fail with instructions' },
    ],
    initialValue: true,
  });
  handleCancel(initEmpty, cancelAction);

  return {
    product,
    odooVersion,
    engine: 'compose',
    devRepo: inferRepoPath(devRepoUrl),
    devRepoUrl,
    sourceRepos,
    target,
    dryRun: false,
    initEmptyRepos: Boolean(initEmpty),
    stage: true,
    agentSkillsTemplateUrl: Boolean(installAgentSkills) ? defaultAgentSkillsTemplateUrl : undefined,
    createMissingRepos: false,
    repoVisibility: 'private',
  };
}

async function addRepoOptionsFromArgs(argv: string[]): Promise<AddModuleRepoOptions | undefined> {
  const { values } = parseArgs(argv);
  const repoUrl = stringOption(values, 'repoUrl') ?? stringOption(values, 'sourceRepoUrl');
  if (!repoUrl) {
    return undefined;
  }

  const target = resolve(stringOption(values, 'target') ?? process.cwd());
  return {
    target,
    repoUrl: normalizeRepositoryUrl(repoUrl),
    repoPath: stringOption(values, 'repo') ?? stringOption(values, 'sourcePath'),
    sourceType: sourceTypeValue(values),
    odooVersion: await commandOdooVersion(target, stringOption(values, 'odooVersion')),
    initEmptyRepos: booleanOption(values, 'initEmptyRepos', false),
    stage: booleanOption(values, 'stage', true),
  };
}

async function addRepoOptionsFromPrompts(
  showIntro = true,
  cancelAction: PromptCancelAction = 'exit',
): Promise<AddModuleRepoOptions> {
  showSubmenuIntro('Add source repo as submodule', showIntro, cancelAction);

  const target = process.cwd();
  const odooVersion = await commandOdooVersion(target);
  const preferredOwner = await environmentGitHubOwner(target);
  const selectedOwner = await selectDefaultGitHubOwner(cancelAction, preferredOwner);
  const owner =
    selectedOwner ??
    asString(
      await text({
        message: menuPromptMessage('GitHub owner/organization', cancelAction),
        placeholder: 'example-org',
        validate: (value) => (value.trim() ? undefined : 'Enter a GitHub owner or organization.'),
      }),
      'example-org',
      cancelAction,
    );
  const repoName = asString(
    await text({
      message: menuPromptMessage('Source repo name', cancelAction),
      placeholder: 'odoo_sample_module_repo',
      validate: validateRepoName,
    }),
    'odoo_sample_module_repo',
    cancelAction,
  );

  const repoUrl = githubRepositoryUrl(owner, repoName);

  return {
    target,
    repoUrl,
    sourceType: 'private',
    odooVersion,
    initEmptyRepos: true,
    stage: true,
  };
}

async function ensureAddRepoGitHubRepository(
  options: AddModuleRepoOptions,
  cancelAction: PromptCancelAction = 'exit',
): Promise<void> {
  if (!(await repositoryPreflightAvailable())) {
    note(
      [
        'GitHub CLI (`gh`) is not available or not authenticated.',
        'The source repo will be used as-is. If it does not exist, create it first or authenticate gh.',
      ].join('\n'),
      'Repository check skipped',
    );
    return;
  }

  const status = await getGitHubRepositoryStatus(realGitHub, options.repoUrl);
  if (status.status !== 'inaccessible') {
    return;
  }

  note(`Source repo is not accessible: ${status.slug}`, 'Repository check');
  const shouldCreate = await select({
    message: 'Create this source repository with GitHub CLI?',
    options: [
      { value: true, label: 'Yes, create it' },
      { value: false, label: 'No, I will create/check access myself' },
    ],
    initialValue: true,
  });
  handleCancel(shouldCreate, cancelAction);

  if (!shouldCreate) {
    throw new Error(`Source repository is not accessible: ${status.slug}`);
  }

  const visibility = await select({
    message: 'Visibility for new repository',
    options: [
      { value: 'private', label: 'Private' },
      { value: 'public', label: 'Public' },
    ],
    initialValue: 'private',
  });
  handleCancel(visibility, cancelAction);

  await createGitHubRepository(realGitHub, options.repoUrl, visibility as RepositoryVisibility);
}

async function selectSourceRepo(target: string, cancelAction: PromptCancelAction = 'exit'): Promise<string> {
  const repos = await listModuleRepos(target);
  if (repos.length === 0) {
    if (cancelAction === 'back') {
      note(
        `No source repos found under ${target}/odoo/custom/src/private.\nNext: choose "Add source repo" first.`,
        'Nothing to select',
      );
      handleUnavailableMenuChoice(cancelAction);
    }
    throw new Error(`No source repos found under ${target}/odoo/custom/src/private`);
  }

  const repoPath = await select({
    message: menuPromptMessage('Source repo', cancelAction),
    options: repos.map((repo) => ({ value: repo, label: repo })),
    initialValue: repos[0],
  });
  handleCancel(repoPath, cancelAction);

  return String(repoPath);
}

function suggestedModuleName(repoPath: string): string {
  return 'odoo_sample_module';
}

async function addModuleOptionsFromArgs(argv: string[]): Promise<AddModuleOptions | undefined> {
  const { values } = parseArgs(argv);
  const repoPath = stringOption(values, 'repo') ?? stringOption(values, 'sourcePath');
  const moduleName = stringOption(values, 'module') ?? stringOption(values, 'moduleName');
  if (!repoPath || !moduleName) {
    return undefined;
  }

  const target = resolve(stringOption(values, 'target') ?? process.cwd());
  return {
    target,
    repoPath,
    moduleName,
    odooVersion: await commandOdooVersion(target, stringOption(values, 'odooVersion')),
    stage: booleanOption(values, 'stage', true),
  };
}

async function addModuleOptionsFromPrompts(
  showIntro = true,
  cancelAction: PromptCancelAction = 'exit',
): Promise<AddModuleOptions> {
  showSubmenuIntro('Add module to source repo', showIntro, cancelAction);

  const target = process.cwd();
  const repoPath = await selectSourceRepo(target, cancelAction);
  const moduleName = asString(
    await text({
      message: menuPromptMessage('Module name', cancelAction),
      placeholder: suggestedModuleName(repoPath),
      validate: (value) => (value.trim() ? undefined : 'Enter the module technical name.'),
    }),
    suggestedModuleName(repoPath),
    cancelAction,
  );

  return {
    target,
    repoPath,
    moduleName,
    odooVersion: await commandOdooVersion(target),
    stage: true,
  };
}

function removeRepoOptionsFromArgs(argv: string[]): RemoveModuleRepoOptions | undefined {
  const { values } = parseArgs(argv);
  const repoPath = stringOption(values, 'repo') ?? stringOption(values, 'sourcePath');
  if (!repoPath) {
    return undefined;
  }

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    repoPath,
    sourceType: optionalSourceTypeValue(values),
    stage: booleanOption(values, 'stage', true),
  };
}

function resetOptionsFromArgs(argv: string[]): SafeResetOptions {
  const { values } = parseArgs(argv);

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    stage: booleanOption(values, 'stage', true),
  };
}

function sourceUsage(): string {
  return 'Usage: wpmoo source <list|sync|add|remove> [options]';
}

function sourceSyncOptionsFromArgs(argv: string[]): SourceSyncOptions {
  const { values } = parseArgs(argv);

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    stage: booleanOption(values, 'stage', true),
  };
}

function sourceListTargetFromArgs(argv: string[]): string {
  const { values } = parseArgs(argv);
  return resolve(stringOption(values, 'target') ?? process.cwd());
}

async function runSourceCommand(argv: string[]): Promise<void> {
  const [subcommand, ...subcommandArgv] = argv;
  if (!subcommand) {
    throw new Error(sourceUsage());
  }

  if (subcommand === 'list') {
    console.log(renderBanner());
    const target = sourceListTargetFromArgs(subcommandArgv);
    console.log(renderSourceList(await listSources(target)));
    return;
  }

  if (subcommand === 'sync') {
    console.log(renderBanner());
    const options = sourceSyncOptionsFromArgs(subcommandArgv);
    await syncSources(options);
    outro(`Synced source manifest in ${options.target}.`);
    return;
  }

  if (subcommand === 'add') {
    const options = await addRepoOptionsFromArgs(subcommandArgv);
    if (!options) {
      throw new Error('Usage: wpmoo source add --repo-url <url> [--source-type private|oca|external]');
    }
    console.log(renderBanner());
    await addModuleRepo(options);
    outro(`Added source repo under ${renderedSourceRepoPath(options.target, options.sourceType ?? 'private', options.repoPath)}.`);
    return;
  }

  if (subcommand === 'remove') {
    const options = removeRepoOptionsFromArgs(subcommandArgv);
    if (!options) {
      throw new Error('Usage: wpmoo source remove --repo <name> [--source-type private|oca|external]');
    }
    console.log(renderBanner());
    await removeModuleRepo(options);
    outro(`Removed source repo ${options.repoPath} from ${options.target}.`);
    return;
  }

  throw new Error(sourceUsage());
}

async function confirmSafeResetFromMenu(options: SafeResetOptions): Promise<void> {
  note(renderSafeResetPreview(options.target, options.stage), 'Safe reset preview');
  const confirmed = await confirm({
    message: menuPromptMessage('Continue with safe reset?', 'back'),
    active: 'Yes',
    inactive: 'No',
    initialValue: false,
  });
  handleCancel(confirmed, 'back');
  if (!confirmed) {
    throw new MenuBackSignal();
  }
}

async function removeRepoOptionsFromPrompts(
  argv: string[],
  showIntro = true,
  cancelAction: PromptCancelAction = 'exit',
): Promise<RemoveModuleRepoOptions> {
  showSubmenuIntro('Remove a repo', showIntro, cancelAction);

  const { values } = parseArgs(argv);
  const target = resolve(stringOption(values, 'target') ?? process.cwd());
  const repos = await listModuleRepos(target);
  if (repos.length === 0) {
    if (cancelAction === 'back') {
      note(
        `No module submodules found under ${target}/odoo/custom/src/private.\nNext: choose "Add source repo" first.`,
        'Nothing to remove',
      );
      handleUnavailableMenuChoice(cancelAction);
    }
    throw new Error(`No module submodules found under ${target}/odoo/custom/src/private`);
  }

  const repoPath = await select({
    message: menuPromptMessage('Repo to remove', cancelAction),
    options: repos.map((repo) => ({ value: repo, label: repo })),
    initialValue: repos[0],
  });
  handleCancel(repoPath, cancelAction);

  return {
    target,
    repoPath: String(repoPath),
    stage: true,
  };
}

function removeModuleOptionsFromArgs(argv: string[]): RemoveModuleOptions | undefined {
  const { values } = parseArgs(argv);
  const repoPath = stringOption(values, 'repo') ?? stringOption(values, 'sourcePath');
  const moduleName = stringOption(values, 'module') ?? stringOption(values, 'moduleName');
  if (!repoPath || !moduleName) {
    return undefined;
  }

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    repoPath,
    moduleName,
    deleteFiles: booleanOption(values, 'deleteFiles', false),
    stage: booleanOption(values, 'stage', true),
  };
}

async function removeModuleOptionsFromPrompts(
  showIntro = true,
  cancelAction: PromptCancelAction = 'exit',
): Promise<RemoveModuleOptions> {
  showSubmenuIntro('Remove module from source repo', showIntro, cancelAction);

  const target = process.cwd();
  const repoPath = await selectSourceRepo(target, cancelAction);
  const modules = await listModulesInSourceRepo(target, repoPath);
  if (modules.length === 0) {
    if (cancelAction === 'back') {
      note(
        `No Odoo modules found under ${target}/odoo/custom/src/private/${repoPath}.\nNext: choose "Add module to source repo" first.`,
        'Nothing to remove',
      );
      handleUnavailableMenuChoice(cancelAction);
    }
    throw new Error(`No Odoo modules found under ${target}/odoo/custom/src/private/${repoPath}`);
  }

  const moduleName = await select({
    message: menuPromptMessage('Module to remove', cancelAction),
    options: modules.map((module) => ({ value: module, label: module })),
    initialValue: modules[0],
  });
  handleCancel(moduleName, cancelAction);

  const deleteFiles = await confirm({
    message: menuPromptMessage('Delete module files too? (y/N)', cancelAction),
    active: 'Y',
    inactive: 'n',
    initialValue: false,
  });
  handleCancel(deleteFiles, cancelAction);

  return {
    target,
    repoPath,
    moduleName: String(moduleName),
    deleteFiles: Boolean(deleteFiles),
    stage: true,
  };
}

async function ensureGitHubRepositories(options: ScaffoldOptions, interactive: boolean): Promise<void> {
  if (options.dryRun) {
    return;
  }

  if (options.skipSubmodules) {
    return;
  }

  if (!interactive && !options.createMissingRepos) {
    return;
  }

  if (!(await repositoryPreflightAvailable())) {
    const message = [
      'GitHub CLI (`gh`) is not available or not authenticated.',
      'Install and authenticate it to auto-create missing GitHub repositories:',
      '',
      'brew install gh',
      'gh auth login',
    ].join('\n');

    if (options.createMissingRepos) {
      throw new Error(message);
    }

    if (interactive) {
      note(message, 'Repository check skipped');
    }
    return;
  }

  const { accessible, inaccessible: missing } = await checkGitHubRepositories(options);
  if (interactive && accessible.length > 0) {
    note(
      [
        'These GitHub repositories already exist and are accessible:',
        '',
        ...accessible.map((repository) => `- ${repository.label}: ${repository.slug}`),
      ].join('\n'),
      'Repository check',
    );
  }

  if (missing.length === 0) {
    return;
  }

  const missingList = missing
    .map((repository) => `- ${repository.label}: ${repository.slug}`)
    .join('\n');

  if (!interactive && options.createMissingRepos) {
    await createGitHubRepositories(missing, options.repoVisibility ?? 'private');
    return;
  }

  note(
    [
      'These GitHub repositories are not accessible. They may not exist, or your account may not have access:',
      '',
      missingList,
    ].join('\n'),
    'Repository check',
  );

  const shouldCreate = await select({
    message: 'Create the inaccessible repositories with GitHub CLI?',
    options: [
      { value: true, label: 'Yes, create them' },
      { value: false, label: 'No, I will create/check access myself' },
    ],
    initialValue: true,
  });
  if (isCancel(shouldCreate)) process.exit(1);

  if (!shouldCreate) {
    throw new Error(
      ['Required repositories are not accessible. Create them first:', '', ...manualCreateCommands(missing)].join(
        '\n',
      ),
    );
  }

  const visibility = await select({
    message: 'Visibility for new repositories',
    options: [
      { value: 'private', label: 'Private' },
      { value: 'public', label: 'Public' },
    ],
    initialValue: 'private',
  });
  if (isCancel(visibility)) process.exit(1);

  await createGitHubRepositories(missing, visibility as RepositoryVisibility);
}

async function runCockpitCommand(command: CockpitCommand, cwd: string): Promise<'continue' | 'exit'> {
  if (command.id === 'exit') {
    return 'exit';
  }

  if (command.target.kind === 'daily') {
    const argv = await collectDailyActionArgs(command.target.command, cwd);
    if (!(await confirmCockpitCommandRisk(command))) {
      note(`${command.slashAlias} was not run.`, 'Action skipped');
      return 'continue';
    }

    await runDailyAction(command.target.command, argv, cwd);
    note(`${command.slashAlias} completed.`, 'Done');
    return 'continue';
  }

  if (command.id === 'status') {
    note(await renderEnvironmentStatusForTarget(cwd), 'Environment status');
    return 'continue';
  }

  if (command.id === 'doctor') {
    note(await runDoctor(cwd), 'Doctor');
    return 'continue';
  }

  if (command.id === 'add-repo') {
    const options = await addRepoOptionsFromPrompts(false, 'back');
    await ensureAddRepoGitHubRepository(options, 'back');
    await addModuleRepo(options);
    note(`Added source repo under ${renderedSourceRepoPath(options.target, options.sourceType ?? 'private')}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'remove-repo') {
    const options = await removeRepoOptionsFromPrompts([], false, 'back');
    if (!(await confirmCockpitCommandRisk(command))) {
      note(`Source repo ${options.repoPath} was not removed.`, 'Action skipped');
      return 'continue';
    }

    await removeModuleRepo(options);
    note(`Removed source repo ${options.repoPath} from ${options.target}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'add-module') {
    const options = await addModuleOptionsFromPrompts(false, 'back');
    await addModuleToSourceRepo(options);
    note(`Added module ${options.moduleName} under source repo ${options.repoPath}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'remove-module') {
    const options = await removeModuleOptionsFromPrompts(false, 'back');
    if (!(await confirmCockpitCommandRisk(command))) {
      note(`Module ${options.moduleName} was not removed.`, 'Action skipped');
      return 'continue';
    }

    await removeModuleFromSourceRepo(options);
    note(`Removed module ${options.moduleName} from source repo ${options.repoPath}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'safe-reset') {
    const options = { target: cwd, stage: true };
    await confirmSafeResetFromMenu(options);
    await safeResetEnvironment(options);
    note(`Safe reset refreshed generated environment files in ${cwd}.`, 'Done');
    return 'continue';
  }

  note(`Unknown cockpit command: ${command.slashAlias}`, 'No action');
  return 'continue';
}

export async function runCli(cliArgv = process.argv.slice(2), cwd = process.cwd()): Promise<void> {
  installPromptCancelKeyTracker();
  const rawArgv = cliArgv;
  const skipUpdateCheck = isUpdateCheckSkipped(rawArgv);
  const argv = stripInternalFlags(rawArgv);
  if (isHelpRequested(argv)) {
    console.log(renderHelp());
    return;
  }
  if (isVersionRequested(argv)) {
    console.log(renderVersion());
    return;
  }

  const route = commandFromArgs(argv);
  if (route.command === 'menu') {
    await showStartup(argv, skipUpdateCheck);
    const detection = await detectDevelopmentEnvironment(cwd);

    if (!detection.isEnvironment) {
      const resolvedOptions = await optionsFromPrompts();
      await ensureGitHubRepositories(resolvedOptions, true);
      await scaffold(resolvedOptions);
      note(renderPostCreateGuidance(resolvedOptions.target, cwd), 'Next steps');
      outro(`Created Odoo dev overlay in ${resolvedOptions.target}. Review staged changes, then commit.`);
      return;
    }

    intro('WPMoo Odoo Dev');
    while (true) {
      try {
        const status = await getEnvironmentStatus(cwd);
        note(renderEnvironmentStatusSummary(status), 'Environment status');
        const command = await selectCockpitCommandFromMenu();

        if (command === 'exit') {
          return;
        }

        const outcome = await runCockpitCommand(command, cwd);
        if (outcome === 'exit') {
          return;
        }
      } catch (error) {
        if (isMenuBackSignal(error)) {
          continue;
        }
        throw error;
      }
    }
  }

  if (route.command === 'add-repo') {
    const options = await addRepoOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await addModuleRepo(options);
      outro(`Added source repo under ${renderedSourceRepoPath(options.target, options.sourceType ?? 'private', options.repoPath)}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await addRepoOptionsFromPrompts();
    await ensureAddRepoGitHubRepository(promptedOptions);
    await addModuleRepo(promptedOptions);
    outro(`Added source repo under ${promptedOptions.target}/odoo/custom/src/private.`);
    return;
  }

  if (route.command === 'remove-repo') {
    const options = removeRepoOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await removeModuleRepo(options);
      outro(`Removed source repo ${options.repoPath} from ${options.target}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await removeRepoOptionsFromPrompts(route.argv);
    await removeModuleRepo(promptedOptions);
    outro(`Removed source repo ${promptedOptions.repoPath} from ${promptedOptions.target}.`);
    return;
  }

  if (route.command === 'source') {
    await runSourceCommand(route.argv);
    return;
  }

  if (route.command === 'add-module') {
    const options = await addModuleOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await addModuleToSourceRepo(options);
      outro(`Added module ${options.moduleName} under source repo ${options.repoPath}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await addModuleOptionsFromPrompts();
    await addModuleToSourceRepo(promptedOptions);
    outro(`Added module ${promptedOptions.moduleName} under source repo ${promptedOptions.repoPath}.`);
    return;
  }

  if (route.command === 'remove-module') {
    const options = removeModuleOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await removeModuleFromSourceRepo(options);
      outro(`Removed module ${options.moduleName} from source repo ${options.repoPath}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await removeModuleOptionsFromPrompts();
    await removeModuleFromSourceRepo(promptedOptions);
    outro(`Removed module ${promptedOptions.moduleName} from source repo ${promptedOptions.repoPath}.`);
    return;
  }

  if (route.command === 'reset') {
    console.log(renderBanner());
    const options = resetOptionsFromArgs(route.argv);
    await safeResetEnvironment(options);
    outro(`Safe reset refreshed generated environment files in ${options.target}.`);
    return;
  }

  if (route.command === 'doctor') {
    if (route.argv.length > 0) {
      throw new Error('Usage: wpmoo doctor');
    }
    console.log(renderBanner());
    console.log(await runDoctor(cwd));
    return;
  }

  if (route.command === 'status') {
    if (route.argv.length > 0) {
      throw new Error('Usage: wpmoo status');
    }
    console.log(renderBanner());
    console.log(await renderEnvironmentStatusForTarget(cwd));
    return;
  }

  if (isDailyActionCommand(route.command)) {
    console.log(renderBanner());
    await runDailyAction(route.command, route.argv, cwd);
    return;
  }

  const options = optionsFromArgs(route.argv);
  if (options) {
    console.log(renderBanner());
  } else {
    await showStartup(argv, skipUpdateCheck);
  }

  const resolvedOptions = options ?? (await optionsFromPrompts());
  await ensureGitHubRepositories(resolvedOptions, options === undefined);
  const result = await scaffold(resolvedOptions);

  if (resolvedOptions.dryRun) {
    console.log('Dry run: planned files');
    for (const file of result.plannedFiles) console.log(`- ${file}`);
    console.log('Dry run: planned commands');
    for (const command of result.plannedCommands) console.log(`- ${command}`);
    return;
  }

  note(renderPostCreateGuidance(resolvedOptions.target, cwd), 'Next steps');
  outro(`Created Odoo dev overlay in ${resolvedOptions.target}. Review staged changes, then commit.`);
}

export function isCliEntrypoint(metaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;

  try {
    const entrypointUrl = pathToFileURL(realpathSync(fileURLToPath(metaUrl))).href;
    const argvUrl = pathToFileURL(realpathSync(argvPath)).href;
    return entrypointUrl === argvUrl;
  } catch {
    return metaUrl === pathToFileURL(argvPath).href;
  }
}

if (isCliEntrypoint(import.meta.url)) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
