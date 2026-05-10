import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ScaffoldOptions, SourceRepo } from './types.js';
import { packageName, packageVersion } from './version.js';

export const markerPath = '.wpmoo/odoo-dev.json';
export const defaultOdooVersion = '19.0';

export type EnvironmentMetadata = {
  tool: string;
  version: string;
  product: string;
  odooVersion: string;
  devRepo: string;
  devRepoUrl: string;
  sourceRepos: SourceRepo[];
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
  };
}

export function renderEnvironmentMetadata(options: ScaffoldOptions): string {
  return `${JSON.stringify(environmentMetadata(options), null, 2)}\n`;
}

export async function readEnvironmentMetadata(target: string): Promise<EnvironmentMetadata | undefined> {
  try {
    const content = await readFile(join(target, markerPath), 'utf8');
    return JSON.parse(content) as EnvironmentMetadata;
  } catch {
    return undefined;
  }
}

export async function detectDevelopmentEnvironment(target: string): Promise<DevelopmentEnvironmentDetection> {
  if (await readEnvironmentMetadata(target)) {
    return { isEnvironment: true, source: 'marker' };
  }

  const hasAddonsYaml = await exists(join(target, 'odoo/custom/src/addons.yaml'));
  const hasReposYaml = await exists(join(target, 'odoo/custom/src/repos.yaml'));
  const hasPrivateDir = await exists(join(target, 'odoo/custom/src/private'));

  if (hasAddonsYaml && hasReposYaml && hasPrivateDir) {
    return { isEnvironment: true, source: 'layout' };
  }

  return { isEnvironment: false, source: 'none' };
}

export async function environmentOdooVersion(target: string): Promise<string> {
  const metadata = await readEnvironmentMetadata(target);
  return metadata?.odooVersion || defaultOdooVersion;
}
