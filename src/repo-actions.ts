import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { addSourceRepoToAddonsYaml, removeSourceRepoFromAddonsYaml } from './addons-yaml.js';
import { readEnvironmentMetadata, removeSourceRepoMetadata, upsertSourceRepoMetadata } from './environment.js';
import {
  ensureRemoteHasBranch,
  ensureSubmodule,
  hasUncommittedChanges,
  realGit,
  removeSubmodule,
  stageAll,
  type GitRunner,
} from './git.js';
import { isValidPathSegment, validateRepoPath } from './path-validation.js';
import { inferRepoPath } from './repo-url.js';
import type { SourceRepoType } from './types.js';

export const addonsYamlHeader = `# Addons activated from source submodules.
#
# Source repos are managed as Git submodules under odoo/custom/src/private (product code).
# OCA/external source repos can be placed under odoo/custom/src/oca and odoo/custom/src/external.
# Do not duplicate these same repos in repos.yaml.
`;

const validSourceTypes: SourceRepoType[] = ['private', 'oca', 'external'];

export type AddModuleRepoOptions = {
  target: string;
  repoUrl: string;
  repoPath?: string;
  sourceType?: SourceRepoType;
  odooVersion: string;
  initEmptyRepos: boolean;
  stage: boolean;
};

export type RemoveModuleRepoOptions = {
  target: string;
  repoPath: string;
  sourceType?: SourceRepoType;
  stage: boolean;
};

function normalizeSourceType(value?: string): SourceRepoType {
  return validSourceTypes.includes(value as SourceRepoType) ? (value as SourceRepoType) : 'private';
}

function sourceSubmodulePath(sourceType: SourceRepoType, repoPath: string): string {
  return `odoo/custom/src/${sourceType}/${validateRepoPath(repoPath)}`;
}

function resolveSourceTypeFromSubmodulePath(submodulePath: string): SourceRepoType | undefined {
  const match = /^odoo\/custom\/src\/(private|oca|external)\//.exec(submodulePath);
  if (!match) return undefined;
  return match[1] as SourceRepoType;
}

async function listGitmoduleRepos(target: string): Promise<Array<{ sourceType: SourceRepoType; path: string }>> {
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    return [...gitmodules.matchAll(/^\s*path\s*=\s*odoo\/custom\/src\/(private|oca|external)\/(.+)$/gm)]
      .map((match) => ({ sourceType: match[1] as SourceRepoType, path: match[2].trim() }))
      .filter((entry) => isValidPathSegment(entry.path));
  } catch {
    return [];
  }
}

async function resolveSubmodulePathFromConfig(
  target: string,
  repoPath: string,
  sourceType?: SourceRepoType,
): Promise<string> {
  if (sourceType) {
    return sourceSubmodulePath(sourceType, validateRepoPath(repoPath));
  }

  const repoMatches = (await listGitmoduleRepos(target)).filter((repo) => repo.path === repoPath);
  if (repoMatches.length === 1) {
    return sourceSubmodulePath(repoMatches[0].sourceType, repoPath);
  }

  if (repoMatches.length > 1) {
    const sorted = repoMatches.map((repo) => repo.sourceType).sort();
    throw new Error(
      `Source repo ${repoPath} exists in multiple source directories: ${sorted.join(
        ', ',
      )}. Provide --source-type to disambiguate.`,
    );
  }

  return sourceSubmodulePath('private', repoPath);
}

export async function readAddonsYaml(target: string): Promise<string> {
  try {
    return await readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8');
  } catch {
    return `${addonsYamlHeader}\n`;
  }
}

export async function writeAddonsYaml(target: string, content: string): Promise<void> {
  const path = join(target, 'odoo/custom/src/addons.yaml');
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function composeAddonsPath(): string {
  return '/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons,/mnt/wpmoo-addons';
}

async function isComposeEnvironment(target: string): Promise<boolean> {
  const metadata = await readEnvironmentMetadata(target);
  return metadata?.engine === 'compose';
}

export async function syncComposeOdooConfAddonsPath(target: string): Promise<void> {
  if (!(await isComposeEnvironment(target))) {
    return;
  }

  const configPath = join(target, 'etc/odoo.conf');
  let content: string;
  try {
    content = await readFile(configPath, 'utf8');
  } catch {
    return;
  }

  const addonsPathLine = `addons_path = ${composeAddonsPath()}`;
  const nextContent = /^addons_path\s*=.*$/m.test(content)
    ? content.replace(/^addons_path\s*=.*$/m, addonsPathLine)
    : `${content.trimEnd()}\n${addonsPathLine}\n`;

  if (nextContent !== content) {
    await writeFile(configPath, nextContent, 'utf8');
  }
}

export async function addModuleRepo(
  options: AddModuleRepoOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const repoPath = validateRepoPath(options.repoPath?.trim() || inferRepoPath(options.repoUrl));
  const sourceType = normalizeSourceType(options.sourceType);
  const submodulePath = sourceSubmodulePath(sourceType, repoPath);

  await ensureRemoteHasBranch(git, options.target, options.repoUrl, options.odooVersion, options.initEmptyRepos);
  await mkdir(join(options.target, 'odoo/custom/src', sourceType), { recursive: true });
  await ensureSubmodule(git, options.target, options.repoUrl, options.odooVersion, submodulePath);

  const listedRepos = await listModuleRepos(options.target);
  if (!listedRepos.includes(repoPath)) {
    throw new Error(`Source repo was added but is not registered in .gitmodules: ${repoPath}`);
  }
  await upsertSourceRepoMetadata(options.target, {
    url: options.repoUrl,
    path: repoPath,
    addons: [repoPath],
    sourceType,
  });

  if (!(await isComposeEnvironment(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    if (sourceType === 'private') {
      await writeAddonsYaml(
        options.target,
        addSourceRepoToAddonsYaml(addonsYaml, {
          path: repoPath,
          addons: [repoPath],
        }),
      );
    }
  }
  await syncComposeOdooConfAddonsPath(options.target);

  if (options.stage) {
    await stageAll(git, options.target);
  }
}

export async function listModuleRepos(target: string): Promise<string[]> {
  return (await listGitmoduleRepos(target)).map((repo) => repo.path).sort();
}

export async function removeModuleRepo(
  options: RemoveModuleRepoOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const repoPath = validateRepoPath(options.repoPath);
  const sourceType = options.sourceType ? normalizeSourceType(options.sourceType) : undefined;
  const submodulePath = await resolveSubmodulePathFromConfig(options.target, repoPath, sourceType);
  const fullSubmodulePath = join(options.target, submodulePath);
  const resolvedSourceType = sourceType ?? resolveSourceTypeFromSubmodulePath(submodulePath);

  if (await hasUncommittedChanges(git, fullSubmodulePath)) {
    throw new Error(`Cannot remove ${repoPath}: submodule has uncommitted changes.`);
  }

  await removeSubmodule(git, options.target, submodulePath);
  await removeSourceRepoMetadata(options.target, repoPath, resolvedSourceType);

  if (!(await isComposeEnvironment(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    if (resolvedSourceType === 'private') {
      await writeAddonsYaml(options.target, removeSourceRepoFromAddonsYaml(addonsYaml, repoPath));
    }
  }
  await syncComposeOdooConfAddonsPath(options.target);

  if (options.stage) {
    await stageAll(git, options.target);
  }
}
