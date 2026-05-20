import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execa } from 'execa';

import { detectComposeLayout, readEnvFile, selectedComposeEnvironment } from './compose-layout.js';
import { dailyActionScripts } from './daily-actions.js';
import { defaultPostgresVersion } from './external-templates.js';
import { defaultOdooVersion, markerPath, replaceSourceRepos } from './environment.js';
import {
  listGitmoduleSources,
  readSourceManifest,
  sourceReposFromManifest,
  sourceManifestPath,
  syncManifestFromMetadataAndGitmodules,
  writeSourceManifest,
  type SourceManifestEntry,
  type SourceModuleLocation,
} from './source-manifest.js';
import type { SourceRepo } from './types.js';

export type DoctorCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

export type DoctorCommandOptions = {
  fix?: boolean;
  postgres?: boolean;
};

export type DoctorPostgresDiagnostics = {
  databaseCount?: number;
  activeConnections?: number;
  totalDatabaseSizeBytes?: number;
  slowQueryLogging?: string;
  pgStatStatements?: string;
  sharedBuffers?: string;
};

export type DoctorPostgresReport = {
  requested: true;
  available: boolean;
  diagnostics: DoctorPostgresDiagnostics;
  warning?: string;
};

export type DoctorReport = {
  schemaVersion: 1;
  command: 'doctor';
  ok: boolean;
  target: string;
  checks: string[];
  warnings: string[];
  errors: string[];
  appliedFixes: string[];
  postgres?: DoctorPostgresReport;
};

const realCommandRunner: DoctorCommandRunner = async (command, args, options) => {
  const result = await execa(command, args, { cwd: options.cwd });
  return { stdout: result.stdout, stderr: result.stderr };
};

async function exists(path: string): Promise<boolean> {
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

function commandErrorText(error: unknown): string {
  const parts = [errorMessage(error)];
  if (isRecord(error)) {
    for (const key of ['stderr', 'stdout']) {
      const value = error[key];
      if (typeof value === 'string' && value.trim()) {
        parts.push(value.trim());
      }
    }
  }
  return parts.join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDoctorOptions(value: DoctorCommandRunner | DoctorCommandOptions): value is DoctorCommandOptions {
  return isRecord(value);
}

function isMetadataError(message: string): boolean {
  return (
    message.startsWith('Missing metadata file:') ||
    message.startsWith('Invalid metadata JSON in .wpmoo/odoo.json') ||
    message.startsWith('Invalid sourceRepos entry in .wpmoo/odoo.json')
  );
}

const incompatiblePostgres18MountTargets = ['/var/lib/postgresql/data', '/var/lib/postgresql/18/docker'];
const postgresDiagnosticQuery = `
WITH metrics(metric, value) AS (
  SELECT 'database_count', count(*)::text
    FROM pg_database
    WHERE datistemplate = false
  UNION ALL
  SELECT 'active_connections', count(*)::text
    FROM pg_stat_activity
    WHERE datname IS NOT NULL
      AND state = 'active'
  UNION ALL
  SELECT 'total_database_size_bytes', COALESCE(sum(pg_database_size(datname)), 0)::text
    FROM pg_database
    WHERE datistemplate = false
  UNION ALL
  SELECT 'slow_query_logging', COALESCE(
    (SELECT setting || unit FROM pg_settings WHERE name = 'log_min_duration_statement'),
    'unavailable'
  )
  UNION ALL
  SELECT 'pg_stat_statements',
    CASE
      WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN 'installed'
      WHEN EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') THEN 'available'
      ELSE 'unavailable'
    END
  UNION ALL
  SELECT 'shared_buffers', COALESCE(
    (SELECT setting FROM pg_settings WHERE name = 'shared_buffers'),
    'unavailable'
  )
)
SELECT metric || '|' || value
FROM metrics
ORDER BY CASE metric
  WHEN 'database_count' THEN 1
  WHEN 'active_connections' THEN 2
  WHEN 'total_database_size_bytes' THEN 3
  WHEN 'slow_query_logging' THEN 4
  WHEN 'pg_stat_statements' THEN 5
  WHEN 'shared_buffers' THEN 6
  ELSE 99
END;
`.trim();

const postgresDiagnosticKeys = [
  'database_count',
  'active_connections',
  'total_database_size_bytes',
  'slow_query_logging',
  'pg_stat_statements',
  'shared_buffers',
] as const;

type PostgresDiagnosticKey = (typeof postgresDiagnosticKeys)[number];

function parsePostgresMajorFromValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{1,3}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/postgres:([0-9]{1,3})(?:[-._][A-Za-z0-9._-]+)?(?:@[\w:.-]+)?/i);
  return match?.[1];
}

