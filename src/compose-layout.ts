import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type ComposeLayout =
  | {
      kind: 'compact';
      envName: string;
      files: string[];
      missingFiles: [];
      errors: [];
    }
  | {
      kind: 'legacy';
      files: string[];
      missingFiles: [];
      errors: [];
    }
  | {
      kind: 'missing';
      files: [];
      missingFiles: string[];
      errors: string[];
    };

export type ComposeLayoutOptions = {
  odooVersions: string[];
  envName?: string;
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function parseEnvContent(content: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }

  return values;
}

export async function readEnvFile(target: string): Promise<Map<string, string> | undefined> {
  const path = join(target, '.env');
  if (!(await exists(path))) return undefined;
  return parseEnvContent(await readFile(path, 'utf8'));
}

export function selectedComposeEnvironment(env?: Map<string, string>): string {
  return env?.get('WPMOO_ENV')?.trim() || 'dev';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()).map((value) => value.trim()))];
}

function isValidComposeEnvironmentName(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function compactOverlayError(envName: string, overlayFile: string): string {
  if (envName === 'dev') return `Missing compact compose overlay: ${overlayFile}`;
  return `Missing compact compose overlay for WPMOO_ENV=${envName}: ${overlayFile}`;
}

export async function detectComposeLayout(
  target: string,
  options: ComposeLayoutOptions,
): Promise<ComposeLayout> {
  const envName = options.envName?.trim() || 'dev';
  if (!isValidComposeEnvironmentName(envName)) {
    return {
      kind: 'missing',
      files: [],
      missingFiles: [],
      errors: [`Invalid WPMOO_ENV in .env: expected a simple compose overlay name, got ${envName}`],
    };
  }

  const compactBase = 'compose.yaml';
  const compactOverlay = `compose/${envName}.yaml`;
  const hasCompactBase = await exists(join(target, compactBase));
  const hasCompactOverlay = await exists(join(target, compactOverlay));

  if (hasCompactBase && hasCompactOverlay) {
    return {
      kind: 'compact',
      envName,
      files: [compactBase, compactOverlay],
      missingFiles: [],
      errors: [],
    };
  }

  if (hasCompactBase || hasCompactOverlay) {
    const errors: string[] = [];
    const missingFiles: string[] = [];
    if (!hasCompactBase) {
      missingFiles.push(compactBase);
      errors.push(`Missing compact compose base: ${compactBase}`);
    }
    if (!hasCompactOverlay) {
      missingFiles.push(compactOverlay);
      errors.push(compactOverlayError(envName, compactOverlay));
    }
    return { kind: 'missing', files: [], missingFiles, errors };
  }

  const legacyFiles = uniqueStrings(options.odooVersions).map((version) => `docker-compose_${version}.yml`);
  const missingLegacyFiles: string[] = [];
  for (const file of legacyFiles) {
    if (!(await exists(join(target, file)))) {
      missingLegacyFiles.push(file);
    }
  }

  if (legacyFiles.length > 0 && missingLegacyFiles.length === 0) {
    return { kind: 'legacy', files: legacyFiles, missingFiles: [], errors: [] };
  }

  return {
    kind: 'missing',
    files: [],
    missingFiles: missingLegacyFiles,
    errors:
      legacyFiles.length > 0
        ? missingLegacyFiles.map((file) => `Missing compose file: ${file}`)
        : ['Missing compose layout: expected compose.yaml with compose/dev.yaml or a versioned docker-compose file'],
  };
}
