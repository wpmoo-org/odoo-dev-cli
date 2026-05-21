import { type Dirent, readFileSync, readdirSync, statSync, type Stats } from 'node:fs';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';

export type DatabaseListOptions = {
  includeMaintenance?: boolean;
};

export type DatabaseListResult =
  | { ok: true; databases: string[] }
  | { ok: false; databases: []; error?: string };

export type DatabaseListResponse = string[] | DatabaseListResult;

export const defaultDatabaseSnapshotMaxAgeMs = 24 * 60 * 60 * 1000;
export const databaseSnapshotDirectoryNames = ['backups/snapshots', 'backups', 'backup', 'snapshots'] as const;
export const databaseSnapshotExtensions = ['.dump', '.sql', '.sql.gz', '.zip', '.tar', '.tar.gz'] as const;

export type DatabaseSnapshotFile = {
  name: string;
  path: string;
  dumpPath: string;
  manifestPath?: string;
  databaseName?: string;
  createdAtMs: number;
  createdAt: string;
  mtimeMs: number;
  ageMs: number;
  filestorePath?: string;
  filestoreStatus: 'found' | 'missing';
};

export type DatabaseSnapshotScanOptions = {
  snapshotDirectories?: readonly string[];
  snapshotExtensions?: readonly string[];
  snapshotDatabaseNames?: readonly string[];
  nowMs?: number;
};

export type DatabaseSnapshotScanResult = {
  snapshotPaths: string[];
  newestSnapshotAgeMs: number | null;
  snapshots: DatabaseSnapshotFile[];
};

export type DatabaseSnapshotCatalogJson = {
  schemaVersion: 1;
  command: 'snapshot list';
  ok: true;
  snapshots: DatabaseSnapshotFile[];
};

export type DatabaseSnapshotRecentCheckOptions = DatabaseSnapshotScanOptions & {
  maxAgeMs?: number;
};

export type RestoreSnapshotPreflight = {
  name: string;
  requestedDatabase: string;
  dumpPath: string;
  dumpStatus: 'found' | 'missing';
  filestorePath: string;
  filestoreStatus: 'found' | 'missing';
  manifestPath?: string;
  manifestDatabase?: string;
  databaseMatches?: boolean;
  issues: string[];
};

type SnapshotManifest = {
  name?: string;
  database?: string;
  created_at?: string;
  dump?: string;
  filestore?: string;
};

type SnapshotComponent = {
  path: string;
  fileName: string;
  stem: string;
  kind: 'dump' | 'filestore' | 'manifest';
  stats: Stats;
};

type SnapshotGroup = {
  directory: string;
  stem: string;
  dumps: SnapshotComponent[];
  filestores: SnapshotComponent[];
  manifest?: SnapshotComponent;
};

function isDatabaseSnapshotFile(fileName: string, extensions: readonly string[]): boolean {
  const normalized = fileName.toLowerCase();
  return extensions.some((extension) => normalized.endsWith(extension));
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function stripSnapshotExtension(fileName: string): string | undefined {
  const normalized = fileName.toLowerCase();
  const suffixes = ['.filestore.tar.gz', '.sql.gz', '.tar.gz', '.dump', '.sql', '.zip', '.tar', '.json'];
  const suffix = suffixes.find((candidate) => normalized.endsWith(candidate));
  return suffix ? fileName.slice(0, -suffix.length) : undefined;
}

function snapshotComponentKind(fileName: string, snapshotExtensions: readonly string[]): SnapshotComponent['kind'] | undefined {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.json')) return 'manifest';
  if (normalized.endsWith('.filestore.tar.gz')) return 'filestore';
  return isDatabaseSnapshotFile(fileName, snapshotExtensions) ? 'dump' : undefined;
}

function snapshotNameFromPath(path: string): string | undefined {
  return stripSnapshotExtension(basename(path));
}

function snapshotComponentPriority(component: SnapshotComponent): number {
  const normalized = component.fileName.toLowerCase();
  if (normalized.endsWith('.dump')) return 0;
  if (normalized.endsWith('.sql.gz')) return 1;
  if (normalized.endsWith('.sql')) return 2;
  return 3;
}

function readSnapshotManifest(path: string | undefined): SnapshotManifest | undefined {
  if (!path) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as SnapshotManifest) : undefined;
  } catch {
    return undefined;
  }
}

const defaultSnapshotDatabaseNameHints = ['devel', 'stage', 'staging', 'prod', 'production', 'test', 'postgres'];

function inferDatabaseNameFromSnapshotName(
  snapshotName: string,
  databaseNames: readonly string[] | undefined,
): string | undefined {
  const candidates = databaseNames?.length ? databaseNames : defaultSnapshotDatabaseNameHints;
  const match = candidates
    .filter(isValidDatabaseName)
    .sort((left, right) => right.length - left.length)
    .find((database) => snapshotName.startsWith(`${database}-`) || snapshotName.startsWith(`${database}.`) || snapshotName.startsWith(`${database}_`));
  return match;
}