function parsePostgresDiagnostics(output: string): Partial<Record<PostgresDiagnosticKey, string>> {
  const diagnostics: Partial<Record<PostgresDiagnosticKey, string>> = {};
  const allowedKeys = new Set<string>(postgresDiagnosticKeys);

  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separatorIndex = line.indexOf('|');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (allowedKeys.has(key) && value) {
      diagnostics[key as PostgresDiagnosticKey] = value;
    }
  }

  return diagnostics;
}

function renderPostgresDiagnostics(diagnostics: Partial<Record<PostgresDiagnosticKey, string>>): string | undefined {
  const parts = postgresDiagnosticKeys.flatMap((key) => {
    const value = diagnostics[key];
    return value ? [`${key}=${value}`] : [];
  });

  return parts.length > 0 ? `OK PostgreSQL diagnostics ${parts.join(' ')}` : undefined;
}

function integerDiagnostic(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/u.test(value)) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

function structuredPostgresDiagnostics(
  diagnostics: Partial<Record<PostgresDiagnosticKey, string>>,
): DoctorPostgresDiagnostics {
  const structured: DoctorPostgresDiagnostics = {};
  const databaseCount = integerDiagnostic(diagnostics.database_count);
  const activeConnections = integerDiagnostic(diagnostics.active_connections);
  const totalDatabaseSizeBytes = integerDiagnostic(diagnostics.total_database_size_bytes);

  if (databaseCount !== undefined) structured.databaseCount = databaseCount;
  if (activeConnections !== undefined) structured.activeConnections = activeConnections;
  if (totalDatabaseSizeBytes !== undefined) structured.totalDatabaseSizeBytes = totalDatabaseSizeBytes;
  if (diagnostics.slow_query_logging) structured.slowQueryLogging = diagnostics.slow_query_logging;
  if (diagnostics.pg_stat_statements) structured.pgStatStatements = diagnostics.pg_stat_statements;
  if (diagnostics.shared_buffers) structured.sharedBuffers = diagnostics.shared_buffers;

  return structured;
}

async function readPostgresDiagnostics(
  target: string,
  runner: DoctorCommandRunner,
): Promise<Partial<Record<PostgresDiagnosticKey, string>>> {
  const queryLiteral = JSON.stringify(postgresDiagnosticQuery);
  const command = [
    `query=${queryLiteral}`,
    '. ./scripts/lib.sh >/dev/null',
    'compose exec -T db psql -X -q -t -A -U "${POSTGRES_USER:-odoo}" -d "${POSTGRES_DB:-postgres}" -c "$query"',
  ].join(' && ');
  const result = await runner('bash', ['-lc', command], { cwd: target });
  return parsePostgresDiagnostics(result.stdout);
}

function stripInlineComment(line: string): string {
  const hashIndex = line.indexOf('#');
  if (hashIndex === -1) return line;
  return line.slice(0, hashIndex);
}

function hasInvalidPostgres18Mount(line: string, mountTarget: string): boolean {
  const escaped = mountTarget.replaceAll('.', '\\.').replaceAll('/', '\\/');
  const shortPatterns = [
    new RegExp(`^\\s*-\\s+.+:\\s*['"]?${escaped}['"]?(?:\\s|:|$)`),
    new RegExp(`^\\s*-\\s*['"]?${escaped}['"]?(?:\\s|$)`),
    new RegExp(`^\\s*target:\\s*['"]?${escaped}['"]?(?:\\s|$)`),
  ];
  return shortPatterns.some((pattern) => pattern.test(line));
}

function isNonAmbiguousLineForMountFix(line: string, mountTarget: string): boolean {
  return hasInvalidPostgres18Mount(line, mountTarget);
}

function replaceMountTargetInLine(line: string, from: string, to: string): string {
  return line.split(from).join(to);
}

