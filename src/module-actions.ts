import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  addModuleToSourceRepoInAddonsYaml,
  removeModuleFromSourceRepoInAddonsYaml,
} from './addons-yaml.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import { readAddonsYaml, writeAddonsYaml } from './repo-actions.js';

export type AddModuleOptions = {
  target: string;
  repoPath: string;
  moduleName: string;
  odooVersion: string;
  stage: boolean;
};

export type RemoveModuleOptions = {
  target: string;
  repoPath: string;
  moduleName: string;
  deleteFiles: boolean;
  stage: boolean;
};

function sourceRepoPath(target: string, repoPath: string): string {
  return join(target, 'odoo/custom/src/private', repoPath);
}

function modulePath(target: string, repoPath: string, moduleName: string): string {
  return join(sourceRepoPath(target, repoPath), moduleName);
}

function titleizeModule(moduleName: string): string {
  return moduleName
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function manifestContent(moduleName: string, odooVersion: string): string {
  return `{
    "name": "${titleizeModule(moduleName)}",
    "version": "${odooVersion}.1.0.0",
    "category": "Productivity",
    "summary": "TODO",
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

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await readFile(path, 'utf8');
  } catch {
    await writeFile(path, content, 'utf8');
  }
}

export async function addModuleToSourceRepo(
  options: AddModuleOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const destination = modulePath(options.target, options.repoPath, options.moduleName);
  await mkdir(join(destination, 'models'), { recursive: true });
  await mkdir(join(destination, 'security'), { recursive: true });
  await mkdir(join(destination, 'views'), { recursive: true });

  await writeIfMissing(join(destination, '__init__.py'), 'from . import models\n');
  await writeIfMissing(join(destination, '__manifest__.py'), manifestContent(options.moduleName, options.odooVersion));
  await writeIfMissing(join(destination, 'models/__init__.py'), '');
  await writeIfMissing(
    join(destination, 'security/ir.model.access.csv'),
    'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink\n',
  );
  await writeIfMissing(join(destination, 'views/.gitkeep'), '');

  const addonsYaml = await readAddonsYaml(options.target);
  await writeAddonsYaml(
    options.target,
    addModuleToSourceRepoInAddonsYaml(addonsYaml, options.repoPath, options.moduleName),
  );

  if (options.stage) {
    await stageAll(git, sourceRepoPath(options.target, options.repoPath));
    await stageAll(git, options.target);
  }
}

export async function listModulesInSourceRepo(target: string, repoPath: string): Promise<string[]> {
  try {
    const entries = await readdir(sourceRepoPath(target, repoPath), { withFileTypes: true });
    const modules = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            await readFile(join(sourceRepoPath(target, repoPath), entry.name, '__manifest__.py'), 'utf8');
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

export async function removeModuleFromSourceRepo(
  options: RemoveModuleOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const addonsYaml = await readAddonsYaml(options.target);
  await writeAddonsYaml(
    options.target,
    removeModuleFromSourceRepoInAddonsYaml(addonsYaml, options.repoPath, options.moduleName),
  );

  if (options.deleteFiles) {
    await rm(modulePath(options.target, options.repoPath, options.moduleName), { recursive: true, force: true });
  }

  if (options.stage) {
    if (options.deleteFiles) {
      await stageAll(git, sourceRepoPath(options.target, options.repoPath));
    }
    await stageAll(git, options.target);
  }
}
