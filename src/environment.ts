import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { EnvironmentEngine, ScaffoldOptions, SourceRepo } from './types.js';
import { packageName, packageVersion } from './version.js';

const validSourceTypes = ['private', 'oca', 'external'] as const;

export const markerPath = '.wpmoo/odoo.json';
export const defaultOdooVersion = '19.0';

export type EnvironmentMetadata = {
  tool: string;
  version: string;
  product: string;
  odooVersion: string;
  devRepo: string;
  devRepoUrl: string;
  sourceRepos: SourceRepo[];
  engine?: EnvironmentEngine;
  composeTemplateUrl?: string;
  composeTemplateRef?: string;
  agentSkillsTemplateUrl?: string;
  agentSkillsTemplateRef?: string;
  postgresVersion?: string;
  httpPort?: string;
  geventPort?: string;
};

export type DevelopmentEnvironmentDetection = {
  isEnvironment: boolean;
  source: 'marker' | 'layout' | 'none';
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function environmentMetadata(options: ScaffoldOptions): EnvironmentMetadata {
  return {
    tool: packageName(),
    version: packageVersion(),
    product: options.product,
    odooVersion: options.odooVersion,
    devRepo: options.devRepo,
    devRepoUrl: options.devRepoUrl,
    sourceRepos: options.sourceRepos,
    engine: options.engine ?? 'compose',
    composeTemplateUrl: options.composeTemplateUrl,
    composeTemplateRef: options.composeTemplateRef,
    agentSkillsTemplateUrl: options.agentSkillsTemplateUrl,
    agentSkillsTemplateRef: options.agentSkillsTemplateRef,
    postgresVersion: options.postgresVersion,
    httpPort: options.httpPort,
    geventPort: options.geventPort,
  };
}

export function renderEnvironmentMetadata(options: ScaffoldOptions): string {
  return `${JSON.stringify(environmentMetadata(options), null, 2)}\n`;
}

function normalizeSourceType(
  sourceType?: SourceRepo['sourceType'],
): NonNullable<SourceRepo['sourceType']> {
  const normalized = sourceType ?? 'private';
  return validSourceTypes.includes(normalized) ? normalized : 'private';
}

function normalizeMetadataSourceRepo(repo: unknown): SourceRepo | undefined {
  if (!repo || typeof repo !== 'object') {
    return undefined;
  }

  const candidate = repo as Partial<SourceRepo>;
  const path = typeof candidate.path === 'string' ? candidate.path : '';
  const url = typeof candidate.url === 'string' ? candidate.url : '';
  const addons = Array.isArray(candidate.addons) ? candidate.addons.filter((item): item is string => typeof item === 'string') : [];
  const sourceType = normalizeSourceType(
    typeof candidate.sourceType === 'string' ? candidate.sourceType : undefined,
  );

  if (!path || !url) {
    return undefined;
  }

  return { ...candidate, path, url, addons, sourceType };
}

function sourceRepoWithType(repo: SourceRepo): SourceRepo {
  return {
    ...repo,
    sourceType: normalizeSourceType(repo.sourceType),
  };
}

function withoutPathDuplicates(repos: SourceRepo[]): SourceRepo[] {
  const byPath = new Map<string, SourceRepo>();
  repos.forEach((repo) => {
    const normalized = sourceRepoWithType(repo);
    byPath.set(`${normalized.sourceType}:${normalized.path}`, normalized);
  });
  return Array.from(byPath.values());
}

export async function readEnvironmentMetadata(target: string): Promise<EnvironmentMetadata | undefined> {
  try {
    const content = await readFile(join(target, markerPath), 'utf8');
    const metadata = JSON.parse(content) as EnvironmentMetadata;
    if (!metadata?.sourceRepos || !Array.isArray(metadata.sourceRepos)) {
      return metadata;
    }

    metadata.sourceRepos = metadata.sourceRepos
      .map(normalizeMetadataSourceRepo)
      .filter((repo): repo is SourceRepo => Boolean(repo));
    metadata.sourceRepos = withoutPathDuplicates(metadata.sourceRepos);

    return metadata;
  } catch {
    return undefined;
  }
}

async function writeEnvironmentMetadata(target: string, metadata: EnvironmentMetadata): Promise<void> {
  const content = `${JSON.stringify(
    {
      ...metadata,
      sourceRepos: metadata.sourceRepos.map(sourceRepoWithType),
    },
    null,
    2,
  )}\n`;

  await writeFile(join(target, markerPath), content, 'utf8');
}

export async function upsertSourceRepoMetadata(
  target: string,
  sourceRepo: SourceRepo,
): Promise<void> {
  const metadata = await readEnvironmentMetadata(target);
  if (!metadata) return;

  const normalizedRepo = sourceRepoWithType(sourceRepo);
  const sources = metadata.sourceRepos.filter(
    (repo) => !(repo.path === normalizedRepo.path && normalizeSourceType(repo.sourceType) === normalizedRepo.sourceType),
  );
  sources.push(normalizedRepo);
  metadata.sourceRepos = withoutPathDuplicates(sources);
  await writeEnvironmentMetadata(target, metadata);
}

export async function removeSourceRepoMetadata(
  target: string,
  repoPath: string,
  sourceType?: SourceRepo['sourceType'],
): Promise<void> {
  const metadata = await readEnvironmentMetadata(target);
  if (!metadata) return;

  const normalizedType = normalizeSourceType(sourceType);
  metadata.sourceRepos = metadata.sourceRepos.filter(
    (repo) => !(repo.path === repoPath && normalizeSourceType(repo.sourceType) === normalizedType),
  );
  await writeEnvironmentMetadata(target, metadata);
}

export async function detectDevelopmentEnvironment(target: string): Promise<DevelopmentEnvironmentDetection> {
  if (await readEnvironmentMetadata(target)) {
    return { isEnvironment: true, source: 'marker' };
  }

  const hasAddonsYaml = await exists(join(target, 'odoo/custom/src/addons.yaml'));
  const hasReposYaml = await exists(join(target, 'odoo/custom/src/repos.yaml'));
  const hasSourceDir =
    (await exists(join(target, 'odoo/custom/src/private'))) ||
    (await exists(join(target, 'odoo/custom/src/oca'))) ||
    (await exists(join(target, 'odoo/custom/src/external')));

  if (hasAddonsYaml && hasReposYaml && hasSourceDir) {
    return { isEnvironment: true, source: 'layout' };
  }

  return { isEnvironment: false, source: 'none' };
}

export async function environmentOdooVersion(target: string): Promise<string> {
  const metadata = await readEnvironmentMetadata(target);
  return metadata?.odooVersion || defaultOdooVersion;
}
