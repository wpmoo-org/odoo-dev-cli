import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execa } from 'execa';

import { detectComposeLayout, readEnvFile, selectedComposeEnvironment } from './compose-layout.js';
import { dailyActionScripts } from './daily-actions.js';
import { defaultPostgresVersion } from './external-templates.js';
import { defaultOdooVersion, markerPath } from './environment.js';
import type { SourceRepo } from './types.js';

export type DoctorCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

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

const incompatiblePostgres18MountTargets = ['/var/lib/postgresql/data', '/var/lib/postgresql/18/docker'];

function parsePostgresMajorFromValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{1,3}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/postgres:([0-9]{1,3})(?:[-._][A-Za-z0-9._-]+)?(?:@[\w:.-]+)?/i);
  return match?.[1];
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

function sourceReposFromMetadata(metadata: Record<string, unknown>): SourceRepo[] {
  const sourceRepos = metadata.sourceRepos;
  if (!Array.isArray(sourceRepos)) return [];

  return sourceRepos.map((repo, index) => {
    if (!isRecord(repo) || typeof repo.path !== 'string' || !repo.path.trim()) {
      throw new Error(`Invalid sourceRepos entry in .wpmoo/odoo.json at index ${index}`);
    }

    return {
      url: typeof repo.url === 'string' ? repo.url : '',
      path: repo.path.trim(),
      addons: Array.isArray(repo.addons) ? repo.addons.filter((addon): addon is string => typeof addon === 'string') : [],
    };
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
    const sourcePath = `odoo/custom/src/private/${repo.path}`;
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

export async function runDoctor(
  target = process.cwd(),
  runner: DoctorCommandRunner = realCommandRunner,
): Promise<string> {
  const lines = ['WPMoo doctor'];
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata = await readMetadata(target);
  lines.push(`OK metadata ${markerPath}`);

  const engine = metadataString(metadata, 'engine') ?? 'compose';
  if (engine !== 'compose') {
    errors.push(`Unsupported environment engine: ${engine}`);
  } else {
    lines.push('OK engine compose');
  }

  const odooVersion = metadataString(metadata, 'odooVersion') ?? defaultOdooVersion;
  lines.push(`OK Odoo version ${odooVersion}`);

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
    lines.push(`OK compose files ${composeLayout.files.join(', ')}`);
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
    lines.push(`OK scripts ${scriptNames.length} checked`);
  }

  const sourceRepos = sourceReposFromMetadata(metadata);
  for (const repo of sourceRepos) {
    const relativePath = `odoo/custom/src/private/${repo.path}`;
    if (!(await exists(join(target, relativePath)))) {
      errors.push(`Missing source repo path: ${relativePath}`);
    }
  }
  lines.push(`OK source repos ${sourceRepos.length} checked`);

  if (env) {
    const httpPort = validatePort('HTTP_PORT', env, errors);
    const geventPort = validatePort('GEVENT_PORT', env, errors);
    if (httpPort && geventPort && httpPort === geventPort) {
      errors.push('HTTP_PORT and GEVENT_PORT in .env must not be equal');
    }
    if (/^\d+$/.test(httpPort) && /^\d+$/.test(geventPort) && httpPort !== geventPort) {
      lines.push(`OK .env ports HTTP_PORT=${httpPort} GEVENT_PORT=${geventPort}`);
    }
  }

  try {
    await runner('docker', ['version'], { cwd: target });
    lines.push('OK docker CLI');
  } catch (error) {
    errors.push(`Docker CLI check failed: ${errorMessage(error)}`);
  }

  try {
    await runner('docker', ['compose', 'version'], { cwd: target });
    lines.push('OK docker compose');
  } catch (error) {
    errors.push(`Docker Compose check failed: ${errorMessage(error)}`);
  }

  if (sourceRepos.length > 0) {
    try {
      const result = await runner('git', ['submodule', 'status', '--recursive'], { cwd: target });
      const submoduleErrors = sourceSubmoduleStatusErrors(result.stdout, sourceRepos);
      errors.push(...submoduleErrors);
      if (submoduleErrors.length === 0) {
        lines.push(`OK git submodules ${sourceRepos.length} checked`);
      }
    } catch (error) {
      if (isNotGitCheckoutError(error)) {
        lines.push('OK git submodules skipped (not a git checkout)');
      } else {
        errors.push(`Git submodule status check failed: ${errorMessage(error)}`);
      }
    }
  }

  try {
    await runner('gh', ['auth', 'status'], { cwd: target });
    lines.push('OK GitHub CLI auth');
  } catch (error) {
    warnings.push(`WARN GitHub CLI auth: ${errorMessage(error)}`);
  }

  if (errors.length > 0) {
    throw new Error(renderFailure(errors));
  }

  lines.push(...warnings);
  lines.push('Doctor checks passed.');
  return lines.join('\n');
}
