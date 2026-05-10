#!/usr/bin/env node
import { confirm, intro, isCancel, note, outro, select, text } from '@clack/prompts';
import { resolve } from 'node:path';

import { commandFromArgs, defaultTargetForProduct, isHelpRequested, isVersionRequested, optionsFromArgs, parseArgs } from './args.js';
import { getOriginUrl, realGit } from './git.js';
import { renderHelp } from './help.js';
import { supportedOdooVersions } from './odoo-versions.js';
import { renderRepositorySetupNote } from './prompt-copy.js';
import { promptRepositoryUrl } from './prompt-repositories.js';
import { inferGitHubOwner, inferRepoPath, normalizeRepositoryUrl } from './repo-url.js';
import { addModuleRepo, listModuleRepos, removeModuleRepo, type AddModuleRepoOptions, type RemoveModuleRepoOptions } from './repo-actions.js';
import {
  checkGitHubRepositories,
  createGitHubRepositories,
  manualCreateCommands,
  repositoryPreflightAvailable,
} from './repository-preflight.js';
import { scaffold } from './scaffold.js';
import { renderBanner } from './templates.js';
import type { ScaffoldOptions, SourceRepo } from './types.js';
import { checkForUpdate, installLatestPackage, restartCli } from './update-check.js';
import { packageName, packageVersion, renderVersion, renderVersionTag } from './version.js';
import {
  getGitHubAccounts,
  githubRepositoryUrl,
  realGitHub,
  type GitHubAccount,
  type RepositoryVisibility,
} from './github.js';