function manifestDateMs(manifest: SnapshotManifest | undefined): number | undefined {
  if (!manifest || typeof manifest.created_at !== 'string') return undefined;
  const parsed = Date.parse(manifest.created_at);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function manifestDatabaseName(manifest: SnapshotManifest | undefined): string | undefined {
  return typeof manifest?.database === 'string' && isValidDatabaseName(manifest.database) ? manifest.database : undefined;
}

function snapshotGroups(
  targetDirectory: string,
  snapshotDirectories: readonly string[],
  snapshotExtensions: readonly string[],
): SnapshotGroup[] {
  const groups = new Map<string, SnapshotGroup>();

  for (const directoryName of snapshotDirectories) {
    const directory = join(targetDirectory, directoryName);
    let entries: Dirent[];

    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const stem = stripSnapshotExtension(entry.name);
      const kind = snapshotComponentKind(entry.name, snapshotExtensions);
      if (!stem || !kind) {
        continue;
      }

      const path = join(directory, entry.name);
      let stats: Stats;

      try {
        stats = statSync(path);
      } catch {
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      const key = `${directory}\0${stem}`;
      const group = groups.get(key) ?? { directory, stem, dumps: [], filestores: [] };
      const component: SnapshotComponent = { path, fileName: entry.name, stem, kind, stats };
      if (kind === 'manifest') {
        group.manifest = component;
      } else if (kind === 'filestore') {
        group.filestores.push(component);
      } else {
        group.dumps.push(component);
      }
      groups.set(key, group);
    }
  }

  return [...groups.values()];
}

const maintenanceDatabases = new Set(['postgres']);
const databaseNamePattern = /^[A-Za-z0-9_.-]+$/u;

export function isValidDatabaseName(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    !normalized.startsWith('-') &&
    databaseNamePattern.test(normalized) &&
    !/\s/u.test(value)
  );
}

export function normalizeDatabaseName(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Invalid database name: value is required.');
  }
  if (/\s/u.test(value)) {
    throw new Error('Invalid database name: whitespace is not allowed.');
  }
  if (normalized.startsWith('-')) {
    throw new Error('Invalid database name: leading hyphens are not allowed.');
  }
  if (!databaseNamePattern.test(normalized)) {
    throw new Error(
      'Invalid database name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
  }
  return normalized;
}

const listDatabasesQuery = [
  'SELECT datname',
  'FROM pg_database',
  'WHERE datistemplate = false',
  "ORDER BY CASE WHEN datname = 'devel' THEN 0 WHEN datname = current_database() THEN 1 ELSE 2 END, datname;",
].join(' ');

export function parseDatabaseListOutput(output: string, options: DatabaseListOptions = {}): string[] {
  const seen = new Set<string>();
  const databases: string[] = [];

  for (const line of output.split(/\r?\n/u)) {
    const database = line.trim();
    if (
      !/^[A-Za-z0-9_.-]+$/u.test(database) ||
      database.startsWith('-') ||
      seen.has(database) ||
      (!options.includeMaintenance && maintenanceDatabases.has(database))
    ) {
      continue;
    }
    seen.add(database);
    databases.push(database);
  }

  return databases;
}

export function findDatabaseSnapshots(targetDirectory: string, options: DatabaseSnapshotScanOptions = {}): DatabaseSnapshotScanResult {
  const {
    nowMs = Date.now(),
    snapshotDirectories = [...databaseSnapshotDirectoryNames],
    snapshotExtensions = [...databaseSnapshotExtensions],
    snapshotDatabaseNames,
  } = options;
  const snapshots: DatabaseSnapshotFile[] = snapshotGroups(targetDirectory, snapshotDirectories, snapshotExtensions)
    .flatMap((group): DatabaseSnapshotFile[] => {
      const primary = [...group.dumps].sort(
        (left, right) =>
          snapshotComponentPriority(left) - snapshotComponentPriority(right) ||
          right.stats.mtimeMs - left.stats.mtimeMs ||
          left.path.localeCompare(right.path),
      )[0];
      if (!primary) {
        return [];
      }

      const manifest = readSnapshotManifest(group.manifest?.path);
      const createdAtMs = manifestDateMs(manifest) ?? primary.stats.mtimeMs;
      const databaseName = manifestDatabaseName(manifest) ?? inferDatabaseNameFromSnapshotName(group.stem, snapshotDatabaseNames);
      const filestore = [...group.filestores].sort((left, right) => left.path.localeCompare(right.path))[0];

      return [
        {
          name: typeof manifest?.name === 'string' && manifest.name.trim() ? manifest.name.trim() : group.stem,
          path: primary.path,
          dumpPath: primary.path,
          manifestPath: group.manifest?.path,
          databaseName,
          createdAtMs,
          createdAt: new Date(createdAtMs).toISOString(),
          mtimeMs: primary.stats.mtimeMs,
          ageMs: Math.max(0, nowMs - primary.stats.mtimeMs),
          filestorePath: filestore?.path,
          filestoreStatus: filestore ? 'found' : 'missing',
        },
      ];
    });

  snapshots.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  const newestSnapshot = snapshots[0] ?? null;

  return {
    snapshots,
    snapshotPaths: snapshots.map((snapshot) => snapshot.path),
    newestSnapshotAgeMs: newestSnapshot ? newestSnapshot.ageMs : null,
  };
}

