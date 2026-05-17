import { spawn } from 'node:child_process';

export type DatabaseListOptions = {
  includeMaintenance?: boolean;
};

const maintenanceDatabases = new Set(['postgres']);
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

export async function listEnvironmentDatabases(cwd: string, options: DatabaseListOptions = {}): Promise<string[]> {
  const queryLiteral = JSON.stringify(listDatabasesQuery);
  const command = [
    `query=${queryLiteral}`,
    '. ./scripts/lib.sh >/dev/null',
    'compose exec -T db psql -U "${POSTGRES_USER:-odoo}" -d "${POSTGRES_DB:-postgres}" -Atc "$query"',
  ].join(' && ');

  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.on('error', () => resolve([]));
    child.on('close', (code) => {
      resolve(code === 0 ? parseDatabaseListOutput(output, options) : []);
    });
  });
}
