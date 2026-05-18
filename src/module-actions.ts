import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  addModuleToSourceRepoInAddonsYaml,
  removeModuleFromSourceRepoInAddonsYaml,
} from './addons-yaml.js';
import { readEnvironmentMetadata } from './environment.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import { pathUnderBase, validateModuleName, validateRepoPath } from './path-validation.js';
import { listModuleRepos, readAddonsYaml, writeAddonsYaml } from './repo-actions.js';
import { listSources } from './source-actions.js';
import type { SourceRepoType } from './types.js';

export type ListedModule = {
  moduleName: string;
  repoPath: string;
  sourceType: SourceRepoType;
  repoUrl?: string;
  repoSlug?: string;
};

const sourceTypeSortOrder: SourceRepoType[] = ['private', 'oca', 'external'];
const githubRepoUrlPattern = /^(?:https?:\/\/|git@)github\.com[/:]([^/]+)\/([^/.#?]+)(?:\.git)?(?:[/?#].*)?$/i;

export type AddModuleOptions = {
  target: string;
  repoPath: string;
  moduleName: string;
  odooVersion: string;
  sourceType?: SourceRepoType;
  stage: boolean;
};

export type RemoveModuleOptions = {
  target: string;
  repoPath: string;
  moduleName: string;
  sourceType?: SourceRepoType;
  deleteFiles: boolean;
  stage: boolean;
};

const validSourceTypes: SourceRepoType[] = ['private', 'oca', 'external'];

function deriveRepoSlug(repoUrl: string | undefined): string | undefined {
  if (!repoUrl) {
    return undefined;
  }

  const normalized = repoUrl.trim().replace(/[?#].*$/, '');
  const match = githubRepoUrlPattern.exec(normalized);
  if (!match) {
    return undefined;
  }

  const owner = match[1]?.trim();
  const repo = match[2]?.trim();
  if (!owner || !repo) {
    return undefined;
  }

  return `${owner}/${repo}`;
}

function normalizeSourceType(value?: SourceRepoType): SourceRepoType {
  return validSourceTypes.includes(value as SourceRepoType) ? (value as SourceRepoType) : 'private';
}

function sourceRepoPath(target: string, sourceType: SourceRepoType, repoPath: string): string {
  return pathUnderBase(join(target, `odoo/custom/src/${sourceType}`), repoPath, 'repo path');
}

function modulePath(target: string, sourceType: SourceRepoType, repoPath: string, moduleName: string): string {
  return pathUnderBase(sourceRepoPath(target, sourceType, repoPath), moduleName, 'module name');
}

function titleizeModule(moduleName: string): string {
  return moduleName
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function moduleClassName(moduleName: string): string {
  const className = titleizeModule(moduleName).replace(/[^A-Za-z0-9]/g, '');
  return /^[A-Za-z_]/.test(className) ? className : `X${className}`;
}

function modelTechnicalName(moduleName: string): string {
  return moduleName.replace(/[_-]+/g, '.').toLowerCase();
}

function modelContent(moduleName: string): string {
  const moduleTitle = titleizeModule(moduleName);

  return `from odoo import models


class ${moduleClassName(moduleName)}(models.Model):
    _name = "${modelTechnicalName(moduleName)}"
    _description = "${moduleTitle}"
`;
}

function manifestContent(moduleName: string, odooVersion: string): string {
  const moduleTitle = titleizeModule(moduleName);

  return `{
    "name": "${moduleTitle}",
    "version": "${odooVersion}.1.0.0",
    "category": "Productivity",
    "summary": "${moduleTitle} module",
    "depends": ["base"],
    "data": [
        "security/ir.model.access.csv",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
`;
}

function accessCsvContent(moduleName: string): string {
  const modelId = modelTechnicalName(moduleName).replace(/\./g, '_');

  return [
    'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
    `access_${modelId}_user,access_${modelId}_user,model_${modelId},base.group_user,1,1,1,1`,
    '',
  ].join('\n');
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await readFile(path, 'utf8');
  } catch {
    await writeFile(path, content, 'utf8');
  }
}

async function usesAddonsYaml(target: string): Promise<boolean> {
  const metadata = await readEnvironmentMetadata(target);
  return metadata?.engine !== 'compose';
}

export async function addModuleToSourceRepo(
  options: AddModuleOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const repoPath = validateRepoPath(options.repoPath);
  const moduleName = validateModuleName(options.moduleName);
  const sourceType = normalizeSourceType(options.sourceType);
  const destination = modulePath(options.target, sourceType, repoPath, moduleName);
  await mkdir(join(destination, 'models'), { recursive: true });
  await mkdir(join(destination, 'security'), { recursive: true });
  await mkdir(join(destination, 'views'), { recursive: true });

  await writeIfMissing(join(destination, '__init__.py'), 'from . import models\n');
  await writeIfMissing(join(destination, '__manifest__.py'), manifestContent(moduleName, options.odooVersion));
  await writeIfMissing(join(destination, 'models/__init__.py'), `from . import ${moduleName}\n`);
  await writeIfMissing(join(destination, `models/${moduleName}.py`), modelContent(moduleName));
  await writeIfMissing(
    join(destination, 'security/ir.model.access.csv'),
    accessCsvContent(moduleName),
  );
  await writeIfMissing(join(destination, 'views/.gitkeep'), '');

  if (sourceType === 'private' && (await usesAddonsYaml(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    await writeAddonsYaml(
      options.target,
      addModuleToSourceRepoInAddonsYaml(addonsYaml, repoPath, moduleName),
    );
  }

  if (options.stage) {
    await stageAll(git, sourceRepoPath(options.target, sourceType, repoPath));
    await stageAll(git, options.target);
  }
}

export async function listModulesInSourceRepo(
  target: string,
  repoPath: string,
  sourceType?: SourceRepoType,
): Promise<string[]> {
  const safeRepoPath = validateRepoPath(repoPath);
  const resolvedSourceType = normalizeSourceType(sourceType);
  try {
    const entries = await readdir(sourceRepoPath(target, resolvedSourceType, safeRepoPath), { withFileTypes: true });
    const modules = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            await readFile(
              join(sourceRepoPath(target, resolvedSourceType, safeRepoPath), entry.name, '__manifest__.py'),
              'utf8',
            );
            return entry.name;
          } catch {
            return undefined;
          }
        }),
    );

    return modules.filter((moduleName): moduleName is string => Boolean(moduleName)).sort();
  } catch {
    return [];
  }
}

export async function listModulesInEnvironment(target: string): Promise<ListedModule[]> {
  const sources = await listSources(target);
  type SourceRepoDescriptor = {
    repoPath: string;
    sourceType: SourceRepoType;
    repoUrl?: string;
  };
  const sourceRepos =
    sources.length > 0
      ? sources.map<SourceRepoDescriptor>((source) => ({
          repoPath: source.path,
          sourceType: source.type,
          repoUrl: source.url,
        }))
      : (await listModuleRepos(target)).map<SourceRepoDescriptor>((repoPath) => ({ repoPath, sourceType: 'private' }));

  const listedModules = await Promise.all(
    sourceRepos.map(async ({ repoPath, sourceType, repoUrl }) => {
      try {
        const moduleNames = await listModulesInSourceRepo(target, repoPath, sourceType);
        const repoSlug = deriveRepoSlug(repoUrl);
        return moduleNames.map((moduleName) => ({
          moduleName,
          repoPath,
          sourceType,
          ...(repoUrl ? { repoUrl } : {}),
          ...(repoSlug ? { repoSlug } : {}),
        }));
      } catch {
        return [];
      }
    }),
  );

  const sourceTypeOrder = new Map(sourceTypeSortOrder.map((sourceType, index) => [sourceType, index]));
  return listedModules.flat().sort(
    (left, right) =>
      (sourceTypeOrder.get(left.sourceType) ?? 0) - (sourceTypeOrder.get(right.sourceType) ?? 0) ||
      left.repoPath.localeCompare(right.repoPath) ||
      left.moduleName.localeCompare(right.moduleName),
  );
}

export async function removeModuleFromSourceRepo(
  options: RemoveModuleOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const repoPath = validateRepoPath(options.repoPath);
  const moduleName = validateModuleName(options.moduleName);
  const sourceType = normalizeSourceType(options.sourceType);

  if (sourceType === 'private' && (await usesAddonsYaml(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    await writeAddonsYaml(
      options.target,
      removeModuleFromSourceRepoInAddonsYaml(addonsYaml, repoPath, moduleName),
    );
  }

  if (options.deleteFiles) {
    await rm(modulePath(options.target, sourceType, repoPath, moduleName), { recursive: true, force: true });
  }

  if (options.stage) {
    if (options.deleteFiles) {
      await stageAll(git, sourceRepoPath(options.target, sourceType, repoPath));
    }
    await stageAll(git, options.target);
  }
}