export function restoreSnapshotPreflight(
  targetDirectory: string,
  snapshotName: string,
  requestedDatabase = 'devel',
  options: DatabaseSnapshotScanOptions = {},
): RestoreSnapshotPreflight {
  const snapshots = findDatabaseSnapshots(targetDirectory, options);
  const snapshot = snapshots.snapshots.find((candidate) => candidate.name === snapshotName || snapshotNameFromPath(candidate.path) === snapshotName);
  const snapshotDirectory = join(targetDirectory, 'backups', 'snapshots');
  const manifestPath = snapshot?.manifestPath ?? join(snapshotDirectory, `${snapshotName}.json`);
  const manifest = readSnapshotManifest(fileExists(manifestPath) ? manifestPath : undefined);
  const manifestDatabase = snapshot?.databaseName ?? manifestDatabaseName(manifest);
  const dumpPath = snapshot?.dumpPath ?? join(snapshotDirectory, `${snapshotName}.dump`);
  const filestorePath =
    snapshot?.filestorePath ??
    (typeof manifest?.filestore === 'string' ? join(snapshotDirectory, manifest.filestore) : join(snapshotDirectory, `${snapshotName}.filestore.tar.gz`));
  const dumpStatus = fileExists(dumpPath) ? 'found' : 'missing';
  const filestoreStatus = fileExists(filestorePath) ? 'found' : 'missing';
  const databaseMatches = manifestDatabase ? manifestDatabase === requestedDatabase : undefined;
  const issues: string[] = [];

  if (dumpStatus === 'missing') {
    issues.push('missing snapshot dump');
  }
  if (filestoreStatus === 'missing') {
    issues.push('missing snapshot filestore');
  }
  if (databaseMatches === false) {
    issues.push(`snapshot database mismatch: manifest has ${manifestDatabase}, requested ${requestedDatabase}`);
  }

  return {
    name: snapshotName,
    requestedDatabase,
    dumpPath,
    dumpStatus,
    filestorePath,
    filestoreStatus,
    manifestPath: fileExists(manifestPath) ? manifestPath : undefined,
    manifestDatabase,
    databaseMatches,
    issues,
  };
}

export function hasRecentDatabaseSnapshot(
  targetDirectory: string,
  options: DatabaseSnapshotRecentCheckOptions = {},
): boolean {
  const { maxAgeMs = defaultDatabaseSnapshotMaxAgeMs, ...scanOptions } = options;
  const result = findDatabaseSnapshots(targetDirectory, scanOptions);
  return result.newestSnapshotAgeMs !== null && result.newestSnapshotAgeMs <= maxAgeMs;
}

export function databaseSnapshotCatalogJson(targetDirectory: string): DatabaseSnapshotCatalogJson {
  return {
    schemaVersion: 1,
    command: 'snapshot list',
    ok: true,
    snapshots: findDatabaseSnapshots(targetDirectory).snapshots,
  };
}

export function renderDatabaseSnapshotCatalog(targetDirectory: string): string {
  const snapshots = findDatabaseSnapshots(targetDirectory).snapshots;
  if (snapshots.length === 0) {
    return 'No database snapshots found.\nNext: run ./moo snapshot [db] [snapshot-name].';
  }

  return [
    'Database snapshots',
    '',
    ...snapshots.flatMap((snapshot) => [
      `- ${snapshot.name}`,
      `  Created: ${snapshot.createdAt}`,
      `  Database: ${snapshot.databaseName ?? 'unknown'}`,
      `  Dump: ${snapshot.dumpPath}`,
      `  Filestore: ${snapshot.filestorePath ?? 'missing'} (${snapshot.filestoreStatus})`,
    ]),
  ].join('\n');
}

export function normalizeDatabaseListResult(result: DatabaseListResponse): DatabaseListResult {
  if (Array.isArray(result)) {
    return { ok: true, databases: result };
  }

  return result;
}

export async function listEnvironmentDatabases(cwd: string, options: DatabaseListOptions = {}): Promise<DatabaseListResult> {
  const queryLiteral = JSON.stringify(listDatabasesQuery);
  const command = [
    `query=${queryLiteral}`,
    '. ./scripts/lib.sh >/dev/null',
    'compose exec -T db psql -U "${POSTGRES_USER:-odoo}" -d "${POSTGRES_DB:-postgres}" -Atc "$query"',
  ].join(' && ');

  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString('utf8');
    });
    child.on('error', (error) => resolve({ ok: false, databases: [], error: error.message }));
    child.on('close', (code) => {
      resolve(
        code === 0
          ? { ok: true, databases: parseDatabaseListOutput(output, options) }
          : { ok: false, databases: [], error: errorOutput.trim() || `Database list command exited with ${code}` },
      );
    });
  });
}
