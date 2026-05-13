import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { addSourceRepoToAddonsYaml, removeSourceRepoFromAddonsYaml } from './addons-yaml.js';
import { readEnvironmentMetadata } from './environment.js';
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

export const addonsYamlHeader = `# Addons activated from source submodules.
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
  return `odoo/custom/src/private/${validateRepoPath(repoPath)}`;
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
  const submodulePath = privateSubmodulePath(repoPath);

  await ensureRemoteHasBranch(git, options.target, options.repoUrl, options.odooVersion, options.initEmptyRepos);
  await mkdir(join(options.target, 'odoo/custom/src/private'), { recursive: true });
  await ensureSubmodule(git, options.target, options.repoUrl, options.odooVersion, submodulePath);

  const listedRepos = await listModuleRepos(options.target);
  if (!listedRepos.includes(repoPath)) {
    throw new Error(`Source repo was added but is not registered in .gitmodules: ${repoPath}`);
  }

  if (!(await isComposeEnvironment(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    await writeAddonsYaml(
      options.target,
      addSourceRepoToAddonsYaml(addonsYaml, {
        path: repoPath,
        addons: [repoPath],
      }),
    );
  }
  await syncComposeOdooConfAddonsPath(options.target);

  if (options.stage) {
    await stageAll(git, options.target);
  }
}

export async function listModuleRepos(target: string): Promise<string[]> {
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    return [...gitmodules.matchAll(/^\s*path\s*=\s*odoo\/custom\/src\/private\/(.+)$/gm)]
      .map((match) => match[1].trim())
      .filter((repoPath) => repoPath && isValidPathSegment(repoPath))
      .sort();
  } catch {
    return [];
  }
}

export async function removeModuleRepo(
  options: RemoveModuleRepoOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const repoPath = validateRepoPath(options.repoPath);
  const submodulePath = privateSubmodulePath(repoPath);
  const fullSubmodulePath = join(options.target, submodulePath);

  if (await hasUncommittedChanges(git, fullSubmodulePath)) {
    throw new Error(`Cannot remove ${repoPath}: submodule has uncommitted changes.`);
  }

  await removeSubmodule(git, options.target, submodulePath);

  if (!(await isComposeEnvironment(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    await writeAddonsYaml(options.target, removeSourceRepoFromAddonsYaml(addonsYaml, repoPath));
  }
  await syncComposeOdooConfAddonsPath(options.target);

  if (options.stage) {
    await stageAll(git, options.target);
  }
}
