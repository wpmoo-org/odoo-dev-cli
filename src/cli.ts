#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { rm, rename } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  commandFromArgs,
  isHelpRequested,
  isVersionRequested,
  optionsFromArgs,
  parseArgs,
  stripInternalFlags,
} from './args.js';
import { cockpitCommands, type CockpitCommand } from './cockpit/command-registry.js';
import { collectDailyActionArgs } from './cockpit/daily-prompts.js';
import { selectModuleAction, type ModuleActionId } from './cockpit/module-action-menu.js';
import { selectModuleFromBrowser } from './cockpit/module-browser.js';
import {
  cockpitCommandDisabledReason,
  renderDisabledActionAlert,
  selectCockpitTopLevelMenu,
} from './cockpit/menu.js';
import {
  cockpitResultActionOptions,
  type CockpitResultActionValue,
  renderCockpitDoctorResult,
  renderCockpitEnvironmentStatusResult,
} from './cockpit/result-view.js';
import { confirmCockpitCommandRisk } from './cockpit/safety.js';
import { doctorOptionsFromArgs } from './cli-routes/doctor.js';
import { booleanOption, jsonOption, optionalSourceTypeValue, printJson, stringOption } from './cli-routes/options.js';
import { resetCommandOptionsFromArgs } from './cli-routes/reset.js';
import {
  addRepoOptionsFromArgs,
  removeRepoOptionsFromArgs,
  renderedSourceRepoPath,
  runSourceCommand,
} from './cli-routes/source.js';
import { detectDevelopmentEnvironment } from './environment.js';
import { commandOdooVersion } from './environment-version.js';
import { defaultAgentSkillsTemplateUrl } from './external-templates.js';
import {
  findDatabaseSnapshots,
  databaseSnapshotCatalogJson,
  listEnvironmentDatabases,
  normalizeDatabaseListResult,
  renderDatabaseSnapshotCatalog,
  type DatabaseListOptions,
} from './databases.js';
import { isDailyActionCommand, runDailyAction, runDailyActionWithStyledOutput, type DailyActionCommand } from './daily-actions.js';
import { getDoctorReport, runDoctor, type DoctorCommandOptions } from './doctor.js';
import { getOriginUrl, realGit } from './git.js';
import { renderHelp } from './help.js';
import { runLocalCockpit } from './local-cockpit.js';
import {
  addModuleToSourceRepo,
  listModulesInEnvironment,
  removeModuleFromSourceRepo,
  type AddModuleOptions,
  type ListedModule,
  type RemoveModuleOptions,
} from './module-actions.js';
import { resolveModuleTarget, type ModuleTargetResolution } from './module-target-resolver.js';
import { supportedOdooVersions } from './odoo-versions.js';
import { renderRepositorySetupNote } from './prompt-copy.js';
import { promptRepositoryUrl } from './prompt-repositories.js';
import { inferGitHubOwner, inferRepoPath, normalizeRepositoryUrl } from './repo-url.js';
import { addModuleRepo, listModuleRepos, removeModuleRepo, type AddModuleRepoOptions, type RemoveModuleRepoOptions } from './repo-actions.js';
import {
  renderSafeResetPreview,
  renderSafeResetSelectedPreview,
  safeResetEnvironment,
  safeResetSelectableGeneratedPaths,
  type SafeResetOptions,
} from './safe-reset.js';
import {
  getServiceRuntimeStatus,
  renderServiceRuntimeStatusLine,
  type ServiceRuntimeStatus,
} from './service-runtime-status.js';
import {
  listSources,
} from './source-actions.js';
import {
  backupTargetPath,
  expectedTargetConfirmation,
  inspectEnvironmentTarget,
  renderExistingEnvironmentSummary,
  renderForeignEnvironmentTargetWarning,
} from './environment-target-preflight.js';
import {
  getGitHubPrerequisiteStatus,
  renderGitHubPrerequisiteGuidance,
} from './github-prerequisites.js';
import {
  checkGitHubRepositories,
  createGitHubRepositories,
  manualCreateCommands,
} from './repository-preflight.js';
import { scaffold } from './scaffold.js';
import {
  getSystemPrerequisiteStatus,
  renderSystemPrerequisiteGuidance,
} from './system-prerequisites.js';
import { confirmPrompt, introPrompt, isPromptCancel, notePrompt, outroPrompt, promptSeparator, selectPrompt, textPrompt } from './prompts/index.js';
import { renderBanner } from './templates.js';
import type { ScaffoldOptions, SourceRepo, SourceRepoType } from './types.js';
import { checkForUpdate, isUpdateCheckSkipped, restartCli } from './update-check.js';
import { packageName, packageVersion, renderVersion, renderVersionTag } from './version.js';
import {
  environmentStatusJson,
  type EnvironmentStatus,
  getEnvironmentStatus,
  environmentBannerSummaryLine,
  renderEnvironmentStatusForTarget,
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
import { validateModuleName } from './path-validation.js';

function handleCancel(value: unknown, action: PromptCancelAction): void {
  handlePromptCancel(isPromptCancel(value), action);
}

function showSubmenuIntro(title: string, showIntro: boolean, cancelAction: PromptCancelAction): void {
  if (showIntro) {
    introPrompt(menuIntroTitle(title, cancelAction));
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
    const selectedOwner = await selectPrompt({
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

function supportsAnsi(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
}

function ansi(value: string, open: string, close: string): string {
  if (!supportsAnsi()) return value;
  return `${open}${value}${close}`;
}

function yellow(value: string): string {
  return ansi(value, '\u001B[33m', '\u001B[39m');
}

function cyan(value: string): string {
  return ansi(value, '\u001B[36m', '\u001B[39m');
}

function boldGreen(value: string): string {
  return ansi(value, '\u001B[1m\u001B[32m', '\u001B[39m\u001B[22m');
}

function dim(value: string): string {
  return ansi(value, '\u001B[2m', '\u001B[22m');
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

type SourceRepoChoice = {
  repoPath: string;
  sourceType: SourceRepoType;
};

type ModulePromptOptions = AddModuleOptions & {
  sourceType?: SourceRepoType;
};

type ModuleRemovalPromptOptions = RemoveModuleOptions & {
  sourceType?: SourceRepoType;
};

function renderPostCreateGuidance(target: string, cwd: string): string {
  const relativeTarget = relative(cwd, target) || '.';
  const cdCommand = `cd ${shellQuote(relativeTarget)}`;

  if (!supportsAnsi()) {
    return [
      'Environment is ready. Open it now, or copy these commands:',
      '',
      cdCommand,
      './moo',
    ].join('\n');
  }

  return [
    boldGreen('✓ Environment is ready.'),
    cyan('Open it now, or copy these commands:'),
    '',
    yellow(cdCommand),
    yellow('./moo'),
  ].join('\n');
}

type CreateFlowResult =
  | { kind: 'create'; options: ScaffoldOptions }
  | { kind: 'updated'; target: string }
  | { kind: 'deleted'; target: string }
  | { kind: 'cancelled' };

type ExistingEnvironmentAction = 'update-existing' | 'reinstall-environment' | 'delete-environment' | 'cancel';
type ForeignTargetAction = 'choose-another-folder' | 'cancel';
type GitHubPrerequisiteAction = 'retry' | 'continue-local-only' | 'cancel';
type SystemPrerequisiteAction = 'check-again';

function validateRepoName(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return 'Enter a repository name.';
  if (normalized.includes('/') || normalized.includes(':')) return 'Enter only the repository name, not a URL.';
  return undefined;
}

type StartupBannerDetails = (versionLine: string) => readonly string[];

function startupVersionLine(latestVersion?: string): string {
  return `v${packageVersion()}${latestVersion ? ` -> v${latestVersion} available` : ''}`;
}

function renderStartupBanner(details?: StartupBannerDetails, latestVersion?: string): string {
  const versionLine = startupVersionLine(latestVersion);
  return renderBanner(details?.(versionLine), details ? { version: versionLine } : undefined);
}

function renderCockpitStatusLines(
  status: EnvironmentStatus,
  serviceStatus: ServiceRuntimeStatus,
  lastStatus: string,
): string[] {
  return [
    environmentBannerSummaryLine(status),
    renderServiceRuntimeStatusLine(serviceStatus),
    lastStatus,
  ];
}

function renderLastCommandStatus(command: CockpitCommand): string {
  return `Last: ${command.label} ✓ completed`;
}

function renderLastCommandError(command: CockpitCommand, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Last: ${command.label} ✗ Error: ${message}`;
}

const COCKPIT_ENTER_ALTERNATE_SCREEN = '\u001B[?1049h';
const COCKPIT_EXIT_ALTERNATE_SCREEN = '\u001B[?1049l';
const COCKPIT_CLEAR_SCREEN = '\u001B[H\u001B[2J\u001B[3J\u001B[H';

function canControlCockpitScreen(): boolean {
  return Boolean(process.stdout.isTTY);
}

function clearCockpitScreen(): void {
  if (canControlCockpitScreen()) {
    process.stdout.write(COCKPIT_CLEAR_SCREEN);
  }
}

function enterCockpitScreen(): () => void {
  if (!canControlCockpitScreen()) {
    return () => undefined;
  }

  let restored = false;
  const restore = () => {
    if (restored) {
      return;
    }

    restored = true;
    process.off('exit', restore);
    process.stdout.write(COCKPIT_EXIT_ALTERNATE_SCREEN);
  };

  process.stdout.write(COCKPIT_ENTER_ALTERNATE_SCREEN);
  clearCockpitScreen();
  process.once('exit', restore);
  return restore;
}

function clearPrerequisiteScreen(): void {
  if (process.stdout.isTTY) {
    process.stdout.write('\u001B[3J\u001B[2J\u001B[H');
  }
}

const ANSI_ACTION = '\u001B[38;2;226;184;96m';
const ANSI_SUCCESS = '\u001B[32m';
const ANSI_DEFAULT_FOREGROUND = '\u001B[39m';
const ANSI_DIM_INFO = '\u001B[2m\u001B[38;2;120;157;181m';
const ANSI_RESET = '\u001B[0m';

function renderActionText(value: string): string {
  return ansi(value, ANSI_ACTION, ANSI_DEFAULT_FOREGROUND);
}

function renderCompletedText(action: string): string {
  if (!supportsAnsi()) {
    return `✓ ${action} completed.`;
  }

  return `${ANSI_SUCCESS}✓${ANSI_DEFAULT_FOREGROUND} ${action} ${ANSI_SUCCESS}completed${ANSI_DEFAULT_FOREGROUND}.`;
}

function renderBackHelp(): string {
  return ansi('Esc to go back', ANSI_DIM_INFO, ANSI_RESET);
}

const manualDatabaseValue = '__wpmoo_manual_database_entry__';

async function showStartup(argv: string[], skipUpdateCheck: boolean, details?: StartupBannerDetails): Promise<void> {
  if (skipUpdateCheck) {
    console.log(renderStartupBanner(details));
    if (!details) {
      console.log(renderVersionTag());
    }
    console.log();
    return;
  }

  const updateCheck = await checkForUpdate(packageName(), packageVersion());
  const latestVersion = updateCheck.status === 'update-available' ? updateCheck.latestVersion : undefined;
  console.log(renderStartupBanner(details, latestVersion));
  if (!details) {
    console.log(renderVersionTag(latestVersion));
  }
  if (updateCheck.status === 'update-available') {
    const shouldUpdate = await confirmPrompt({
      message: `Update to v.${updateCheck.latestVersion}? (Y/n)`,
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });
    handleCancel(shouldUpdate, 'exit');
    if (shouldUpdate) {
      try {
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

async function selectCockpitCommandFromMenu(
  serviceStatus: ServiceRuntimeStatus,
  moduleCount?: number,
  sourceRepoCount?: number,
  snapshotCount?: number,
): Promise<CockpitCommand | 'exit'> {
  const selection = await selectCockpitTopLevelMenu({
    serviceStatus: legacyCockpitServiceStatus(serviceStatus),
    moduleCount,
    sourceRepoCount,
    snapshotCount,
  });

  if (selection.kind === 'exit') {
    return 'exit';
  }

  return selection.command;
}

function legacyCockpitServiceStatus(serviceStatus: ServiceRuntimeStatus): ServiceRuntimeStatus {
  return serviceStatus.kind === 'services-running' ||
    serviceStatus.kind === 'db-ready' ||
    serviceStatus.kind === 'odoo-not-ready' ||
    serviceStatus.kind === 'fully-ready'
    ? { kind: 'running' }
    : serviceStatus;
}

async function resolveEnvironmentTargetFromPrompts(
  product: string,
  cancelAction: PromptCancelAction,
): Promise<{ kind: 'create'; target: string } | { kind: 'updated'; target: string } | { kind: 'deleted'; target: string } | { kind: 'cancelled' }> {
  const defaultTarget = `./${product}_dev`;

  while (true) {
    const target = resolve(
      asString(
        await textPrompt({
          message: 'Environment folder',
          placeholder: defaultTarget,
          defaultValue: defaultTarget,
          initialValue: defaultTarget,
        }),
        defaultTarget,
        cancelAction,
      ),
    );
    const state = await inspectEnvironmentTarget(target);

    if (state.kind === 'missing_target') {
      return { kind: 'create', target };
    }

    if (state.kind === 'foreign_target') {
      notePrompt(renderForeignEnvironmentTargetWarning(state), 'Environment folder exists');
      const action = await selectPrompt({
        message: 'What do you want to do?',
        options: [
          { value: 'choose-another-folder' as const, label: 'Choose another folder' },
          { value: 'cancel' as const, label: 'Cancel' },
        ],
        initialValue: 'choose-another-folder',
      });
      handleCancel(action, cancelAction);

      if (action === 'choose-another-folder') {
        continue;
      }
      return { kind: 'cancelled' };
    }

    notePrompt(renderExistingEnvironmentSummary(state), 'Existing environment');
    const action = await selectPrompt({
      message: 'This environment folder already exists. What do you want to do?',
      options: [
        { value: 'update-existing' as const, label: 'Update existing environment' },
        { value: 'reinstall-environment' as const, label: 'Back up existing environment folder and create a new one' },
        { value: 'delete-environment' as const, label: 'Delete environment' },
        { value: 'cancel' as const, label: 'Cancel' },
      ],
      initialValue: 'update-existing',
    });
    handleCancel(action, cancelAction);

    if ((action as ExistingEnvironmentAction) === 'update-existing') {
      await safeResetEnvironment({ target, stage: true });
      return { kind: 'updated', target };
    }

    if ((action as ExistingEnvironmentAction) === 'reinstall-environment') {
      const backup = backupTargetPath(target);
      await rename(target, backup);
      notePrompt(`Existing environment moved to:\n${backup}`, 'Environment backup');
      return { kind: 'create', target };
    }

    if ((action as ExistingEnvironmentAction) === 'delete-environment') {
      const expectedName = basename(target);
      const confirmation = await textPrompt({
        message: `Type ${expectedName} to confirm deletion`,
        validate: (value) => (expectedTargetConfirmation(target, value) ? undefined : `Type ${expectedName} exactly to confirm.`),
      });
      handleCancel(confirmation, cancelAction);
      if (!expectedTargetConfirmation(target, String(confirmation))) {
        throw new Error(`Deletion confirmation did not match ${expectedName}.`);
      }
      await rm(target, { recursive: true, force: true });
      return { kind: 'deleted', target };
    }

    return { kind: 'cancelled' };
  }
}

async function promptGitHubPrerequisites(cancelAction: PromptCancelAction): Promise<boolean> {
  while (true) {
    const status = await getGitHubPrerequisiteStatus();
    if (status.status === 'ready') {
      return true;
    }

    notePrompt(renderGitHubPrerequisiteGuidance(status), 'GitHub prerequisites');
    const action = await selectPrompt({
      message: 'GitHub repository prerequisites',
      options: [
        { value: 'retry' as const, label: 'Retry prerequisite check' },
        { value: 'continue-local-only' as const, label: 'Continue local-only' },
        { value: 'cancel' as const, label: 'Cancel' },
      ],
      initialValue: 'retry',
    });
    handleCancel(action, cancelAction);

    if ((action as GitHubPrerequisiteAction) === 'retry') {
      continue;
    }
    if ((action as GitHubPrerequisiteAction) === 'continue-local-only') {
      return false;
    }
    throw new Error('GitHub prerequisites were not completed.');
  }
}

async function optionsFromPrompts(showIntro = true, cancelAction: PromptCancelAction = 'exit'): Promise<CreateFlowResult> {
  if (showIntro) {
    introPrompt('Create Odoo dev environment');
  }

  const product = asString(
    await textPrompt({
      message: 'Product slug',
      placeholder: 'odoo_sample_module',
      validate: (value) => (value.trim() ? undefined : 'Enter a product/module slug.'),
    }),
    'odoo_sample_module',
    cancelAction,
  );

  const targetResult = await resolveEnvironmentTargetFromPrompts(product, cancelAction);
  if (targetResult.kind !== 'create') {
    return targetResult;
  }
  const { target } = targetResult;

  const connectGitHub = await selectPrompt({
    message: 'Connect this environment to Git/GitHub now?',
    options: [
      { value: true, label: 'Yes, connect Git/GitHub repositories' },
      { value: false, label: 'No, scaffold local-only' },
    ],
    initialValue: true,
  });
  handleCancel(connectGitHub, cancelAction);

  let selectedGitHubOwner: string | undefined;
  const useGitHub = Boolean(connectGitHub) && (await promptGitHubPrerequisites(cancelAction));
  if (useGitHub) {
    notePrompt(renderRepositorySetupNote(product), 'Repository setup');
    selectedGitHubOwner = await selectDefaultGitHubOwner(cancelAction);
  }

  const selectedVersion = await selectPrompt({
    message: menuPromptMessage('Odoo version', cancelAction),
    options: supportedOdooVersions.map((version) => ({ value: version, label: version })),
    initialValue: supportedOdooVersions[0],
  });
  handleCancel(selectedVersion, cancelAction);
  const odooVersion = String(selectedVersion);

  async function promptInstallAgentSkills(): Promise<boolean> {
    const installAgentSkills = await selectPrompt({
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

  if (!useGitHub) {
    const installAgentSkills = await promptInstallAgentSkills();

    return {
      kind: 'create',
      options: {
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
      },
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

    const shouldAddAnother = await selectPrompt({
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

  const initEmpty = await selectPrompt({
    message: 'Initialize repositories that exist but have no commits?',
    options: [
      { value: true, label: 'Yes, create the selected Odoo branch' },
      { value: false, label: 'No, fail with instructions' },
    ],
    initialValue: true,
  });
  handleCancel(initEmpty, cancelAction);

  return {
    kind: 'create',
    options: {
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
    },
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
      await textPrompt({
        message: menuPromptMessage('GitHub owner/organization', cancelAction),
        placeholder: 'example-org',
        validate: (value) => (value.trim() ? undefined : 'Enter a GitHub owner or organization.'),
      }),
      'example-org',
      cancelAction,
    );
  const repoName = asString(
    await textPrompt({
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
  const prerequisiteStatus = await getGitHubPrerequisiteStatus();
  if (prerequisiteStatus.status !== 'ready') {
    notePrompt(
      [
        renderGitHubPrerequisiteGuidance(prerequisiteStatus),
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

  notePrompt(`Source repo is not accessible: ${status.slug}`, 'Repository check');
  const shouldCreate = await selectPrompt({
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

  const visibility = await selectPrompt({
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

async function selectSourceRepo(target: string, cancelAction: PromptCancelAction = 'exit'): Promise<SourceRepoChoice> {
  const repos = await listSources(target);
  const repoOptions =
    repos.length > 0
      ? repos.map((repo) => ({
          value: { repoPath: repo.path, sourceType: repo.type },
          label: `${repo.type}/${repo.path}`,
        }))
      : (await listModuleRepos(target)).map((repoPath) => ({
          value: { repoPath, sourceType: 'private' as const },
          label: `private/${repoPath}`,
        }));

  if (repoOptions.length === 0) {
    if (cancelAction === 'back') {
      notePrompt(
        `No source repos found under ${target}/odoo/custom/src.\nNext: choose "Add source repo" first.`,
        'Nothing to select',
      );
      handleUnavailableMenuChoice(cancelAction);
    }
    throw new Error(`No source repos found under ${target}/odoo/custom/src`);
  }

  const selected = await selectPrompt({
    message: menuPromptMessage('Source repo', cancelAction),
    options: repoOptions,
    initialValue: repoOptions[0].value,
  });
  handleCancel(selected, cancelAction);

  if (typeof selected === 'string') {
    return { repoPath: selected, sourceType: 'private' };
  }

  if (typeof selected === 'object' && selected !== null && 'repoPath' in selected && 'sourceType' in selected) {
    return { repoPath: selected.repoPath as string, sourceType: selected.sourceType as SourceRepoType };
  }

  return { repoPath: String(selected), sourceType: 'private' };
}

function suggestedModuleName(repoPath: string): string {
  return 'odoo_sample_module';
}

function validateModuleNameInput(value: string): string | undefined {
  try {
    validateModuleName(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid module name.';
  }
}

async function addModuleOptionsFromArgs(argv: string[]): Promise<ModulePromptOptions | undefined> {
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
    sourceType: optionalSourceTypeValue(values),
    odooVersion: await commandOdooVersion(target, stringOption(values, 'odooVersion')),
    stage: booleanOption(values, 'stage', true),
  };
}

async function addModuleOptionsFromPrompts(
  showIntro = true,
  cancelAction: PromptCancelAction = 'exit',
): Promise<ModulePromptOptions> {
  showSubmenuIntro('Add module to source repo', showIntro, cancelAction);

  const target = process.cwd();
  const sourceRepo = await selectSourceRepo(target, cancelAction);
  const moduleName = asString(
    await textPrompt({
      message: menuPromptMessage('Module name', cancelAction),
      placeholder: suggestedModuleName(sourceRepo.repoPath),
      validate: validateModuleNameInput,
    }),
    suggestedModuleName(sourceRepo.repoPath),
    cancelAction,
  );

  return {
    target,
    repoPath: sourceRepo.repoPath,
    sourceType: sourceRepo.sourceType,
    moduleName,
    odooVersion: await commandOdooVersion(target),
    stage: true,
  };
}

async function collectSafeResetGeneratedPathSelection(options: SafeResetOptions): Promise<readonly string[] | undefined> {
  const candidates = safeResetSelectableGeneratedPaths(options.target);
  if (candidates.length === 0) {
    notePrompt(renderSafeResetPreview(options.target, options.stage), 'Safe reset preview', { showTitle: false });
    return undefined;
  }
  if (!process.stdin.isTTY) {
    notePrompt(renderSafeResetPreview(options.target, options.stage), 'Safe reset preview', { showTitle: false });
    return candidates;
  }

  while (true) {
    notePrompt(renderSafeResetSelectedPreview(options.target, options.stage, candidates), 'Safe reset preview', {
      showTitle: false,
    });
    const choice = await selectPrompt<string>({
      message: menuPromptMessage('Actions', 'back'),
      choices: [
        { value: 'continue', name: 'Continue to confirmation' },
        { value: 'cancel', name: 'Cancel safe reset' },
      ],
      pageSize: 4,
      navigationHelp: 'back',
    });
    handleCancel(choice, 'back');
    const selectedAction = String(choice);
    if (selectedAction === 'continue') {
      return candidates;
    }
    if (selectedAction === 'cancel') {
      throw new MenuBackSignal();
    }
  }
}

async function confirmSafeResetFromMenu(options: SafeResetOptions): Promise<void> {
  const selectedGeneratedPaths = await collectSafeResetGeneratedPathSelection(options);
  if (selectedGeneratedPaths !== undefined) {
    options.includeGeneratedPaths = selectedGeneratedPaths;
  }
  const confirmed = await confirmPrompt({
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
      notePrompt(
        `No module submodules found under ${target}/odoo/custom/src/private.\nNext: choose "Add source repo" first.`,
        'Nothing to remove',
      );
      handleUnavailableMenuChoice(cancelAction);
    }
    throw new Error(`No module submodules found under ${target}/odoo/custom/src/private`);
  }

  const repoPath = await selectPrompt({
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

function removeModuleOptionsFromArgs(argv: string[]): ModuleRemovalPromptOptions | undefined {
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
    sourceType: optionalSourceTypeValue(values),
    deleteFiles: booleanOption(values, 'deleteFiles', false),
    dryRun: booleanOption(values, 'dryRun', false),
    stage: booleanOption(values, 'stage', true),
  };
}

async function removeModuleOptionsFromPrompts(
  showIntro = true,
  cancelAction: PromptCancelAction = 'exit',
): Promise<RemoveModuleOptions> {
  if (showIntro) {
    introPrompt('Remove module');
  }

  const target = process.cwd();
  const selectedModule = await selectModuleFromBrowser(target, { cancelAction });
  if (!selectedModule) {
    if (cancelAction === 'back') {
      notePrompt(
        'No Odoo modules found.\nNext: choose "Add module" or "Add source repo" first.',
        'Nothing to remove',
      );
      handleUnavailableMenuChoice(cancelAction);
    }
    throw new Error('No Odoo modules found');
  }

  const deleteFiles = await confirmPrompt({
    message: menuPromptMessage('Delete module files too?', cancelAction),
    active: 'Y',
    inactive: 'n',
    initialValue: cancelAction === 'back',
  });
  handleCancel(deleteFiles, cancelAction);

  return {
    target,
    repoPath: selectedModule.repoPath,
    sourceType: selectedModule.sourceType,
    moduleName: selectedModule.moduleName,
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

  const prerequisiteStatus = await getGitHubPrerequisiteStatus();
  if (prerequisiteStatus.status !== 'ready') {
    const message = renderGitHubPrerequisiteGuidance(prerequisiteStatus);

    if (options.createMissingRepos || !interactive) {
      throw new Error(message);
    }

    notePrompt(message, 'GitHub prerequisites');
    return;
  }

  const { accessible, inaccessible: missing, blocked } = await checkGitHubRepositories(options);
  if (blocked.length > 0) {
    const blockedList = blocked
      .map((repository) => `- ${repository.label}: ${repository.slug}`)
      .join('\n');
    notePrompt(
      [
        'These dev environment repositories already contain files and cannot be used automatically:',
        '',
        blockedList,
        '',
        'Choose another dev repository, empty the existing repository, or cancel and handle it manually.',
      ].join('\n'),
      'Repository check blocked',
    );
    throw new Error(`Dev environment repository is non-empty or could not be verified: ${blocked.map((repo) => repo.slug).join(', ')}`);
  }

  if (interactive && accessible.length > 0) {
    notePrompt(
      dim([
        'These GitHub repositories already exist and are accessible:',
        '',
        ...accessible.map((repository) => `- ${repository.label}: ${repository.slug}`),
      ].join('\n')),
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

  notePrompt(
    [
      'These GitHub repositories are not accessible. They may not exist, or your account may not have access:',
      '',
      missingList,
    ].join('\n'),
    'Repository check',
  );

  const shouldCreate = await selectPrompt({
    message: 'Create the inaccessible repositories with GitHub CLI?',
    options: [
      { value: true, label: 'Yes, create them' },
      { value: false, label: 'No, I will create/check access myself' },
    ],
    initialValue: true,
  });
  handleCancel(shouldCreate, 'exit');

  if (!shouldCreate) {
    throw new Error(
      ['Required repositories are not accessible. Create them first:', '', ...manualCreateCommands(missing)].join(
        '\n',
      ),
    );
  }

  const visibility = await selectPrompt({
    message: 'Visibility for new repositories',
    options: [
      { value: 'private', label: 'Private' },
      { value: 'public', label: 'Public' },
    ],
    initialValue: 'private',
  });
  handleCancel(visibility, 'exit');

  await createGitHubRepositories(missing, visibility as RepositoryVisibility);
}

async function ensureSystemPrerequisites(interactive: boolean): Promise<boolean> {
  while (true) {
    const status = await getSystemPrerequisiteStatus();
    if (status.ok) {
      return true;
    }

    const guidance = renderSystemPrerequisiteGuidance(status);
    if (!interactive) {
      throw new Error(guidance);
    }

    clearPrerequisiteScreen();
    console.log(renderStartupBanner());
    console.log(renderVersionTag());
    console.log();
    console.log(guidance);
    console.log();
    const action = await selectPrompt({
      message: 'If you have installed the prerequisites',
      options: [
        {
          value: 'check-again' as const,
          label: `${renderActionText('Check again')}${dim(' (Enter to re-check again)')}`,
        },
      ],
      initialValue: 'check-again',
      loop: false,
      navigationHelp: 'exit',
    });
    handleCancel(action, 'exit');

    if ((action as SystemPrerequisiteAction) === 'check-again') {
      continue;
    }
  }
}

async function ensureNonInteractiveCreateTarget(options: ScaffoldOptions): Promise<void> {
  if (options.dryRun) {
    return;
  }

  const state = await inspectEnvironmentTarget(options.target);
  if (state.kind === 'missing_target') {
    return;
  }

  if (state.kind === 'existing_environment') {
    throw new Error(
      [
        `Target already contains a WPMoo environment: ${options.target}`,
        'Run `wpmoo reset` to refresh it, or choose another --target.',
      ].join('\n'),
    );
  }

  throw new Error(renderForeignEnvironmentTargetWarning(state));
}

async function finishCreateFlow(
  result: CreateFlowResult,
  cwd: string,
  interactive: boolean,
  checkSystemPrerequisites = true,
): Promise<void> {
  if (result.kind === 'cancelled') {
    outroPrompt('Create flow cancelled.');
    return;
  }

  if (result.kind === 'updated') {
    outroPrompt(`Updated existing Odoo dev overlay in ${result.target}.`);
    return;
  }

  if (result.kind === 'deleted') {
    outroPrompt(`Deleted Odoo dev overlay in ${result.target}.`);
    return;
  }

  const { options } = result;
  if (!options.dryRun && checkSystemPrerequisites && !(await ensureSystemPrerequisites(interactive))) {
    return;
  }
  await ensureGitHubRepositories(options, interactive);
  const scaffoldResult = await scaffold(options);

  if (options.dryRun) {
    console.log('Dry run: planned files');
    for (const file of scaffoldResult.plannedFiles) console.log(`- ${file}`);
    console.log('Dry run: planned commands');
    for (const command of scaffoldResult.plannedCommands) console.log(`- ${command}`);
    return;
  }

  notePrompt(renderPostCreateGuidance(options.target, cwd), 'Next steps', { indent: false });
  if (interactive) {
    const shouldOpenCockpit = await confirmPrompt({
      message: 'Open the local WPMoo cockpit now?',
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });
    if (shouldOpenCockpit === true) {
      await runLocalCockpit(options.target);
      return;
    }
  }
  outroPrompt(`Created Odoo dev overlay in ${options.target}. Review staged changes, then commit.`);
}

function selectedModuleRemovalOptions(
  module: ListedModule,
  cwd: string,
  deleteFiles: boolean,
): RemoveModuleOptions {
  return {
    target: cwd,
    repoPath: module.repoPath,
    sourceType: module.sourceType,
    moduleName: module.moduleName,
    deleteFiles,
    stage: true,
  };
}

function moduleDailyAction(action: ModuleActionId): DailyActionCommand | undefined {
  if (action === 'update') return 'update';
  if (action === 'test') return 'test';
  if (action === 'lint') return 'lint';
  return undefined;
}

function moduleDailyActionArgs(action: ModuleActionId, module: ListedModule): string[] {
  if (action === 'update' || action === 'test') {
    return [module.moduleName];
  }

  return [];
}

function moduleActionTitle(action: ModuleActionId): string {
  if (action === 'update') return 'Update module';
  if (action === 'test') return 'Test module';
  if (action === 'lint') return 'Run environment lint';
  if (action === 'delete') return 'Delete module';
  return 'Module action';
}

function moduleActionCompletedLabel(action: ModuleActionId): string {
  if (action === 'update') return 'Update';
  if (action === 'test') return 'Test';
  if (action === 'lint') return 'Environment lint';
  return 'Action';
}

function commandActionTitle(command: DailyActionCommand): string {
  if (command === 'update') return 'Update module';
  if (command === 'test') return 'Test module';
  if (command === 'lint') return 'Run environment lint';
  if (command === 'pot') return 'Generate POT';
  return command;
}

function commandCompletedLabel(command: DailyActionCommand): string {
  if (command === 'install') return 'Install';
  if (command === 'update') return 'Update';
  if (command === 'test') return 'Test';
  if (command === 'lint') return 'Environment lint';
  if (command === 'pot') return 'Generate POT';
  return command;
}

function shouldReturnToDailySelection(command: DailyActionCommand): boolean {
  return ['install', 'update', 'test', 'lint', 'pot'].includes(command);
}

function shouldUseModuleBrowserForDailySelection(command: DailyActionCommand): boolean {
  return ['update', 'test', 'pot'].includes(command);
}

function dailyActionSelectedLabel(command: DailyActionCommand, argv: readonly string[]): string | undefined {
  if (['install', 'update', 'test', 'pot'].includes(command)) {
    return argv[0];
  }

  return undefined;
}

function dailyActionModuleArgIndex(command: DailyActionCommand): number | undefined {
  return ['install', 'update', 'test', 'pot'].includes(command) ? 0 : undefined;
}

function moduleTargetLabel(module: ListedModule): string {
  return `${module.moduleName} (${module.sourceType}/${module.repoPath})`;
}

function moduleTargetResolutionError(resolution: Exclude<ModuleTargetResolution, { kind: 'exact' }>): Error {
  const candidates = resolution.candidates.map(moduleTargetLabel).join(', ');
  if (resolution.kind === 'ambiguous') {
    return new Error(`Ambiguous module target "${resolution.query}": ${candidates}.`);
  }

  return new Error(
    candidates
      ? `No module matches "${resolution.query}". Did you mean: ${candidates}?`
      : `No module matches "${resolution.query}".`,
  );
}

async function resolveDailyActionModuleTargets(
  command: DailyActionCommand,
  argv: readonly string[],
  cwd: string,
): Promise<string[]> {
  const moduleArgIndex = dailyActionModuleArgIndex(command);
  if (moduleArgIndex === undefined) {
    return [...argv];
  }

  const moduleArg = argv[moduleArgIndex];
  if (!moduleArg || moduleArg.startsWith('-')) {
    return [...argv];
  }

  const modules = await listModulesInEnvironment(cwd);
  if (modules.length === 0) {
    return [...argv];
  }

  const resolvedModuleNames = moduleArg.split(',').map((query) => {
    const trimmedQuery = query.trim();
    const resolution = resolveModuleTarget(trimmedQuery, modules);
    if (resolution.kind !== 'exact') {
      throw moduleTargetResolutionError(resolution);
    }
    return resolution.module.moduleName;
  });

  const resolvedArgv = [...argv];
  resolvedArgv[moduleArgIndex] = resolvedModuleNames.join(',');
  return resolvedArgv;
}

async function selectDatabaseArg(
  cwd: string,
  message: string,
  fallback: string,
  options: DatabaseListOptions = {},
): Promise<string> {
  const databaseResult = normalizeDatabaseListResult(await listEnvironmentDatabases(cwd, options));
  const databases: string[] = databaseResult.databases;
  if (databases.length > 0) {
    const selected = await selectPrompt<string>({
      message: menuPromptMessage(message, 'back'),
      options: [
        ...databases.map((database) => ({ value: database, label: database })),
        { value: manualDatabaseValue, label: 'Manual entry' },
      ],
      initialValue: databases.includes(fallback) ? fallback : databases[0],
    });
    handleCancel(selected, 'back');

    if (selected !== manualDatabaseValue) {
      return String(selected);
    }
  }

  return asString(
    await textPrompt({
      message: menuPromptMessage(
        databaseResult.ok ? message : `${message} (database list unavailable; enter manually)`,
        'back',
      ),
      defaultValue: fallback,
      placeholder: fallback,
    }),
    fallback,
    'back',
  );
}

async function collectCockpitModuleDailyActionArgs(
  command: DailyActionCommand,
  module: ListedModule,
  cwd: string,
): Promise<string[]> {
  const moduleName = module.moduleName;

  if (command === 'update') {
    return [moduleName];
  }

  if (command === 'test') {
    return [moduleName];
  }

  if (command === 'lint') {
    return [];
  }

  if (command === 'pot') {
    return [moduleName];
  }

  throw new Error(`Unsupported module action command: ${command}`);
}

async function renderDailyActionResultPageHeader(title: string, selectedLabel: string | undefined, cwd: string): Promise<void> {
  await renderCockpitSubmenuPage(title, cwd);
  if (selectedLabel) {
    console.log(renderActionText(selectedLabel));
    console.log('');
  }
}

async function renderCockpitSubmenuPage(title: string, cwd: string): Promise<void> {
  const status = await getEnvironmentStatus(cwd);
  const serviceStatus = await getServiceRuntimeStatus(cwd, status);

  clearCockpitScreen();
  console.log(renderBanner(renderCockpitStatusLines(status, serviceStatus, `Last: ${title}`), { version: startupVersionLine() }));
  console.log();
  introPrompt(title);
}

type CockpitResultSelection = CockpitResultActionValue | false;

function dailyActionRerunLabel(command: DailyActionCommand): string | undefined {
  if (command === 'test') return 'Run tests again';
  if (command === 'lint') return 'Run environment lint again';
  return undefined;
}

async function waitForCockpitResultSelection(rerunLabel?: string): Promise<CockpitResultSelection> {
  console.log(renderBackHelp());
  if (!process.stdin.isTTY) {
    return false;
  }

  const options = cockpitResultActionOptions(rerunLabel);
  try {
    const selected = await selectPrompt<CockpitResultActionValue>({
      message: 'Result',
      options,
      initialValue: 'back',
      pageSize: options.length,
      hideMessage: true,
      navigationHelp: 'back',
    });
    if (isPromptCancel(selected)) {
      handleCancel(selected, 'back');
    }
    return selected as CockpitResultActionValue;
  } catch (error) {
    if (isMenuBackSignal(error)) {
      return 'back';
    }
    throw error;
  }
}

async function waitForModuleActionBack(): Promise<boolean> {
  return (await waitForCockpitResultSelection()) === 'back';
}

function installEscAbortController(controller: AbortController): () => void {
  if (!process.stdin.isTTY) {
    return () => undefined;
  }

  emitKeypressEvents(process.stdin);
  const input = process.stdin;
  const wasRaw = input.isRaw;
  const listener = (_value: string, key: { ctrl?: boolean; name?: string; sequence?: string }) => {
    if (key.ctrl && key.name === 'c') {
      process.exit(1);
    }
    if (key.name === 'escape' || key.sequence === '\u001B') {
      controller.abort();
    }
  };

  if (typeof input.setRawMode === 'function') {
    input.setRawMode(true);
  }
  input.resume();
  input.on('keypress', listener);
  return () => {
    input.off('keypress', listener);
    if (typeof input.setRawMode === 'function') {
      input.setRawMode(Boolean(wasRaw));
    }
    input.pause();
  };
}

async function runEscBackDailyActionResultPage(
  command: DailyActionCommand,
  argv: string[],
  cwd: string,
  title = commandActionTitle(command),
  selectedLabel = dailyActionSelectedLabel(command, argv),
  completedLabel = commandCompletedLabel(command),
): Promise<boolean> {
  await renderDailyActionResultPageHeader(title, selectedLabel, cwd);
  console.log(renderBackHelp());
  const controller = new AbortController();
  const cleanup = installEscAbortController(controller);
  try {
    await runDailyActionWithStyledOutput(command, argv, cwd, (chunk) => process.stdout.write(chunk), {
      signal: controller.signal,
      treatAbortAsSuccess: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notePrompt(message, 'Error');
    await waitForModuleActionBack();
    throw error;
  } finally {
    cleanup();
  }

  if (controller.signal.aborted) {
    return true;
  }

  notePrompt(renderCompletedText(completedLabel), 'Done');
  return waitForModuleActionBack();
}

async function showCockpitResultPage(
  title: string,
  cwd: string,
  output: string,
  noteTitle: string | false = title,
  options: { rerunLabel?: string } = {},
): Promise<CockpitResultSelection> {
  await renderCockpitSubmenuPage(title, cwd);
  if (noteTitle === false) {
    notePrompt(output, title, { indent: false, showTitle: false });
  } else {
    notePrompt(output, noteTitle, { indent: false });
  }
  return waitForCockpitResultSelection(options.rerunLabel);
}

async function runDailyActionResultPage(
  command: DailyActionCommand,
  argv: string[],
  cwd: string,
  title = commandActionTitle(command),
  selectedLabel = dailyActionSelectedLabel(command, argv),
  completedLabel = commandCompletedLabel(command),
): Promise<boolean> {
  const rerunLabel = dailyActionRerunLabel(command);

  while (true) {
    await renderDailyActionResultPageHeader(title, selectedLabel, cwd);
    try {
      await runDailyActionWithStyledOutput(command, argv, cwd);
      notePrompt(renderCompletedText(completedLabel), 'Done');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notePrompt(message, 'Error');
      const selection = await waitForCockpitResultSelection(rerunLabel);
      if (selection === 'rerun') {
        continue;
      }
      throw error;
    }

    const selection = await waitForCockpitResultSelection(rerunLabel);
    if (selection === 'rerun') {
      continue;
    }

    return selection === 'back';
  }
}

async function runSelectedModuleDailyAction(action: ModuleActionId, module: ListedModule, cwd: string): Promise<boolean> {
  const command = moduleDailyAction(action);
  if (!command) {
    return false;
  }

  return runDailyActionResultPage(
    command,
    moduleDailyActionArgs(action, module),
    cwd,
    moduleActionTitle(action),
    action === 'lint' ? undefined : module.moduleName,
    moduleActionCompletedLabel(action),
  );
}

async function runSelectedModuleAction(action: ModuleActionId, module: ListedModule, cwd: string): Promise<boolean> {
  if (action === 'delete') {
    const deleteFiles = await confirmPrompt({
      message: menuPromptMessage('Delete module files too?', 'back'),
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });
    handleCancel(deleteFiles, 'back');

    const removeCommand = cockpitCommands.find((entry) => entry.id === 'remove-module');
    if (removeCommand && !(await confirmCockpitCommandRisk(removeCommand))) {
      notePrompt(`Module ${module.moduleName} was not removed.`, 'Action skipped');
      return false;
    }

    await removeModuleFromSourceRepo(selectedModuleRemovalOptions(module, cwd, Boolean(deleteFiles)));
    notePrompt(`Removed module ${module.moduleName} from source repo ${module.repoPath}.`, 'Done');
    return false;
  }

  return runSelectedModuleDailyAction(action, module, cwd);
}

async function runCockpitModuleDailyCommand(command: CockpitCommand, cwd: string): Promise<void> {
  if (command.target.kind !== 'daily') {
    return;
  }

  const dailyCommand = command.target.command;
  while (true) {
    let selectedModule: ListedModule;
    let argv: string[];
    try {
      await renderCockpitSubmenuPage(command.label, cwd);
      const module = await selectModuleFromBrowser(cwd);
      if (!module) {
        notePrompt(
          'No Odoo modules found.\nNext: choose "Add module" or "Add source repo" first.',
          command.label,
        );
        return;
      }
      selectedModule = module;
      argv = await collectCockpitModuleDailyActionArgs(dailyCommand, selectedModule, cwd);
    } catch (error) {
      if (isMenuBackSignal(error)) {
        return;
      }
      throw error;
    }

    if (!(await confirmCockpitCommandRisk(command))) {
      notePrompt(`${command.slashAlias} was not run.`, 'Action skipped');
      return;
    }

    const returnedByBack = await runDailyActionResultPage(
      dailyCommand,
      argv,
      cwd,
      command.label,
      selectedModule.moduleName,
      commandCompletedLabel(dailyCommand),
    );
    if (!returnedByBack) {
      return;
    }
  }
}

async function runCockpitDailyCommand(command: CockpitCommand, cwd: string): Promise<void> {
  if (command.target.kind !== 'daily') {
    return;
  }

  const dailyCommand = command.target.command;
  if (shouldUseModuleBrowserForDailySelection(dailyCommand)) {
    await runCockpitModuleDailyCommand(command, cwd);
    return;
  }

  if (dailyCommand === 'logs') {
    const argv = await collectDailyActionArgs(dailyCommand, cwd);
    if (!(await confirmCockpitCommandRisk(command))) {
      notePrompt(`${command.slashAlias} was not run.`, 'Action skipped');
      return;
    }

    await runEscBackDailyActionResultPage(dailyCommand, argv, cwd, command.label);
    return;
  }

  if (!shouldReturnToDailySelection(dailyCommand)) {
    const argv = await collectDailyActionArgs(dailyCommand, cwd);
    if (!(await confirmCockpitCommandRisk(command))) {
      notePrompt(`${command.slashAlias} was not run.`, 'Action skipped');
      return;
    }

    await runDailyAction(dailyCommand, argv, cwd);
    notePrompt(`${command.slashAlias} completed.`, 'Done');
    return;
  }

  while (true) {
    let argv: string[];
    try {
      if (dailyCommand !== 'lint') {
        await renderCockpitSubmenuPage(command.label, cwd);
      }
      argv = await collectDailyActionArgs(dailyCommand, cwd);
    } catch (error) {
      if (isMenuBackSignal(error)) {
        return;
      }
      throw error;
    }

    if (!(await confirmCockpitCommandRisk(command))) {
      notePrompt(`${command.slashAlias} was not run.`, 'Action skipped');
      return;
    }

    const returnedByBack = await runDailyActionResultPage(dailyCommand, argv, cwd, command.label);
    if (!returnedByBack || dailyCommand === 'lint') {
      return;
    }
  }
}

async function runListModulesCommand(cwd: string): Promise<void> {
  while (true) {
    await renderCockpitSubmenuPage('List modules', cwd);
    const selectedModule = await selectModuleFromBrowser(cwd);
    if (!selectedModule) {
      notePrompt(
        'No Odoo modules found.\nNext: choose "Add module" or "Add source repo" first.',
        'List modules',
      );
      return;
    }

    while (true) {
      let moduleAction: ModuleActionId | undefined;
      try {
        await renderCockpitSubmenuPage('List modules', cwd);
        console.log(renderActionText(selectedModule.moduleName));
        console.log('');
        moduleAction = await selectModuleAction(selectedModule);
      } catch (error) {
        if (isMenuBackSignal(error)) {
          break;
        }
        throw error;
      }

      if (!moduleAction) {
        break;
      }

      const returnedByBack = await runSelectedModuleAction(moduleAction, selectedModule, cwd);
      if (!returnedByBack) {
        return;
      }
    }
  }
}

async function runCockpitCommand(command: CockpitCommand, cwd: string): Promise<'continue' | 'exit'> {
  if (command.id === 'exit') {
    return 'exit';
  }

  if (command.target.kind === 'daily') {
    await runCockpitDailyCommand(command, cwd);
    return 'continue';
  }

  if (command.id === 'status') {
    await showCockpitResultPage(
      'Environment status',
      cwd,
      renderCockpitEnvironmentStatusResult(await getEnvironmentStatus(cwd)),
      false,
    );
    return 'continue';
  }

  if (command.id === 'doctor') {
    while (true) {
      const selection = await showCockpitResultPage(
        'Run doctor',
        cwd,
        renderCockpitDoctorResult(await getDoctorReport(cwd)),
        'Doctor',
        { rerunLabel: 'Run doctor again' },
      );
      if (selection !== 'rerun') {
        break;
      }
    }
    return 'continue';
  }

  if (command.id === 'list-modules') {
    await runListModulesCommand(cwd);
    return 'continue';
  }

  if (command.id === 'add-repo') {
    const options = await addRepoOptionsFromPrompts(false, 'back');
    await ensureAddRepoGitHubRepository(options, 'back');
    await addModuleRepo(options);
    notePrompt(`Added source repo under ${renderedSourceRepoPath(options.target, options.sourceType ?? 'private')}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'remove-repo') {
    const options = await removeRepoOptionsFromPrompts([], false, 'back');
    if (!(await confirmCockpitCommandRisk(command))) {
      notePrompt(`Source repo ${options.repoPath} was not removed.`, 'Action skipped');
      return 'continue';
    }

    await removeModuleRepo(options);
    notePrompt(`Removed source repo ${options.repoPath} from ${options.target}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'add-module') {
    const options = await addModuleOptionsFromPrompts(false, 'back');
    await addModuleToSourceRepo(options);
    notePrompt(`Added module ${options.moduleName} under source repo ${options.repoPath}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'remove-module') {
    const options = await removeModuleOptionsFromPrompts(true, 'back');
    if (!(await confirmCockpitCommandRisk(command))) {
      notePrompt(`Module ${options.moduleName} was not removed.`, 'Action skipped');
      return 'continue';
    }

    await removeModuleFromSourceRepo(options);
    notePrompt(`Removed module ${options.moduleName} from source repo ${options.repoPath}.`, 'Done');
    return 'continue';
  }

  if (command.id === 'safe-reset') {
    const options = { target: cwd, stage: true };
    await confirmSafeResetFromMenu(options);
    await safeResetEnvironment(options);
    notePrompt(`Safe reset refreshed generated environment files in ${cwd}.`, 'Done');
    return 'continue';
  }

  notePrompt(`Unknown cockpit command: ${command.slashAlias}`, 'No action');
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
    const detection = await detectDevelopmentEnvironment(cwd);

    if (!detection.isEnvironment) {
      await showStartup(argv, skipUpdateCheck);
      if (!(await ensureSystemPrerequisites(true))) {
        return;
      }
      await finishCreateFlow(await optionsFromPrompts(), cwd, true, false);
      return;
    }

    const restoreCockpitScreen = enterCockpitScreen();
    try {
      let lastStatus = 'Last: Ready';
      let status = await getEnvironmentStatus(cwd);
      let serviceStatus = await getServiceRuntimeStatus(cwd, status);
      await showStartup(argv, skipUpdateCheck, () => renderCockpitStatusLines(status, serviceStatus, lastStatus));
      const renderCockpitMenuShell = () => {
        clearCockpitScreen();
        console.log(renderBanner(renderCockpitStatusLines(status, serviceStatus, lastStatus), { version: startupVersionLine() }));
        console.log();
      };
      while (true) {
        try {
          const menuModuleCount = status.kind === 'environment' ? status.moduleCandidateCount : undefined;
          const menuSourceRepoCount = status.kind === 'environment' ? status.sourceRepoCount : undefined;
          const menuSnapshotCount = status.kind === 'environment' ? findDatabaseSnapshots(cwd).snapshots.length : undefined;
          const menuServiceStatus = legacyCockpitServiceStatus(serviceStatus);
          const command = await selectCockpitCommandFromMenu(
            serviceStatus,
            menuModuleCount,
            menuSourceRepoCount,
            menuSnapshotCount,
          );

          if (command === 'exit') {
            return;
          }

          const originalDisabledReason = cockpitCommandDisabledReason(
            command,
            menuServiceStatus,
            menuModuleCount,
            menuSourceRepoCount,
            menuSnapshotCount,
          );
          status = await getEnvironmentStatus(cwd);
          serviceStatus = await getServiceRuntimeStatus(cwd, status);
          const refreshedModuleCount = status.kind === 'environment' ? status.moduleCandidateCount : undefined;
          const refreshedSourceRepoCount = status.kind === 'environment' ? status.sourceRepoCount : undefined;
          const refreshedSnapshotCount = status.kind === 'environment' ? findDatabaseSnapshots(cwd).snapshots.length : undefined;
          const refreshedDisabledReason = cockpitCommandDisabledReason(
            command,
            legacyCockpitServiceStatus(serviceStatus),
            refreshedModuleCount,
            refreshedSourceRepoCount,
            refreshedSnapshotCount,
          );
          if (refreshedDisabledReason && refreshedDisabledReason !== originalDisabledReason) {
            await showCockpitResultPage('Action unavailable', cwd, renderDisabledActionAlert(refreshedDisabledReason));
            lastStatus = `Last: ${command.label} unavailable`;
            renderCockpitMenuShell();
            continue;
          }

          let outcome: 'continue' | 'exit' = 'continue';
          let commandFailed = false;
          try {
            outcome = await runCockpitCommand(command, cwd);
          } catch (error) {
            if (isMenuBackSignal(error)) {
              renderCockpitMenuShell();
              continue;
            }
            commandFailed = true;
            lastStatus = renderLastCommandError(command, error);
          }
          if (outcome === 'exit') {
            return;
          }
          if (!commandFailed) {
            lastStatus = renderLastCommandStatus(command);
          }
          status = await getEnvironmentStatus(cwd);
          serviceStatus = await getServiceRuntimeStatus(cwd, status);
          renderCockpitMenuShell();
        } catch (error) {
          if (isMenuBackSignal(error)) {
            continue;
          }
          throw error;
        }
      }
    } finally {
      restoreCockpitScreen();
    }
  }

  if (route.command === 'add-repo') {
    const options = await addRepoOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await addModuleRepo(options);
      outroPrompt(`Added source repo under ${renderedSourceRepoPath(options.target, options.sourceType ?? 'private', options.repoPath)}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await addRepoOptionsFromPrompts();
    await ensureAddRepoGitHubRepository(promptedOptions);
    await addModuleRepo(promptedOptions);
    outroPrompt(`Added source repo under ${promptedOptions.target}/odoo/custom/src/private.`);
    return;
  }

  if (route.command === 'remove-repo') {
    const options = removeRepoOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await removeModuleRepo(options);
      outroPrompt(`Removed source repo ${options.repoPath} from ${options.target}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await removeRepoOptionsFromPrompts(route.argv);
    await removeModuleRepo(promptedOptions);
    outroPrompt(`Removed source repo ${promptedOptions.repoPath} from ${promptedOptions.target}.`);
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
      outroPrompt(`Added module ${options.moduleName} under source repo ${options.repoPath}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await addModuleOptionsFromPrompts();
    await addModuleToSourceRepo(promptedOptions);
    outroPrompt(`Added module ${promptedOptions.moduleName} under source repo ${promptedOptions.repoPath}.`);
    return;
  }

  if (route.command === 'remove-module') {
    const options = removeModuleOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      const report = await removeModuleFromSourceRepo(options);
      outroPrompt(report.dryRun ? report.summary : `Removed module ${options.moduleName} from source repo ${options.repoPath}.`);
      return;
    }

    await showStartup(argv, skipUpdateCheck);
    const promptedOptions = await removeModuleOptionsFromPrompts();
    const report = await removeModuleFromSourceRepo(promptedOptions);
    outroPrompt(report.dryRun ? report.summary : `Removed module ${promptedOptions.moduleName} from source repo ${promptedOptions.repoPath}.`);
    return;
  }

  if (route.command === 'reset') {
    console.log(renderBanner());
    const options = resetCommandOptionsFromArgs(route.argv);
    if (options.dryRun) {
      console.log(renderSafeResetPreview(options.target, options.stage));
      return;
    }

    const resetOptions: SafeResetOptions = { target: options.target, stage: options.stage };
    await safeResetEnvironment(resetOptions);
    outroPrompt(`Safe reset refreshed generated environment files in ${options.target}.`);
    return;
  }

  if (route.command === 'doctor') {
    const options = doctorOptionsFromArgs(route.argv);
    const doctorOptions: DoctorCommandOptions = {};
    if (options.fix !== undefined) {
      doctorOptions.fix = options.fix;
    }
    if (options.failOnWarning !== undefined) {
      doctorOptions.failOnWarning = options.failOnWarning;
    }
    if (options.postgres !== undefined) {
      doctorOptions.postgres = options.postgres;
    }
    if (options.json) {
      if (doctorOptions.fix) {
        throw new Error(
          'doctor --json --fix is not supported; run doctor --fix for human-readable auto-fix output, then doctor --json to inspect the post-fix state.',
        );
      }
      printJson(await getDoctorReport(cwd, doctorOptions));
      return;
    }

    console.log(renderBanner());
    console.log(
      options.fix === undefined && options.failOnWarning === undefined && options.postgres === undefined
        ? await runDoctor(cwd)
        : await runDoctor(cwd, doctorOptions),
    );
    return;
  }

  if (route.command === 'status') {
    const { values } = parseArgs(route.argv);
    const keys = Object.keys(values);
    if (!keys.every((key) => key === 'json')) {
      throw new Error('Usage: wpmoo status');
    }
    if (jsonOption(values)) {
      printJson(environmentStatusJson(await getEnvironmentStatus(cwd)));
      return;
    }

    console.log(renderBanner());
    console.log(await renderEnvironmentStatusForTarget(cwd));
    return;
  }

  if (route.command === 'snapshot' && route.argv[0] === '--list') {
    const { values } = parseArgs(route.argv);
    const keys = Object.keys(values);
    if (!keys.every((key) => key === 'list' || key === 'json')) {
      throw new Error('Usage: wpmoo snapshot [--list] [db] [snapshot-name]');
    }
    if (jsonOption(values)) {
      printJson(databaseSnapshotCatalogJson(cwd));
      return;
    }

    console.log(renderBanner());
    console.log(renderDatabaseSnapshotCatalog(cwd));
    return;
  }

  if (isDailyActionCommand(route.command)) {
    console.log(renderBanner());
    await runDailyAction(route.command, await resolveDailyActionModuleTargets(route.command, route.argv, cwd), cwd);
    return;
  }

  const options = optionsFromArgs(route.argv);
  if (options) {
    console.log(renderBanner());
  } else {
    await showStartup(argv, skipUpdateCheck);
  }

  if (options) {
    await ensureNonInteractiveCreateTarget(options);
    await finishCreateFlow({ kind: 'create', options }, cwd, false);
    return;
  }

  if (!(await ensureSystemPrerequisites(true))) {
    return;
  }
  await finishCreateFlow(await optionsFromPrompts(), cwd, true, false);
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

export function formatCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || 'Unknown WPMoo Toolkit error';
}

if (isCliEntrypoint(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(formatCliErrorMessage(error));
    process.exit(1);
  });
}
