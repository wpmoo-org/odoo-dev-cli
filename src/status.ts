import { access, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { detectComposeLayout, readEnvFile, selectedComposeEnvironment } from './compose-layout.js';
import { defaultOdooVersion, markerPath } from './environment.js';
import {
  emptyModuleQualitySummary,
  mergeModuleQualitySummaries,
  scanModuleQuality,
  type ModuleQualitySummary,
} from './module-quality.js';
import { isValidPathSegment, validateRepoPath } from './path-validation.js';

type StatusKind = 'no_environment' | 'invalid_metadata' | 'environment';

type EnvironmentStatusBase = {
  kind: StatusKind;
  target: string;
  metadataPath: string;
  recommendedNextAction: string;
};

type NoEnvironmentStatus = EnvironmentStatusBase & {
  kind: 'no_environment';
};

type InvalidMetadataStatus = EnvironmentStatusBase & {
  kind: 'invalid_metadata';
  metadataError: string;
};

type ValidEnvironmentStatus = EnvironmentStatusBase & {
  kind: 'environment';
  odooVersion: string;
  sourceRepoCount: number;
  sourceRepoPaths: string[];
  invalidSourceRepoPaths: string[];
  moduleCandidateCount: number;
  moduleQuality: ModuleQualitySummary;
  composeFiles: string[];
  composeErrors: string[];
  missingCoreFiles: string[];
};

export type EnvironmentStatus = NoEnvironmentStatus | InvalidMetadataStatus | ValidEnvironmentStatus;

type MetadataSourceRepo = {
  path: string;
  sourceType?: string;
};

type SourceType = 'private' | 'oca' | 'external';

type Metadata = {
  odooVersion?: string;
  sourceRepos?: MetadataSourceRepo[];
};

type StatusJsonPayload = {
  schemaVersion: 1;
  command: 'status';
  ok: boolean;
  status: EnvironmentStatus;
};

const validSourceTypes: ReadonlyArray<SourceType> = ['private', 'oca', 'external'];
const summarySeparator = ' \u00B7 ';

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeSourceType(sourceType?: string): SourceType {
  if (typeof sourceType === 'string' && validSourceTypes.includes(sourceType as SourceType)) {
    return sourceType as SourceType;
  }
  return 'private';
}

function sourceRepoPath(target: string, sourceType: SourceType, path: string): string {
  return join(target, 'odoo/custom/src', sourceType, path);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMetadata(content: string): Metadata {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('metadata is not an object');
  }
  return parsed as Metadata;
}

function sourceRepoPathsFromMetadata(metadata: Metadata): {
  sourceRepoPaths: string[];
  sourceRepoLocations: Array<{ sourceType: SourceType; path: string }>;
  invalidSourceRepoPaths: string[];
} {
  const sourceRepoPaths: string[] = [];
  const sourceRepoLocations: Array<{ sourceType: SourceType; path: string }> = [];
  const invalidSourceRepoPaths: string[] = [];
  if (!Array.isArray(metadata.sourceRepos)) {
    return { sourceRepoPaths, sourceRepoLocations, invalidSourceRepoPaths };
  }

  for (const repo of metadata.sourceRepos) {
    const path = repo && typeof repo.path === 'string' ? repo.path.trim() : '';
    if (!path) continue;
    if (!isValidPathSegment(path)) {
      invalidSourceRepoPaths.push(path);
      continue;
    }
    const sourceType = normalizeSourceType(typeof repo.sourceType === 'string' ? repo.sourceType : undefined);
    const normalizedPath = validateRepoPath(path);
    sourceRepoPaths.push(normalizedPath);
    sourceRepoLocations.push({ sourceType, path: normalizedPath });
  }

  return { sourceRepoPaths, sourceRepoLocations, invalidSourceRepoPaths };
}

async function missingCoreFiles(
  target: string,
  odooVersion: string,
): Promise<{ missing: string[]; composeFiles: string[]; composeErrors: string[] }> {
  const missing: string[] = [];
  const checks: Array<{ label: string; path: string; mustBeDirectory?: boolean }> = [
    { label: 'moo', path: join(target, 'moo') },
    { label: 'README.md', path: join(target, 'README.md') },
    { label: 'AGENTS.md', path: join(target, 'AGENTS.md') },
    { label: 'scripts/', path: join(target, 'scripts'), mustBeDirectory: true },
  ];

  for (const check of checks) {
    if (!(await pathExists(check.path))) {
      missing.push(check.label);
      continue;
    }
    if (check.mustBeDirectory) {
      const fileStat = await stat(check.path);
      if (!fileStat.isDirectory()) missing.push(check.label);
    }
  }

  const env = await readEnvFile(target);
  const composeLayout = await detectComposeLayout(target, {
    odooVersions: [odooVersion],
    envName: selectedComposeEnvironment(env),
  });
  missing.push(...composeLayout.missingFiles);

  return { missing, composeFiles: composeLayout.files, composeErrors: composeLayout.errors };
}

export function environmentBannerSummaryLine(status: EnvironmentStatus): string {
  if (status.kind !== 'environment') {
    return `Environment: ${summaryText(status)}`;
  }

  const issueCount =
    status.composeErrors.length + status.invalidSourceRepoPaths.length + status.missingCoreFiles.length;
  const issueSuffix = issueCount > 0 ? `${summarySeparator}${pluralize(issueCount, 'issue', 'issues')}` : '';

  return [
    `Environment: Odoo ${status.odooVersion}`,
    pluralize(status.sourceRepoCount, 'repo', 'repos'),
    pluralize(status.moduleCandidateCount, 'module', 'modules'),
  ].join(summarySeparator) + issueSuffix;
}

function summaryText(status: EnvironmentStatus): string {
  if (status.kind === 'no_environment') return 'No WPMoo environment detected.';
  if (status.kind === 'invalid_metadata') return 'Environment metadata is invalid.';

  const prefix =
    status.missingCoreFiles.length > 0 ||
    status.invalidSourceRepoPaths.length > 0 ||
    status.composeErrors.length > 0
      ? 'Environment needs attention'
      : 'Environment ready';
  return `${prefix}: Odoo ${status.odooVersion}, source repos ${status.sourceRepoCount}, module candidates ${status.moduleCandidateCount}.`;
}

function isStatusHealthy(status: EnvironmentStatus): boolean {
  if (status.kind !== 'environment') return false;
  return (
    status.missingCoreFiles.length === 0 &&
    status.invalidSourceRepoPaths.length === 0 &&
    status.composeErrors.length === 0 &&
    !status.moduleQuality.issues.some((issue) => issue.severity === 'error')
  );
}

export function environmentStatusJson(status: EnvironmentStatus): StatusJsonPayload {
  return {
    schemaVersion: 1,
    command: 'status',
    ok: isStatusHealthy(status),
    status,
  };
}

export async function getEnvironmentStatus(target: string): Promise<EnvironmentStatus> {
  const metadataFullPath = join(target, markerPath);
  if (!(await pathExists(metadataFullPath))) {
    return {
      kind: 'no_environment',
      target,
      metadataPath: markerPath,
      recommendedNextAction: 'Run npx @wpmoo/toolkit create ...',
    };
  }

  let metadata: Metadata;
  try {
    const content = await readFile(metadataFullPath, 'utf8');
    metadata = parseMetadata(content);
  } catch (error) {
    return {
      kind: 'invalid_metadata',
      target,
      metadataPath: markerPath,
      metadataError: errorMessage(error),
      recommendedNextAction:
        'Fix .wpmoo/odoo.json or run npx @wpmoo/toolkit reset from a valid environment.',
    };
  }

  const odooVersion =
    typeof metadata.odooVersion === 'string' && metadata.odooVersion.trim()
      ? metadata.odooVersion.trim()
      : defaultOdooVersion;
  const { sourceRepoPaths, sourceRepoLocations, invalidSourceRepoPaths } = sourceRepoPathsFromMetadata(
    metadata,
  );
  const repoRoots = sourceRepoLocations.map(({ sourceType, path }) => sourceRepoPath(target, sourceType, path));

  let moduleQuality = emptyModuleQualitySummary();
  for (const repoRoot of repoRoots) {
    moduleQuality = mergeModuleQualitySummaries(moduleQuality, await scanModuleQuality(repoRoot, target));
  }
  const moduleCandidateCount = moduleQuality.totalModules;

  const {
    missing: missingFiles,
    composeFiles,
    composeErrors,
  } = await missingCoreFiles(target, odooVersion);

  let recommendedNextAction = 'Run npx @wpmoo/toolkit doctor for deep checks or ./moo start.';
  if (invalidSourceRepoPaths.length > 0) {
    recommendedNextAction =
      'Fix invalid source repo paths in .wpmoo/odoo.json, then run npx @wpmoo/toolkit doctor.';
  } else if (missingFiles.length > 0) {
    recommendedNextAction = 'Run npx @wpmoo/toolkit reset, then npx @wpmoo/toolkit doctor.';
  } else if (composeErrors.length > 0) {
    recommendedNextAction = 'Fix compose layout errors, then run npx @wpmoo/toolkit doctor.';
  } else if (sourceRepoPaths.length === 0) {
    recommendedNextAction = 'Run npx @wpmoo/toolkit add-repo ...';
  }

  return {
    kind: 'environment',
    target,
    metadataPath: markerPath,
    odooVersion,
    sourceRepoCount: sourceRepoPaths.length,
    sourceRepoPaths,
    invalidSourceRepoPaths,
    moduleCandidateCount,
    moduleQuality,
    composeFiles,
    composeErrors,
    missingCoreFiles: missingFiles,
    recommendedNextAction,
  };
}

export function renderEnvironmentStatusSummary(status: EnvironmentStatus): string {
  return summaryText(status);
}

export function renderEnvironmentStatus(status: EnvironmentStatus): string {
  const lines = [`Status: ${summaryText(status)}`];

  if (status.kind === 'no_environment') {
    lines.push(`Metadata: missing ${status.metadataPath}`);
    lines.push(`Next: ${status.recommendedNextAction}`);
    return lines.join('\n');
  }

  if (status.kind === 'invalid_metadata') {
    lines.push(`Metadata: invalid ${status.metadataPath}`);
    lines.push(`Error: ${status.metadataError}`);
    lines.push(`Next: ${status.recommendedNextAction}`);
    return lines.join('\n');
  }

  lines.push(`Metadata: ${status.metadataPath}`);
  lines.push(`Odoo: ${status.odooVersion}`);
  lines.push(
    `Compose files: ${status.composeFiles.length > 0 ? status.composeFiles.join(', ') : '(missing)'}`,
  );
  if (status.composeErrors.length > 0) {
    lines.push(`Compose errors: ${status.composeErrors.join(', ')}`);
  }
  lines.push(`Source repos: ${status.sourceRepoCount}`);
  lines.push(
    `Source repo paths: ${
      status.sourceRepoPaths.length > 0 ? status.sourceRepoPaths.join(', ') : '(none configured)'
    }`,
  );
  if (status.invalidSourceRepoPaths.length > 0) {
    lines.push(`Invalid source repo paths: ${status.invalidSourceRepoPaths.join(', ')}`);
  }
  lines.push(`Module candidates: ${status.moduleCandidateCount}`);
  lines.push(
    `Module quality: ${status.moduleQuality.installableModules} installable, ${status.moduleQuality.nonInstallableModules} non-installable, ${status.moduleQuality.modulesMissingMenuActions} missing menu actions.`,
  );
  if (status.moduleQuality.issues.length > 0) {
    lines.push(
      `Module quality issues: ${status.moduleQuality.issues
        .map((issue) => `${issue.path}: ${issue.issue}`)
        .join('; ')}`,
    );
  }
  lines.push(
    `Missing core files: ${
      status.missingCoreFiles.length > 0 ? status.missingCoreFiles.join(', ') : '(none)'
    }`,
  );
  lines.push(`Next: ${status.recommendedNextAction}`);
  return lines.join('\n');
}

export async function renderEnvironmentStatusForTarget(target: string): Promise<string> {
  const status = await getEnvironmentStatus(target);
  return renderEnvironmentStatus(status);
}
