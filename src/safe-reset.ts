import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { readEnvironmentMetadata } from './environment.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import { isValidPathSegment, validateAddonName, validateRepoPath } from './path-validation.js';
import { listModuleRepos, readAddonsYaml } from './repo-actions.js';
import { generatedFiles } from './scaffold.js';
import type { ScaffoldOptions, SourceRepo } from './types.js';

export type SafeResetOptions = {
  target: string;
  stage: boolean;
};

export function renderSafeResetPreview(target: string, stage: boolean): string {
  return [
    'Safe reset will refresh generated WPMoo environment files.',
    '',
    'Target:',
    target,
    '',
    'Will update:',
    '- .wpmoo/odoo.json',
    '- moo',
    '- .gitignore',
    '- README.md',
    '- AGENTS.md',
    '- docs/appstore-release.md',
    '- Compose generated files',
    '',
    'Will not touch:',
    '- source repo folders under odoo/custom/src/private',
    '- module source code',
    '- Git history, remotes, or branches',
    '',
    stage ? 'Generated changes will be staged with git add .' : 'Generated changes will not be staged.',
  ].join('\n');
}

function titleFromTarget(target: string): string {
  return basename(target).replace(/_dev$/, '') || 'odoo_sample_module';
}

function parseAddonsForRepo(addonsYaml: string, repoPath: string): string[] {
  const safeRepoPath = validateRepoPath(repoPath);
  const lines = addonsYaml.split('\n');
  const header = `private/${safeRepoPath}:`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return [safeRepoPath];

  const addons: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(' ')) break;
    const match = line.trim().match(/^-\s+(.+)$/);
    const addon = match?.[1]?.trim();
    if (addon && isValidPathSegment(addon)) {
      addons.push(validateAddonName(addon));
    }
  }

  return addons.length ? addons : [safeRepoPath];
}

function parseRepoPathsFromAddonsYaml(addonsYaml: string): string[] {
  return [...addonsYaml.matchAll(/^private\/(.+):$/gm)]
    .map((match) => match[1].trim())
    .filter((repoPath) => repoPath && isValidPathSegment(repoPath))
    .map(validateRepoPath);
}

async function readSubmoduleUrl(target: string, repoPath: string): Promise<string> {
  const safeRepoPath = validateRepoPath(repoPath);
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    const escapedPath = `odoo/custom/src/private/${safeRepoPath}`;
    const sections = gitmodules.split(/\n(?=\[submodule )/);
    const section = sections.find((value) => value.includes(`path = ${escapedPath}`));
    const url = section?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
    return url || `odoo/custom/src/private/${safeRepoPath}`;
  } catch {
    return `odoo/custom/src/private/${safeRepoPath}`;
  }
}

async function inferOptions(target: string): Promise<ScaffoldOptions> {
  const metadata = await readEnvironmentMetadata(target);
  const addonsYaml = await readAddonsYaml(target);
  const moduleRepos = await listModuleRepos(target);
  const addonRepos = parseRepoPathsFromAddonsYaml(addonsYaml);
  const metadataRepoPaths =
    metadata?.sourceRepos.map((repo) => repo.path).filter((repoPath) => isValidPathSegment(repoPath)).map(validateRepoPath) ??
    [];
  const repoPaths = [
    ...new Set([...metadataRepoPaths, ...moduleRepos, ...addonRepos]),
  ];
  const product = metadata?.product ?? repoPaths[0] ?? titleFromTarget(target);
  const sourceRepos: SourceRepo[] = await Promise.all(
    repoPaths.map(async (repoPath) => ({
      path: repoPath,
      url: metadata?.sourceRepos.find((repo) => repo.path === repoPath)?.url ?? (await readSubmoduleUrl(target, repoPath)),
      addons: parseAddonsForRepo(addonsYaml, repoPath),
    })),
  );

  return {
    product,
    odooVersion: metadata?.odooVersion ?? '19.0',
    devRepo: metadata?.devRepo ?? basename(target),
    devRepoUrl: metadata?.devRepoUrl ?? target,
    sourceRepos,
    engine: 'compose',
    composeTemplateUrl: metadata?.composeTemplateUrl,
    composeTemplateRef: metadata?.composeTemplateRef,
    agentSkillsTemplateUrl: metadata?.agentSkillsTemplateUrl,
    agentSkillsTemplateRef: metadata?.agentSkillsTemplateRef,
    postgresVersion: metadata?.postgresVersion,
    httpPort: metadata?.httpPort,
    geventPort: metadata?.geventPort,
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
    if (file.mode !== undefined) {
      await chmod(destination, file.mode);
    }
  }

  if (options.stage) {
    await stageAll(git, options.target);
  }
}
