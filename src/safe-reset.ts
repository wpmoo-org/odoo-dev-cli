import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { readEnvironmentMetadata } from './environment.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import { listModuleRepos, readAddonsYaml } from './repo-actions.js';
import { generatedFiles } from './scaffold.js';
import type { ScaffoldOptions, SourceRepo } from './types.js';

export type SafeResetOptions = {
  target: string;
  stage: boolean;
};

function titleFromTarget(target: string): string {
  return basename(target).replace(/_dev$/, '') || 'odoo_sample_module';
}

function parseAddonsForRepo(addonsYaml: string, repoPath: string): string[] {
  const lines = addonsYaml.split('\n');
  const header = `private/${repoPath}:`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return [repoPath];

  const addons: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(' ')) break;
    const match = line.trim().match(/^-\s+(.+)$/);
    if (match) addons.push(match[1].trim());
  }

  return addons.length ? addons : [repoPath];
}

function parseRepoPathsFromAddonsYaml(addonsYaml: string): string[] {
  return [...addonsYaml.matchAll(/^private\/(.+):$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

async function readSubmoduleUrl(target: string, repoPath: string): Promise<string> {
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    const escapedPath = `odoo/custom/src/private/${repoPath}`;
    const sections = gitmodules.split(/\n(?=\[submodule )/);
    const section = sections.find((value) => value.includes(`path = ${escapedPath}`));
    const url = section?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
    return url || `odoo/custom/src/private/${repoPath}`;
  } catch {
    return `odoo/custom/src/private/${repoPath}`;
  }
}

async function inferOptions(target: string): Promise<ScaffoldOptions> {
  const metadata = await readEnvironmentMetadata(target);
  const addonsYaml = await readAddonsYaml(target);
  const moduleRepos = await listModuleRepos(target);
  const addonRepos = parseRepoPathsFromAddonsYaml(addonsYaml);
  const repoPaths = metadata?.sourceRepos.map((repo) => repo.path) ?? (moduleRepos.length ? moduleRepos : addonRepos);
  const product = metadata?.product ?? repoPaths[0] ?? titleFromTarget(target);
  const sourceRepos: SourceRepo[] = await Promise.all(
    repoPaths.map(async (repoPath) => ({
      path: repoPath,
      url: metadata?.sourceRepos.find((repo) => repo.path === repoPath)?.url ?? (await readSubmoduleUrl(target, repoPath)),
      addons:
        metadata?.sourceRepos.find((repo) => repo.path === repoPath)?.addons ?? parseAddonsForRepo(addonsYaml, repoPath),
    })),
  );

  return {
    product,
    odooVersion: metadata?.odooVersion ?? '19.0',
    devRepo: metadata?.devRepo ?? basename(target),
    devRepoUrl: metadata?.devRepoUrl ?? target,
    sourceRepos,
    target,
    dryRun: false,
    initEmptyRepos: false,
    stage: false,
    skipSubmodules: true,
  };
}

export async function safeResetEnvironment(
  options: SafeResetOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const scaffoldOptions = await inferOptions(options.target);
  const files = generatedFiles(scaffoldOptions);

  for (const file of files) {
    if (file.path === 'odoo/custom/src/addons.yaml') {
      continue;
    }

    const destination = join(options.target, file.path);
    await mkdir(join(destination, '..'), { recursive: true });
    await writeFile(destination, file.content, 'utf8');
  }

  if (options.stage) {
    await stageAll(git, options.target);
  }
}
