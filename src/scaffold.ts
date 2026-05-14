import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { applyExternalAsset, renderExternalAssetCommand, writeTextFile } from './external-assets.js';
import { markerPath, renderEnvironmentMetadata } from './environment.js';
import { plannedExternalAssetOptions, renderComposeEnvExample } from './external-templates.js';
import {
  cloneRepository,
  ensureSubmodule,
  ensureRemoteHasBranch,
  realGit,
  stageAll,
  syncSubmodules,
  type GitRunner,
} from './git.js';
import {
  renderAgents,
  renderAppstoreRelease,
  renderGitignore,
  renderMooDelegationScript,
  renderPlaceholder,
  renderReadme,
} from './templates.js';
import { validateAddonName, validateRepoPath } from './path-validation.js';
import type { ScaffoldOptions, ScaffoldResult, SourceRepo } from './types.js';

type GeneratedFile = {
  path: string;
  content: string;
  mode?: number;
};

function validateSourceRepo(repo: SourceRepo): SourceRepo {
  const path = validateRepoPath(repo.path);
  return {
    ...repo,
    path,
    addons: repo.addons.map(validateAddonName),
  };
}

function validateScaffoldOptions(options: ScaffoldOptions): ScaffoldOptions {
  return {
    ...options,
    sourceRepos: options.sourceRepos.map(validateSourceRepo),
  };
}

export function generatedFiles(options: ScaffoldOptions): GeneratedFile[] {
  const safeOptions = validateScaffoldOptions(options);
  const files: GeneratedFile[] = [
    { path: markerPath, content: renderEnvironmentMetadata(safeOptions) },
    { path: 'moo', content: renderMooDelegationScript(), mode: 0o755 },
    { path: '.gitignore', content: renderGitignore() },
    { path: 'README.md', content: renderReadme(safeOptions) },
    { path: 'AGENTS.md', content: renderAgents(safeOptions) },
    { path: 'docs/appstore-release.md', content: renderAppstoreRelease(safeOptions) },
  ];

  return [
    ...files,
    {
      path: 'odoo/custom/src/private/README.md',
      content: renderPlaceholder('private', 'WPMoo source repositories are added here as Git submodules.'),
    },
  ];
}

async function writeGeneratedFiles(target: string, files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const destination = join(target, file.path);
    await mkdir(join(destination, '..'), { recursive: true });
    await writeFile(destination, file.content, 'utf8');
    if (file.mode !== undefined) {
      await chmod(destination, file.mode);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepository(git: GitRunner, target: string): Promise<boolean> {
  if (!(await pathExists(target))) {
    return false;
  }

  try {
    const result = await git.run(target, ['rev-parse', '--is-inside-work-tree']);
    return result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function prepareTargetRepository(options: ScaffoldOptions, git: GitRunner): Promise<void> {
  if (await isGitRepository(git, options.target)) {
    return;
  }

  if (await pathExists(options.target)) {
    throw new Error(
      `Target exists but is not a Git repository: ${options.target}\n` +
        'Clone the dev environment repository first, or remove the directory and run the CLI again.',
    );
  }

  await mkdir(dirname(options.target), { recursive: true });
  await cloneRepository(git, dirname(options.target), options.devRepoUrl, options.target);
}

export async function scaffold(
  options: ScaffoldOptions,
  git: GitRunner = realGit,
): Promise<ScaffoldResult> {
  const safeOptions = validateScaffoldOptions(options);
  const files = generatedFiles(safeOptions);
  const externalAssets = plannedExternalAssetOptions(safeOptions);
  const plannedCommands = [
    ...externalAssets.map((assetOptions) => renderExternalAssetCommand(assetOptions)),
    ...safeOptions.sourceRepos.map(
      (repo) =>
        `git submodule add -b ${safeOptions.odooVersion} ${repo.url} odoo/custom/src/private/${repo.path}`,
    ),
  ];
  if (safeOptions.stage) {
    plannedCommands.push('git add .');
  }

  if (safeOptions.dryRun) {
    return {
      plannedFiles: files.map((file) => file.path),
      plannedCommands,
    };
  }

  if (!safeOptions.skipSubmodules || safeOptions.stage) {
    await prepareTargetRepository(safeOptions, git);
  }
  await writeGeneratedFiles(safeOptions.target, files);

  for (const assetOptions of externalAssets) {
    await applyExternalAsset(assetOptions, git);
  }
  await writeTextFile(join(safeOptions.target, '.env.example'), renderComposeEnvExample(safeOptions));

  if (!safeOptions.skipSubmodules) {
    for (const repo of safeOptions.sourceRepos) {
      await ensureRemoteHasBranch(git, safeOptions.target, repo.url, safeOptions.odooVersion, safeOptions.initEmptyRepos);
    }
    await mkdir(join(safeOptions.target, 'odoo/custom/src/private'), { recursive: true });
    for (const repo of safeOptions.sourceRepos) {
      await ensureSubmodule(git, safeOptions.target, repo.url, safeOptions.odooVersion, `odoo/custom/src/private/${repo.path}`);
    }
    await syncSubmodules(git, safeOptions.target);
  }

  if (safeOptions.stage) {
    await stageAll(git, safeOptions.target);
  }

  return {
    plannedFiles: files.map((file) => file.path),
    plannedCommands,
  };
}
