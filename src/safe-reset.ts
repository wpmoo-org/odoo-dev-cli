import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { environmentMetadata, readEnvironmentMetadata } from './environment.js';
import { applyExternalAsset, writeTextFile, type ExternalAssetOptions } from './external-assets.js';
import { plannedExternalAssetOptions, renderComposeEnvExample } from './external-templates.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import { isValidPathSegment, validateAddonName, validateRepoPath } from './path-validation.js';
import { readAddonsYaml } from './repo-actions.js';
import { generatedFiles } from './scaffold.js';
import { listGitmoduleSources } from './source-manifest.js';
import type { ScaffoldOptions, SourceRepo, SourceRepoType } from './types.js';

export type SafeResetOptions = {
  target: string;
  stage: boolean;
};

const safeResetProtectedPaths = [
  'data',
  'backups',
  '.env',
  '.gitmodules',
  'odoo/custom/src/private',
  'odoo/custom/src/oca',
  'odoo/custom/src/external',
  'odoo/custom/patches',
  'odoo/custom/manifests',
].map((path) => path.replace(/\/$/, ''));

const safeResetProtectedGeneratedReadmes = new Set([
  'odoo/custom/src/private/README.md',
  'odoo/custom/src/oca/README.md',
  'odoo/custom/src/external/README.md',
  'odoo/custom/patches/README.md',
  'odoo/custom/manifests/README.md',
]);

function isProtectedGeneratedFile(filePath: string): boolean {
  return safeResetProtectedGeneratedReadmes.has(filePath);
}

type ExistingEnvironmentMetadata = Record<string, unknown>;

function mergeEnvironmentMetadata(
  target: string,
  options: ScaffoldOptions,
): Promise<string> {
  const generated = environmentMetadata(options);
  return readFile(join(target, '.wpmoo/odoo.json'), 'utf8')
    .then((content) => JSON.parse(content) as ExistingEnvironmentMetadata)
    .then((existing) => {
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        return `${JSON.stringify(generated, null, 2)}\n`;
      }

      return `${JSON.stringify({ ...existing, ...generated, sourceRepos: generated.sourceRepos }, null, 2)}\n`;
    })
    .catch(() => `${JSON.stringify(generated, null, 2)}\n`);
}

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
    '- .env.example',
    '- README.md',
    '- AGENTS.md',
    '- docs/appstore-release.md',
    '- External compose template assets',
    '- External agent skill assets when configured',
    '',
    'Will not touch:',
    '- source repo folders under odoo/custom/src/private',
    '- module source code',
    '- Git history, remotes, or branches',
    '- .env, data, and backups',
    '- custom source layout directories (oca, external, patches, manifests)',
    '- Legacy compose template files may remain until manually removed: docs/assets/, test/, .github/',
    '',
    'Preview-only output; files are not changed until reset is executed.',
    '',
    stage ? 'Generated changes will be staged with git add .' : 'Generated changes will not be staged.',
  ].join('\n');
}

function titleFromTarget(target: string): string {
  return basename(target).replace(/_dev$/, '') || 'odoo_sample_module';
}

function safeResetExternalAssetOptions(options: ScaffoldOptions): ExternalAssetOptions[] {
  return plannedExternalAssetOptions(options).map((assetOptions) => ({
    ...assetOptions,
    exclude: [
      ...(assetOptions.exclude ?? []),
      ...safeResetProtectedPaths,
    ],
  }));
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

async function readSubmoduleUrl(target: string, repoPath: string, sourceType: SourceRepoType): Promise<string> {
  const safeRepoPath = validateRepoPath(repoPath);
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    const escapedPath = `odoo/custom/src/${sourceType}/${safeRepoPath}`;
    const sections = gitmodules.split(/\n(?=\[submodule )/);
    const section = sections.find((value) => value.includes(`path = ${escapedPath}`));
    const url = section?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
    return url || `odoo/custom/src/${sourceType}/${safeRepoPath}`;
  } catch {
    return `odoo/custom/src/${sourceType}/${safeRepoPath}`;
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

async function inferOptions(target: string): Promise<ScaffoldOptions> {
  const metadata = await readEnvironmentMetadata(target);
  const addonsYaml = await readAddonsYaml(target);
  const gitmoduleSources = await listGitmoduleSources(target);
  const addonRepos = parseRepoPathsFromAddonsYaml(addonsYaml);
  const sourceByKey = new Map<string, { sourceType: SourceRepoType; path: string }>();
  for (const repo of metadata?.sourceRepos ?? []) {
    if (isValidPathSegment(repo.path)) {
      const sourceType = repo.sourceType ?? 'private';
      const path = validateRepoPath(repo.path);
      sourceByKey.set(`${sourceType}:${path}`, { sourceType, path });
    }
  }
  for (const repo of gitmoduleSources) {
    sourceByKey.set(`${repo.type}:${repo.path}`, { sourceType: repo.type, path: repo.path });
  }
  for (const repoPath of addonRepos) {
    sourceByKey.set(`private:${repoPath}`, { sourceType: 'private', path: repoPath });
  }
  const sourceLocations = [...sourceByKey.values()];
  const product = metadata?.product ?? sourceLocations[0]?.path ?? titleFromTarget(target);
  const sourceRepos: SourceRepo[] = await Promise.all(
    sourceLocations.map(async ({ sourceType, path }) => ({
      path,
      sourceType,
      url:
        metadata?.sourceRepos
          .find((repo) => repo.path === path && (repo.sourceType ?? 'private') === sourceType)
          ?.url.trim() ||
        gitmoduleSources.find((repo) => repo.path === path && repo.type === sourceType)?.url ||
        (await readSubmoduleUrl(target, path, sourceType)),
      addons: parseAddonsForRepo(addonsYaml, path),
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
  const externalAssets = safeResetExternalAssetOptions(scaffoldOptions);

  for (const file of files) {
    if (file.path === '.wpmoo/odoo.json') {
      continue;
    }

    if (isProtectedGeneratedFile(file.path) && (await pathExists(join(options.target, file.path)))) {
      continue;
    }

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

  for (const assetOptions of externalAssets) {
    await applyExternalAsset(assetOptions, git);
  }
  await writeTextFile(join(options.target, '.wpmoo/odoo.json'), await mergeEnvironmentMetadata(options.target, scaffoldOptions));
  await writeTextFile(join(options.target, '.env.example'), renderComposeEnvExample(scaffoldOptions));

  if (options.stage) {
    await stageAll(git, options.target);
  }
}