function normalizePostgres18MountTargetsInComposeContent(content: string): {
  content: string;
  fixed: string[];
  fixedTargets: string[];
} {
  const fixedTargets: string[] = [];
  const fixed: string[] = [];
  const hasTrailingNewline = content.endsWith('\n');
  const comparableContent = hasTrailingNewline ? content.slice(0, -1) : content;
  const lines = comparableContent.split(/\r?\n/);
  const nextLines: string[] = [];

  for (const line of lines) {
    const commentIndex = line.indexOf('#');
    const comment = commentIndex === -1 ? '' : line.slice(commentIndex);
    const body = commentIndex === -1 ? line : line.slice(0, commentIndex);
    let nextBody = body;
    let lineFixed = false;

    for (const target of incompatiblePostgres18MountTargets) {
      if (!isNonAmbiguousLineForMountFix(body, target)) continue;
      nextBody = replaceMountTargetInLine(nextBody, target, '/var/lib/postgresql');
      if (!fixedTargets.includes(target)) {
        fixedTargets.push(target);
      }
      lineFixed = true;
    }

    if (lineFixed) {
      fixed.push(line);
      nextLines.push(`${nextBody}${comment}`);
    } else {
      nextLines.push(line);
    }
  }

  return {
    content: `${nextLines.join('\n')}${hasTrailingNewline ? '\n' : ''}`,
    fixed,
    fixedTargets,
  };
}

function invalidPostgres18MountTargetsInCompose(content: string): string[] {
  const badTargets = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;
    for (const target of incompatiblePostgres18MountTargets) {
      if (hasInvalidPostgres18Mount(line, target)) {
        badTargets.add(target);
      }
    }
  }
  return [...badTargets];
}

function inferPostgresVersion(
  metadata: Record<string, unknown>,
  odooVersion: string,
  env?: Map<string, string>,
): string {
  const envPostgresImage = env?.get('POSTGRES_IMAGE')?.trim();
  const envPostgresMajor = parsePostgresMajorFromValue(envPostgresImage);
  if (envPostgresMajor) {
    return envPostgresMajor;
  }

  const explicitPostgres = parsePostgresMajorFromValue(metadataString(metadata, 'postgresVersion'));
  if (explicitPostgres) {
    return explicitPostgres;
  }

  return defaultPostgresVersion(odooVersion);
}

function normalizeSourceType(value: unknown): NonNullable<SourceRepo['sourceType']> {
  if (value === 'oca' || value === 'external' || value === 'private') {
    return value;
  }
  return 'private';
}

function sourceRepoPath(type: string, path: string): string {
  return `odoo/custom/src/${type}/${path}`;
}

function entryKey(type: string, path: string): string {
  return `${type}:${path}`;
}

function sourceReposFromMetadata(metadata: Record<string, unknown>): SourceRepo[] {
  const sourceRepos = metadata.sourceRepos;
  if (!Array.isArray(sourceRepos)) return [];

  return sourceRepos
    .map((repo, index) => {
      if (!isRecord(repo) || typeof repo.path !== 'string' || !repo.path.trim()) {
        throw new Error(`Invalid sourceRepos entry in .wpmoo/odoo.json at index ${index}`);
      }

      return {
        url: typeof repo.url === 'string' ? repo.url : '',
        path: repo.path.trim(),
        addons: Array.isArray(repo.addons)
          ? repo.addons.filter((addon): addon is string => typeof addon === 'string')
          : [],
        sourceType: normalizeSourceType(repo.sourceType),
      } satisfies SourceRepo;
    })
    .filter((repo) => repo.path)
    .sort((left, right) => {
      const typeOrder = left.sourceType.localeCompare(right.sourceType);
      if (typeOrder !== 0) return typeOrder;
      return left.path.localeCompare(right.path);
    });
}

