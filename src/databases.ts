import { spawn } from 'node:child_process';

export type DatabaseListOptions = {
  includeMaintenance?: boolean;
};

export type DatabaseListResult =
  | { ok: true; databases: string[] }
  | { ok: false; databases: []; error?: string };

export type DatabaseListResponse = string[] | DatabaseListResult;

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