function asString(value: unknown, fallback: string): string {
  if (isCancel(value)) {
    process.exit(1);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function githubAccountLabel(account: GitHubAccount): string {
  return account.type === 'user' ? `${account.login} (personal)` : `${account.login} (organization)`;
}

async function selectDefaultGitHubOwner(): Promise<string | undefined> {
  try {
    const accounts = await getGitHubAccounts(realGitHub);
    if (accounts.length === 0) {
      return undefined;
    }

    if (accounts.length === 1) {
      return accounts[0].login;
    }

    const selectedOwner = await select({
      message: 'GitHub account/organization',
      options: accounts.map((account) => ({
        value: account.login,
        label: githubAccountLabel(account),
      })),
      initialValue: accounts[0].login,
    });
    if (isCancel(selectedOwner)) process.exit(1);

    return String(selectedOwner);
  } catch {
    return undefined;
  }
}

function stringOption(values: Record<string, string | boolean>, key: string): string | undefined {
  const value = values[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

async function showStartup(): Promise<void> {
  console.log(renderBanner());
  const updateCheck = await checkForUpdate(packageName(), packageVersion());
  console.log(renderVersionTag(updateCheck.status === 'update-available' ? updateCheck.latestVersion : undefined));
  if (updateCheck.status === 'update-available') {
    const shouldUpdate = await confirm({
      message: `Update to v.${updateCheck.latestVersion}? (Y/n)`,
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });
    if (isCancel(shouldUpdate)) process.exit(1);
    if (shouldUpdate) {
      await installLatestPackage(packageName());
      const code = await restartCli(packageName(), process.argv.slice(2));
      process.exit(code ?? 0);
    }
  }
  console.log();
}

async function selectActionFromMenu(): Promise<'create' | 'add-repo' | 'remove-repo'> {
  intro('WPMoo Odoo Dev');
  const action = await select({
    message: 'What do you want to do?',
    options: [
      { value: 'create', label: 'Create an Odoo development environment' },
      { value: 'add-repo', label: 'Add a module repo as submodule' },
      { value: 'remove-repo', label: 'Remove a repo' },
    ],
    initialValue: 'create',
  });
  if (isCancel(action)) process.exit(1);

  return action as 'create' | 'add-repo' | 'remove-repo';
}

async function optionsFromPrompts(showIntro = true): Promise<ScaffoldOptions> {
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
  );

  const target = defaultTargetForProduct(product);
  note(renderRepositorySetupNote(product), 'Repository setup');
  const selectedGitHubOwner = await selectDefaultGitHubOwner();

  const selectedVersion = await select({
    message: 'Odoo version',
    options: supportedOdooVersions.map((version) => ({ value: version, label: version })),
    initialValue: supportedOdooVersions[0],
  });
  if (isCancel(selectedVersion)) process.exit(1);
  const odooVersion = String(selectedVersion);

  const detectedDevRepoUrl = await getOriginUrl(realGit, target);
  const defaultDevRepoUrl = selectedGitHubOwner
    ? githubRepositoryUrl(selectedGitHubOwner, `${product}_dev`)
    : undefined;
  const devRepoUrl = normalizeRepositoryUrl(
    await promptRepositoryUrl({
      label: 'Dev environment repo URL',
      suggestedUrl: detectedDevRepoUrl ?? defaultDevRepoUrl,
      placeholder: `https://github.com/your-account/${product}_dev.git`,
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
        label: repoIndex === 0 ? 'Module source repo URL' : `Additional source repo ${repoIndex + 1} URL`,
        suggestedUrl: suggestedRepo,
        placeholder: `https://github.com/owner/${repoIndex === 0 ? product : `${product}_${repoIndex + 1}`}.git`,
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
    if (isCancel(shouldAddAnother)) process.exit(1);
    addAnother = Boolean(shouldAddAnother);
  }

  const initEmpty = await select({
    message: 'Initialize repositories that exist but have no commits?',
    options: [
      { value: true, label: 'Yes, create the selected Odoo branch' },
      { value: false, label: 'No, fail with instructions' },
    ],
    initialValue: true,
  });
  if (isCancel(initEmpty)) process.exit(1);

  return {
    product,
    odooVersion,
    devRepo: inferRepoPath(devRepoUrl),
    devRepoUrl,
    sourceRepos,
    target,
    dryRun: false,
    initEmptyRepos: Boolean(initEmpty),
    stage: true,
    createMissingRepos: false,
    repoVisibility: 'private',
  };
}

function addRepoOptionsFromArgs(argv: string[]): AddModuleRepoOptions | undefined {
  const { values } = parseArgs(argv);
  const repoUrl = stringOption(values, 'repoUrl') ?? stringOption(values, 'sourceRepoUrl');
  if (!repoUrl) {
    return undefined;
  }

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    repoUrl: normalizeRepositoryUrl(repoUrl),
    repoPath: stringOption(values, 'repo') ?? stringOption(values, 'sourcePath'),
    odooVersion: stringOption(values, 'odooVersion') ?? supportedOdooVersions[0],
    initEmptyRepos: booleanOption(values, 'initEmptyRepos', false),
    stage: booleanOption(values, 'stage', true),
  };
}

async function addRepoOptionsFromPrompts(showIntro = true): Promise<AddModuleRepoOptions> {
  if (showIntro) {
    intro('Add module repo as submodule');
  }

  const selectedVersion = await select({
    message: 'Odoo version',
    options: supportedOdooVersions.map((version) => ({ value: version, label: version })),
    initialValue: supportedOdooVersions[0],
  });
  if (isCancel(selectedVersion)) process.exit(1);

  const repoUrl = normalizeRepositoryUrl(
    await promptRepositoryUrl({
      label: 'Module source repo URL',
      placeholder: 'https://github.com/example-org/odoo_sample_module.git',
    }),
  );

  const initEmpty = await select({
    message: 'Initialize repository if it exists but has no commits?',
    options: [
      { value: true, label: 'Yes, create the selected Odoo branch' },
      { value: false, label: 'No, fail with instructions' },
    ],
    initialValue: true,
  });
  if (isCancel(initEmpty)) process.exit(1);

  return {
    target: process.cwd(),
    repoUrl,
    odooVersion: String(selectedVersion),
    initEmptyRepos: Boolean(initEmpty),
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
    stage: booleanOption(values, 'stage', true),
  };
}

async function removeRepoOptionsFromPrompts(argv: string[], showIntro = true): Promise<RemoveModuleRepoOptions> {
  if (showIntro) {
    intro('Remove a repo');
  }

  const { values } = parseArgs(argv);
  const target = resolve(stringOption(values, 'target') ?? process.cwd());
  const repos = await listModuleRepos(target);
  if (repos.length === 0) {
    throw new Error(`No module submodules found under ${target}/odoo/custom/src/private`);
  }

  const repoPath = await select({
    message: 'Repo to remove',
    options: repos.map((repo) => ({ value: repo, label: repo })),
    initialValue: repos[0],
  });
  if (isCancel(repoPath)) process.exit(1);

  return {
    target,
    repoPath: String(repoPath),
    stage: true,
  };
}

async function ensureGitHubRepositories(options: ScaffoldOptions, interactive: boolean): Promise<void> {
  if (options.dryRun) {
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
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
    await showStartup();
    const action = await selectActionFromMenu();

    if (action === 'create') {
      const resolvedOptions = await optionsFromPrompts(false);
      await ensureGitHubRepositories(resolvedOptions, true);
      await scaffold(resolvedOptions);
      outro(`Created Odoo dev overlay in ${resolvedOptions.target}. Review staged changes, then commit.`);
      return;
    }

    if (action === 'add-repo') {
      const options = await addRepoOptionsFromPrompts(false);
      await addModuleRepo(options);
      outro(`Added module repo under ${options.target}/odoo/custom/src/private.`);
      return;
    }

    const options = await removeRepoOptionsFromPrompts([], false);
    await removeModuleRepo(options);
    outro(`Removed module repo ${options.repoPath} from ${options.target}.`);
    return;
  }

  if (route.command === 'add-repo') {
    const options = addRepoOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await addModuleRepo(options);
      outro(`Added module repo under ${options.target}/odoo/custom/src/private.`);
      return;
    }

    await showStartup();
    const promptedOptions = await addRepoOptionsFromPrompts();
    await addModuleRepo(promptedOptions);
    outro(`Added module repo under ${promptedOptions.target}/odoo/custom/src/private.`);
    return;
  }

  if (route.command === 'remove-repo') {
    const options = removeRepoOptionsFromArgs(route.argv);
    if (options) {
      console.log(renderBanner());
      await removeModuleRepo(options);
      outro(`Removed module repo ${options.repoPath} from ${options.target}.`);
      return;
    }

    await showStartup();
    const promptedOptions = await removeRepoOptionsFromPrompts(route.argv);
    await removeModuleRepo(promptedOptions);
    outro(`Removed module repo ${promptedOptions.repoPath} from ${promptedOptions.target}.`);
    return;
  }

  const options = optionsFromArgs(route.argv);
  if (options) {
    console.log(renderBanner());
  } else {
    await showStartup();
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

  outro(`Created Odoo dev overlay in ${resolvedOptions.target}. Review staged changes, then commit.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