async function readMetadata(target: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(join(target, markerPath), 'utf8');
  } catch {
    throw new Error(`Missing metadata file: ${markerPath}`);
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('metadata is not an object');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid metadata JSON in ${markerPath}: ${errorMessage(error)}`);
  }
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validatePort(name: 'HTTP_PORT' | 'GEVENT_PORT', env: Map<string, string>, errors: string[]): string {
  const value = env.get(name)?.trim() ?? '';
  if (!/^\d+$/.test(value)) {
    errors.push(`Invalid ${name} in .env: expected a non-empty numeric value`);
  }
  return value;
}

function renderFailure(errors: string[]): string {
  return ['WPMoo doctor failed:', ...errors.map((error) => `- ${error}`)].join('\n');
}

function isNotGitCheckoutError(error: unknown): boolean {
  return commandErrorText(error).toLowerCase().includes('not a git repository');
}

function isSourceRepoSubmodule(path: string, sourceRepos: SourceRepo[]): boolean {
  return sourceRepos.some((repo) => {
    const sourcePath = sourceRepoPath(repo.sourceType ?? 'private', repo.path);
    return path === sourcePath || path.startsWith(`${sourcePath}/`);
  });
}

function sourceSubmoduleStatusErrors(output: string, sourceRepos: SourceRepo[]): string[] {
  const errors: string[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const status = line[0];
    const parts = line.slice(1).trim().split(/\s+/);
    const path = parts[1];
    if (!path || !isSourceRepoSubmodule(path, sourceRepos)) continue;

    if (status === '-') {
      errors.push(`Uninitialized Git submodule: ${path}`);
    } else if (status === 'U') {
      errors.push(`Conflicted Git submodule: ${path}`);
    }
  }

  return errors;
}

function manifestEntryToKey(entry: { type: string; path: string }): string {
  return entryKey(entry.type, entry.path);
}

function manifestRepoToKey(repo: SourceRepo): string {
  return entryKey(normalizeSourceType(repo.sourceType), repo.path);
}

function formatKeyForPath(key: string): string {
  const [sourceType, ...pathParts] = key.split(':');
  return sourceRepoPath(sourceType, pathParts.join(':'));
}

function checkSourceConsistency(
  sourceRepos: SourceRepo[],
  manifestEntries: SourceManifestEntry[],
  gitmoduleSources: SourceModuleLocation[],
  manifestExists: boolean,
  gitmodulesExists: boolean,
): string[] {
  if (!manifestExists) {
    return [];
  }

  const errors: string[] = [];
  const metadataEntries = new Map<string, SourceRepo>();
  for (const repo of sourceRepos) {
    metadataEntries.set(manifestRepoToKey(repo), repo);
  }

  const manifestMap = new Map<string, SourceManifestEntry>();
  for (const entry of manifestEntries) {
    manifestMap.set(manifestEntryToKey(entry), entry);
  }

  const gitmoduleSet = new Set(
    gitmoduleSources.map((source) => manifestEntryToKey({ type: source.type, path: source.path })),
  );

  const sortedMetadataKeys = [...metadataEntries.keys()].sort();
  const sortedManifestKeys = [...manifestMap.keys()].sort();

  for (const key of sortedMetadataKeys) {
    if (!manifestMap.has(key)) {
      errors.push(`Metadata source entry missing in manifest: ${formatKeyForPath(key)}`);
    }
  }

  for (const key of sortedManifestKeys) {
    if (!metadataEntries.has(key)) {
      errors.push(`Manifest source entry missing in metadata: ${formatKeyForPath(key)}`);
    }

    if (gitmodulesExists && !gitmoduleSet.has(key)) {
      errors.push(`Manifest source path missing in .gitmodules: ${formatKeyForPath(key)}`);
    }
  }

  return errors;
}

async function repairSourceManifestFromDiscoveredState(
  target: string,
  sourceRepos: SourceRepo[],
  fallbackBranch: string,
  gitmoduleSources: SourceModuleLocation[],
): Promise<void> {
  const entries = syncManifestFromMetadataAndGitmodules(sourceRepos, fallbackBranch, gitmoduleSources);
  await writeSourceManifest(target, entries);
  await replaceSourceRepos(target, sourceReposFromManifest(entries));
}

export async function getDoctorReport(
  target = process.cwd(),
  runnerOrOptions: DoctorCommandRunner | DoctorCommandOptions = realCommandRunner,
  options: DoctorCommandOptions = {},
): Promise<DoctorReport> {
  const actualRunner = isDoctorOptions(runnerOrOptions) ? realCommandRunner : runnerOrOptions;
  const actualOptions = isDoctorOptions(runnerOrOptions) ? runnerOrOptions : options;
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: string[] = [];
  const appliedFixes: string[] = [];

  const report: DoctorReport = {
    schemaVersion: 1,
    command: 'doctor',
    ok: false,
    target,
    checks,
    warnings,
    errors,
    appliedFixes,
  };

  let metadata: Record<string, unknown>;
  try {
    metadata = await readMetadata(target);
  } catch (error) {
    errors.push(errorMessage(error));
    return report;
  }

  checks.push(`OK metadata ${markerPath}`);

  const engine = metadataString(metadata, 'engine') ?? 'compose';
  if (engine !== 'compose') {
    errors.push(`Unsupported environment engine: ${engine}`);
  } else {
    checks.push('OK engine compose');
  }

  const odooVersion = metadataString(metadata, 'odooVersion') ?? defaultOdooVersion;
  checks.push(`OK Odoo version ${odooVersion}`);

  const env = await readEnvFile(target);
  const composeVersions = new Set([odooVersion]);
  const envOdooVersion = env?.get('ODOO_VERSION')?.trim();
  if (envOdooVersion) {
    composeVersions.add(envOdooVersion);
  }

  const composeLayout = await detectComposeLayout(target, {
    odooVersions: [...composeVersions],
    envName: selectedComposeEnvironment(env),
  });
  if (composeLayout.kind === 'missing') {
    errors.push(...composeLayout.errors);
  } else {
    checks.push(`OK compose files ${composeLayout.files.join(', ')}`);
    const postgresVersion = inferPostgresVersion(metadata, odooVersion, env);
    if (postgresVersion === '18') {
      for (const file of composeLayout.files) {
        const composePath = join(target, file);
        let content: string;
        try {
          content = await readFile(composePath, 'utf8');
        } catch (error) {
          errors.push(`Cannot read compose file for compatibility check: ${file}: ${errorMessage(error)}`);
          continue;
        }

        if (actualOptions.fix) {
          const normalization = normalizePostgres18MountTargetsInComposeContent(content);
          if (normalization.fixed.length > 0) {
            await writeFile(composePath, normalization.content, 'utf8');
            for (const target of normalization.fixedTargets) {
              appliedFixes.push(
                `Normalized PostgreSQL 18 mount target in '${file}': replaced '${target}' -> '/var/lib/postgresql'`,
              );
            }
            continue;
          }
        }

        const badMounts = invalidPostgres18MountTargetsInCompose(content);
        for (const badMount of badMounts) {
          errors.push(
            `PostgreSQL 18 compatibility issue in '${file}': mount target '${badMount}' is invalid; recommend using '/var/lib/postgresql'`,
          );
        }
      }
    }
  }

  const scriptNames = Object.values(dailyActionScripts);
  const scriptErrorCount = errors.length;
  for (const script of scriptNames) {
    const relativePath = `scripts/${script}`;
    if (!(await exists(join(target, relativePath)))) {
      errors.push(`Missing daily action script: ${relativePath}`);
    }
  }
  if (errors.length === scriptErrorCount) {
    checks.push(`OK scripts ${scriptNames.length} checked`);
  }

  let sourceRepos: SourceRepo[];
  try {
    sourceRepos = sourceReposFromMetadata(metadata);
  } catch (error) {
    errors.push(errorMessage(error));
    return report;
  }
  for (const repo of sourceRepos) {
    const relativePath = sourceRepoPath(normalizeSourceType(repo.sourceType), repo.path);
    if (!(await exists(join(target, relativePath))) && repo.path) {
      errors.push(`Missing source repo path: ${relativePath}`);
    }
  }
  checks.push(`OK source repos ${sourceRepos.length} checked`);

  const manifestPath = join(target, sourceManifestPath);
  const hasManifest = await exists(manifestPath);
  let manifestEntries: SourceManifestEntry[] = [];
  let manifestReadError: string | undefined;
  if (hasManifest) {
    try {
      manifestEntries = (await readSourceManifest(target)).sources;
    } catch (error) {
      manifestReadError = `Failed to read source manifest ${sourceManifestPath}: ${errorMessage(error)}`;
      if (!actualOptions.fix) {
        errors.push(manifestReadError);
      }
    }
  }

  const gitmoduleSources = await listGitmoduleSources(target);
  const hasGitmodules = await exists(join(target, '.gitmodules'));
  const sourceConsistencyIssues: string[] = !manifestReadError
    ? checkSourceConsistency(sourceRepos, manifestEntries, gitmoduleSources, hasManifest, hasGitmodules)
    : [];

  const shouldSyncSources =
    actualOptions.fix &&
    (manifestReadError || sourceConsistencyIssues.length > 0 || (!hasManifest && (sourceRepos.length > 0 || gitmoduleSources.length > 0)));

  if (sourceConsistencyIssues.length > 0) {
    if (actualOptions.fix) {
      const uniqueIssues = [...new Set(sourceConsistencyIssues)];
      appliedFixes.push(...uniqueIssues.map((issue) => `Will regenerate source manifest and metadata to fix: ${issue}`));
    } else {
      errors.push(...sourceConsistencyIssues);
    }
  } else if (manifestReadError) {
    appliedFixes.push('Will regenerate source manifest and metadata after repairing source manifest read failure.');
  } else if (shouldSyncSources) {
    appliedFixes.push('Will create missing source manifest from metadata and .gitmodules state.');
  }

  if (shouldSyncSources && actualOptions.fix) {
    await repairSourceManifestFromDiscoveredState(target, sourceRepos, odooVersion, gitmoduleSources);
    appliedFixes.push('Synced source manifest and metadata with current metadata/.gitmodules state.');
  }

  if (env) {
    const httpPort = validatePort('HTTP_PORT', env, errors);
    const geventPort = validatePort('GEVENT_PORT', env, errors);
    if (httpPort && geventPort && httpPort === geventPort) {
      errors.push('HTTP_PORT and GEVENT_PORT in .env must not be equal');
    }
    if (/^\d+$/.test(httpPort) && /^\d+$/.test(geventPort) && httpPort !== geventPort) {
      checks.push(`OK .env ports HTTP_PORT=${httpPort} GEVENT_PORT=${geventPort}`);
    }
  }

  if (actualOptions.postgres) {
    try {
      const postgresDiagnostics = await readPostgresDiagnostics(target, actualRunner);
      const renderedPostgresDiagnostics = renderPostgresDiagnostics(postgresDiagnostics);
      if (renderedPostgresDiagnostics) {
        checks.push(renderedPostgresDiagnostics);
        report.postgres = {
          requested: true,
          available: true,
          diagnostics: structuredPostgresDiagnostics(postgresDiagnostics),
        };
      } else {
        const warning = 'no diagnostic rows returned';
        warnings.push(`PostgreSQL diagnostics unavailable: ${warning}`);
        report.postgres = {
          requested: true,
          available: false,
          diagnostics: {},
          warning,
        };
      }
    } catch (error) {
      const warning = errorMessage(error);
      warnings.push(`PostgreSQL diagnostics unavailable: ${warning}`);
      report.postgres = {
        requested: true,
        available: false,
        diagnostics: {},
        warning,
      };
    }
  }

  try {
    await actualRunner('docker', ['version'], { cwd: target });
    checks.push('OK docker CLI');
  } catch (error) {
    errors.push(`Docker CLI check failed: ${errorMessage(error)}`);
  }

  try {
    await actualRunner('docker', ['compose', 'version'], { cwd: target });
    checks.push('OK docker compose');
  } catch (error) {
    errors.push(`Docker Compose check failed: ${errorMessage(error)}`);
  }

  if (sourceRepos.length > 0) {
    try {
      const result = await actualRunner('git', ['submodule', 'status', '--recursive'], { cwd: target });
      const submoduleErrors = sourceSubmoduleStatusErrors(result.stdout, sourceRepos);
      errors.push(...submoduleErrors);
      if (submoduleErrors.length === 0) {
        checks.push(`OK git submodules ${sourceRepos.length} checked`);
      }
    } catch (error) {
      if (isNotGitCheckoutError(error)) {
        checks.push('OK git submodules skipped (not a git checkout)');
      } else {
        errors.push(`Git submodule status check failed: ${errorMessage(error)}`);
      }
    }
  }

  try {
    await actualRunner('gh', ['auth', 'status'], { cwd: target });
    checks.push('OK GitHub CLI auth');
  } catch (error) {
    warnings.push(`GitHub CLI auth: ${errorMessage(error)}`);
  }

  report.ok = errors.length === 0;
  return report;
}

export async function runDoctor(
  target = process.cwd(),
  runnerOrOptions: DoctorCommandRunner | DoctorCommandOptions = realCommandRunner,
  options: DoctorCommandOptions = {},
): Promise<string> {
  const report = await getDoctorReport(target, runnerOrOptions, options);
  const actualRunner = isDoctorOptions(runnerOrOptions) ? realCommandRunner : runnerOrOptions;
  const actualOptions = isDoctorOptions(runnerOrOptions) ? runnerOrOptions : options;

  if (!report.ok) {
    if (report.errors.some(isMetadataError)) {
      throw new Error(report.errors[0]);
    }
    if (actualOptions.fix && report.appliedFixes.length > 0) {
      return [
        'Doctor auto-fixes were not enough to satisfy all checks.',
        ...report.appliedFixes.map((fix) => `- ${fix}`),
        renderFailure(report.errors),
      ].join('\n');
    }

    throw new Error(renderFailure(report.errors));
  }

  const renderedReport = [
    'WPMoo doctor',
    ...report.checks,
    ...report.warnings.map((warning) => `WARN ${warning}`),
    'Doctor checks passed.',
  ];

  if (report.appliedFixes.length > 0) {
    const postFixReport = await runDoctor(target, actualRunner, { ...actualOptions, fix: false });
    return [
      'Applied safe doctor fixes:',
      ...report.appliedFixes.map((fix) => `- ${fix}`),
      '',
      postFixReport,
    ].join('\n');
  }

  return renderedReport.join('\n');
}
