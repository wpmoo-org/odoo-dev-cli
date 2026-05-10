import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { addSourceRepoToAddonsYaml, removeSourceRepoFromAddonsYaml } from './addons-yaml.js';
import {
  ensureRemoteHasBranch,
  ensureSubmodule,
  hasUncommittedChanges,
  realGit,
  removeSubmodule,
  stageAll,
  type GitRunner,
} from './git.js';
import { inferRepoPath } from './repo-url.js';

const addonsYamlHeader = `# Addons activated from source submodules.
#
# Source repos are managed as Git submodules under odoo/custom/src/private.
# Do not duplicate these same repos in repos.yaml.
`;

export type AddModuleRepoOptions = {
  target: string;
  repoUrl: string;
  repoPath?: string;
  odooVersion: string;
  initEmptyRepos: boolean;
  stage: boolean;
};

export type RemoveModuleRepoOptions = {
  target: string;
  repoPath: string;
  stage: boolean;
};

function privateSubmodulePath(repoPath: string): string {
  return `odoo/custom/src/private/${repoPath}`;
}

async function readAddonsYaml(target: string): Promise<string> {
  try {
    return await readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8');
  } catch {
    return `${addonsYamlHeader}\n`;
  }
}

async function writeAddonsYaml(target: string, content: string): Promise<void> {
  const path = join(target, 'odoo/custom/src/addons.yaml');
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

export async function addModuleRepo(
  options: AddModuleRepoOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const repoPath = options.repoPath?.trim() || inferRepoPath(options.repoUrl);
  const submodulePath = privateSubmodulePath(repoPath);

  await ensureRemoteHasBranch(git, options.target, options.repoUrl, options.odooVersion, options.initEmptyRepos);
  await mkdir(join(options.target, 'odoo/custom/src/private'), { recursive: true });
  await ensureSubmodule(git, options.target, options.repoUrl, options.odooVersion, submodulePath);

  const addonsYaml = await readAddonsYaml(options.target);
  await writeAddonsYaml(
    options.target,
    addSourceRepoToAddonsYaml(addonsYaml, {
      path: repoPath,
      addons: [repoPath],
    }),
  );

  if (options.stage) {
    await stageAll(git, options.target);
  }
}

export async function listModuleRepos(target: string): Promise<string[]> {
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    return [...gitmodules.matchAll(/^\s*path\s*=\s*odoo\/custom\/src\/private\/(.+)$/gm)]
      .map((match) => match[1].trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

export async function removeModuleRepo(
  options: RemoveModuleRepoOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const submodulePath = privateSubmodulePath(options.repoPath);
  const fullSubmodulePath = join(options.target, submodulePath);

  if (await hasUncommittedChanges(git, fullSubmodulePath)) {
    throw new Error(`Cannot remove ${options.repoPath}: submodule has uncommitted changes.`);
  }

  await removeSubmodule(git, options.target, submodulePath);

  const addonsYaml = await readAddonsYaml(options.target);
  await writeAddonsYaml(options.target, removeSourceRepoFromAddonsYaml(addonsYaml, options.repoPath));

  if (options.stage) {
    await stageAll(git, options.target);
  }
}
