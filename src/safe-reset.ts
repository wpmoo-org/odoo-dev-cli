import { readFileSync } from 'node:fs';
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
  includeGeneratedPaths?: readonly string[];
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

function mergeEnvironmentMetadataSync(target: string, options: ScaffoldOptions): string {
  const generated = environmentMetadata(options);
  try {
    const existing = parseMetadataFromPath(target);
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      return `${JSON.stringify(generated, null, 2)}\n`;
    }

    return `${JSON.stringify({ ...existing, ...generated, sourceRepos: generated.sourceRepos }, null, 2)}\n`;
  } catch {
    return `${JSON.stringify(generated, null, 2)}\n`;
  }
}

function parseMetadataFromPath(target: string): ExistingEnvironmentMetadata | undefined {
  try {
    const raw = readFileSync(join(target, '.wpmoo/odoo.json'), 'utf8');
    const parsed = JSON.parse(raw) as ExistingEnvironmentMetadata;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function parseAddonsFile(target: string): string {
  try {
    return readFileSync(join(target, 'odoo/custom/src/addons.yaml'), 'utf8');
  } catch {
    return '';
  }
}

function parseGitmodules(target: string): Array<{ path: string; sourceType: SourceRepoType; url: string }> {
  try {
    const gitmodules = readFileSync(join(target, '.gitmodules'), 'utf8');
    const sections = gitmodules.split(/\n(?=\[submodule )/);
    return sections.flatMap((section) => {
      const pathMatch = section.match(/^\s*path\s*=\s*odoo\/custom\/src\/(?:(private|oca|external)\/)?([^\s/]+)\s*$/m);
      if (!pathMatch) {
        return [];
      }

      const source = section.match(/^\s*url\s*=\s*(.+)\s*$/m)?.[1]?.trim();
      if (!source) {
        return [];
      }

      const sourceType = (pathMatch[1] ?? 'private') as SourceRepoType;
      return [{ path: pathMatch[2], sourceType, url: source }];
    });
  } catch {
    return [];
  }
}

function inferOptionsForPreviewSync(target: string): ScaffoldOptions {
  const metadata = parseMetadataFromPath(target);
  const addonsYaml = parseAddonsFile(target);
  const gitmoduleSources = parseGitmodules(target);
  const addonRepos = parseRepoPathsFromAddonsYaml(addonsYaml);
  const sourceByKey = new Map<string, { sourceType: SourceRepoType; path: string }>();
  const sourceReposFromMetadata = Array.isArray((metadata as { sourceRepos?: unknown })?.sourceRepos)
    ? ((metadata as { sourceRepos?: unknown }).sourceRepos as Array<{
      path?: string;
      sourceType?: SourceRepoType;
      addons?: string[];
      url?: string;
    }>)
    : [];

  for (const repo of sourceReposFromMetadata) {
    if (!repo?.path || !isValidPathSegment(repo.path)) {
      continue;
    }
    sourceByKey.set(`${repo.sourceType ?? 'private'}:${repo.path}`, {
      sourceType: repo.sourceType ?? 'private',
      path: validateRepoPath(repo.path),
    });
  }

  for (const repo of gitmoduleSources) {
    sourceByKey.set(`${repo.sourceType}:${repo.path}`, repo);
  }

  for (const repoPath of addonRepos) {
    sourceByKey.set(`private:${repoPath}`, {
      sourceType: 'private',
      path: repoPath,
    });
  }

  const sourceLocations = [...sourceByKey.values()].sort((left, right) => {
    if (left.sourceType !== right.sourceType) {
      return left.sourceType.localeCompare(right.sourceType);
    }
    return left.path.localeCompare(right.path);
  });
  const productFromMetadata = typeof metadata?.product === 'string' ? metadata.product : undefined;
  const composeTemplateUrl = typeof metadata?.composeTemplateUrl === 'string' ? metadata.composeTemplateUrl : undefined;
  const composeTemplateRef = typeof metadata?.composeTemplateRef === 'string' ? metadata.composeTemplateRef : undefined;
  const agentSkillsTemplateUrl = typeof metadata?.agentSkillsTemplateUrl === 'string'
    ? metadata.agentSkillsTemplateUrl
    : undefined;
  const agentSkillsTemplateRef = typeof metadata?.agentSkillsTemplateRef === 'string'
    ? metadata.agentSkillsTemplateRef
    : undefined;
  const odooVersion = typeof metadata?.odooVersion === 'string' ? metadata.odooVersion : undefined;
  const devRepo = typeof metadata?.devRepo === 'string' ? metadata.devRepo : undefined;
  const devRepoUrl = typeof metadata?.devRepoUrl === 'string' ? metadata.devRepoUrl : undefined;
  const postgresVersion = typeof metadata?.postgresVersion === 'string' ? metadata.postgresVersion : undefined;
  const httpPort = typeof metadata?.httpPort === 'string' ? metadata.httpPort : undefined;
  const geventPort = typeof metadata?.geventPort === 'string' ? metadata.geventPort : undefined;
  const product = productFromMetadata && isValidPathSegment(productFromMetadata) ? productFromMetadata
    : sourceLocations[0]?.path ?? titleFromTarget(target);

  return {
    product,
    odooVersion: odooVersion ?? '19.0',
    devRepo: devRepo ?? basename(target),
    devRepoUrl: devRepoUrl ?? target,
    sourceRepos: sourceLocations.map(({ sourceType, path }) => {
      const metadataMatch = sourceReposFromMetadata.find(
        (repo) => isValidPathSegment(repo.path ?? '') && validateRepoPath(repo.path ?? '') === path && (repo.sourceType ?? 'private') === sourceType,
      );
      const gitmoduleMatch = gitmoduleSources.find((repo) => repo.path === path && repo.sourceType === sourceType);
      return {
        sourceType,
        path,
        url:
          metadataMatch?.url?.trim() ||
          gitmoduleMatch?.url ||
          readSubmoduleUrlFromPath(target, path, sourceType),
        addons: parseAddonsForRepo(addonsYaml, path, sourceType),
      };
    }),
    engine: 'compose',
    composeTemplateUrl,
    composeTemplateRef,
    agentSkillsTemplateUrl,
    agentSkillsTemplateRef,
    postgresVersion,
    httpPort,
    geventPort,
    target,
    dryRun: false,
    initEmptyRepos: false,
    stage: false,
    skipSubmodules: true,
  };
}

function readSubmoduleUrlFromPath(target: string, repoPath: string, sourceType: SourceRepoType): string {
  try {
    const gitmodules = readFileSync(join(target, '.gitmodules'), 'utf8');
    const expectedPaths = [`odoo/custom/src/${sourceType}/${repoPath}`];
    if (sourceType === 'private') {
      expectedPaths.push(`odoo/custom/src/${repoPath}`);
    }
    const sections = gitmodules.split(/\n(?=\[submodule )/);
    const section = sections.find((value) => expectedPaths.some((path) => value.includes(`path = ${path}`)));
    const url = section?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
    return url || `odoo/custom/src/${sourceType}/${repoPath}`;
  } catch {
    return `odoo/custom/src/${sourceType}/${repoPath}`;
  }
}

function safeResetTargetFileDiffs(scaffoldOptions: ScaffoldOptions, target: string): string[] {
  const files = generatedFiles(scaffoldOptions);
  const candidates = [
    ...files,
    { path: '.env.example', content: renderComposeEnvExample(scaffoldOptions) },
    { path: '.wpmoo/odoo.json', content: mergeEnvironmentMetadataSync(target, scaffoldOptions) },
  ];

  const changedPaths = candidates
    .filter((file) => {
      if (file.path === 'odoo/custom/src/addons.yaml' || isProtectedGeneratedFile(file.path)) {
        return false;
      }

      const existing = readTextForPreview(target, file.path);
      if (existing === undefined) {
        return true;
      }

      return existing !== file.content;
    })
    .map((file) => file.path);

  return [...new Set(changedPaths)].sort();
}

function buildSafeResetSourceRepoLines(sourceRepos: SourceRepo[]): string[] {
  const lines = [...new Set(sourceRepos.map((repo) => `${repo.sourceType ?? 'private'}/${repo.path}`))].sort();
  if (lines.length === 0) {
    return ['- (none detected)'];
  }

  return lines.map((repo) => `- ${repo}`);
}

type SafeResetPreviewLists = {
  refreshPaths: string[];
  keptPaths: string[];
};

function supportsAnsi(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
}

function orange(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[38;2;255;112;67m${value}\u001B[39m`;
}

function green(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[32m${value}\u001B[39m`;
}

function bold(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[1m${value}\u001B[22m`;
}

function dim(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[2m${value}\u001B[22m`;
}

function refreshIcon(): string {
  return orange('↻');
}

function lockIcon(): string {
  return dim('🔒');
}

function detailText(value: string): string {
  return dim(value);
}

function refreshHeading(): string {
  return bold(orange('Files to refresh'));
}

function keptHeading(): string {
  return bold(green('Files kept unchanged'));
}

function renderSafeResetDetailRows(rows: readonly [string, string][]): string[] {
  const keyWidth = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `${key}:${' '.repeat(keyWidth - key.length + 2)}${detailText(value)}`);
}

function renderRefreshList(paths: readonly string[]): string[] {
  if (paths.length === 0) {
    return [`- ${detailText('(none)')}`];
  }
  return paths.map((path) => `- ${refreshIcon()} ${detailText(path)}`);
}

function renderKeptList(paths: readonly string[]): string[] {
  return paths.map((path) => `- ${lockIcon()} ${detailText(path)}`);
}

function renderSafeResetLists(lists: SafeResetPreviewLists): string[] {
  return [
    '',
    refreshHeading(),
    ...renderRefreshList(lists.refreshPaths),
    '',
    keptHeading(),
    ...renderKeptList(lists.keptPaths),
  ];
}

function readTextForPreview(target: string, path: string): string | undefined {
  try {
    return readFileSync(join(target, path), 'utf8');
  } catch {
    return undefined;
  }
}

export function renderSafeResetPreview(target: string, _stage: boolean): string {
  const options = inferOptionsForPreviewSync(target);
  const externalAssets = safeResetExternalAssetOptions(options);
  const changedPaths = safeResetTargetFileDiffs(options, target);
  const selectedGeneratedPaths = new Set(changedPaths);
  return renderSafeResetPreviewFromPaths(target, changedPaths, selectedGeneratedPaths, options, externalAssets);
}

export function safeResetSelectableGeneratedPaths(target: string): string[] {
  const options = inferOptionsForPreviewSync(target);
  return safeResetTargetFileDiffs(options, target);
}

export function renderSafeResetSelectedPreview(
  target: string,
  _stage: boolean,
  selectedGeneratedPaths: readonly string[],
): string {
  const options = inferOptionsForPreviewSync(target);
  const externalAssets = safeResetExternalAssetOptions(options);
  const changedPaths = safeResetTargetFileDiffs(options, target);
  return renderSafeResetPreviewFromPaths(target, changedPaths, new Set(selectedGeneratedPaths), options, externalAssets);
}

function renderSafeResetPreviewFromPaths(
  target: string,
  changedPaths: readonly string[],
  selectedGeneratedPaths: ReadonlySet<string>,
  options: ScaffoldOptions,
  externalAssets: readonly ExternalAssetOptions[],
): string {
  const externalAssetPaths: string[] = [];
  if (externalAssets.some((asset) => asset.label === 'compose')) {
    externalAssetPaths.push('External compose template assets');
  }
  if (externalAssets.some((asset) => asset.label === 'agent-skills')) {
    externalAssetPaths.push('External agent skill assets when configured');
  }

  const selectedChangedPaths = changedPaths.filter((file) => selectedGeneratedPaths.has(file));
  const unselectedChangedPaths = changedPaths.filter((file) => !selectedGeneratedPaths.has(file));
  const sourceRepoRows = buildSafeResetSourceRepoLines(options.sourceRepos).map((line) =>
    line === '- (none detected)' ? 'source repos: none detected' : line.replace(/^- /u, ''),
  );
  const protectedRows = [
    ...sourceRepoRows,
    '.env',
    'data/',
    'backups/',
    'Git history/remotes/branches',
    'source repo folders',
    'custom source layouts',
  ];
  const refreshPaths = [...selectedChangedPaths, ...externalAssetPaths];
  const keptPaths =
    changedPaths.length > 0
      ? [...unselectedChangedPaths, ...protectedRows]
      : ['No generated files differ from rendered output.', ...protectedRows];

  return [
    ...renderSafeResetDetailRows([
      ['Summary', `${refreshPaths.length} ${refreshPaths.length === 1 ? 'file' : 'files'} will be refreshed`],
      ['Target', target],
      ['Mode', 'generated files only'],
    ]),
    ...renderSafeResetLists({ refreshPaths, keptPaths }),
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

function parseAddonsForRepo(addonsYaml: string, repoPath: string, sourceType: SourceRepoType = 'private'): string[] {
  const safeRepoPath = validateRepoPath(repoPath);
  const lines = addonsYaml.split('\n');
  const headers = [`${sourceType}/${safeRepoPath}:`];
  if (sourceType === 'private') {
    headers.push(`${safeRepoPath}:`);
  }
  const start = lines.findIndex((line) => headers.includes(line.trim()));
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
  return [...addonsYaml.matchAll(/^(?:private\/)?([^/\s][^/:]*):$/gm)]
    .map((match) => match[1].trim())
    .filter((repoPath) => repoPath && isValidPathSegment(repoPath))
    .map(validateRepoPath);
}

async function readSubmoduleUrl(target: string, repoPath: string, sourceType: SourceRepoType): Promise<string> {
  const safeRepoPath = validateRepoPath(repoPath);
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    const expectedPaths = [`odoo/custom/src/${sourceType}/${safeRepoPath}`];
    if (sourceType === 'private') {
      expectedPaths.push(`odoo/custom/src/${safeRepoPath}`);
    }
    const sections = gitmodules.split(/\n(?=\[submodule )/);
    const section = sections.find((value) => expectedPaths.some((path) => value.includes(`path = ${path}`)));
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
      addons: parseAddonsForRepo(addonsYaml, path, sourceType),
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
  const selectedGeneratedPaths = options.includeGeneratedPaths ? new Set(options.includeGeneratedPaths) : undefined;
  const shouldWriteGeneratedPath = (path: string): boolean => !selectedGeneratedPaths || selectedGeneratedPaths.has(path);

  for (const file of files) {
    if (file.path === '.wpmoo/odoo.json') {
      continue;
    }

    if (!shouldWriteGeneratedPath(file.path)) {
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
  if (shouldWriteGeneratedPath('.wpmoo/odoo.json')) {
    await writeTextFile(join(options.target, '.wpmoo/odoo.json'), mergeEnvironmentMetadataSync(options.target, scaffoldOptions));
  }
  if (shouldWriteGeneratedPath('.env.example')) {
    await writeTextFile(join(options.target, '.env.example'), renderComposeEnvExample(scaffoldOptions));
  }

  if (options.stage) {
    await stageAll(git, options.target);
  }
}
