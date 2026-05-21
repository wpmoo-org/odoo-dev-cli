import { lstat, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

type SourceRepoType = 'private' | 'oca' | 'external';

const sourceRepoTypes: SourceRepoType[] = ['private', 'oca', 'external'];
const sourceRepoBase = ['odoo', 'custom', 'src'] as const;

const migrationFolders = ['migrations', 'migration'] as const;
const versionedMigrationFiles = ['pre-migration.py', 'post-migration.py', 'end-migration.py'] as const;
const scriptMigrationFiles = ['migrate.py', 'migration.py'] as const;

export type MigrationRiskResult = {
  foundPaths: string[];
  count: number;
  risk: boolean;
};

async function isDirectory(path: string): Promise<boolean> {
  try {
    const entry = await lstat(path);
    return entry.isDirectory() && !entry.isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    const entry = await lstat(path);
    return entry.isFile() && !entry.isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

async function listDirectoryNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const filtered = entries.filter(
      (entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'),
    );
    return filtered.map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return [];
    }
    throw error;
  }
}

async function listMigrationFiles(modulePath: string, migrationFolder: string): Promise<string[]> {
  const found: string[] = [];
  const versionRoot = join(modulePath, migrationFolder);
  if (!(await isDirectory(versionRoot))) {
    return found;
  }

  const versions = await listDirectoryNames(versionRoot);
  for (const version of versions) {
    const versionPath = join(versionRoot, version);
    if (!(await isDirectory(versionPath))) {
      continue;
    }

    for (const file of versionedMigrationFiles) {
      const path = join(versionPath, file);
      if (await isFile(path)) {
        found.push(path);
      }
    }
  }
  return found;
}

async function scanModule(modulePath: string): Promise<string[]> {
  const found: string[] = [];

  for (const folder of migrationFolders) {
    found.push(...(await listMigrationFiles(modulePath, folder)));
  }

  const scriptsPath = join(modulePath, 'scripts');
  if (!(await isDirectory(scriptsPath))) {
    return found.sort();
  }

  for (const migrationScript of scriptMigrationFiles) {
    const candidate = join(scriptsPath, migrationScript);
    if (await isFile(candidate)) {
      found.push(candidate);
    }
  }

  return found;
}

export async function scanMigrationRisks(target: string): Promise<MigrationRiskResult> {
  const root = resolve(target);
  const foundPaths: string[] = [];
  const srcRoot = join(root, ...sourceRepoBase);

  for (const sourceType of sourceRepoTypes) {
    const typeRoot = join(srcRoot, sourceType);
    if (!(await isDirectory(typeRoot))) {
      continue;
    }

    const repoNames = await listDirectoryNames(typeRoot);
    for (const repoName of repoNames) {
      const repoPath = join(typeRoot, repoName);
      if (!(await isDirectory(repoPath))) {
        continue;
      }

      const moduleNames = await listDirectoryNames(repoPath);
      for (const moduleName of moduleNames) {
        const modulePath = join(repoPath, moduleName);
        const modulePaths = await scanModule(modulePath);
        foundPaths.push(...modulePaths);
      }
    }
  }

  foundPaths.sort();
  return {
    foundPaths,
    count: foundPaths.length,
    risk: foundPaths.length > 0,
  };
}
