import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SourceRepo, SourceRepoType } from './types.js';
import { isValidPathSegment, validateRepoPath } from './path-validation.js';

const validSourceTypes = ['private', 'oca', 'external'] as const;

export type SourceManifestEntry = {
  type: SourceRepoType;
  path: string;
  url: string;
  branch?: string;
  addons: string[];
};

export type SourceManifest = {
  sources: SourceManifestEntry[];
};

export type SourceModuleLocation = {
  type: SourceRepoType;
  path: string;
  url: string;
};

export const sourceManifestPath = 'odoo/custom/manifests/sources.yaml';

function fail(message: string): never {
  throw new Error(`Invalid source manifest ${sourceManifestPath}: ${message}`);
}

export function normalizeSourceType(value: string | undefined): SourceRepoType {
  return validSourceTypes.includes(value as SourceRepoType) ? (value as SourceRepoType) : 'private';
}

function dedupeAndSort(entries: SourceManifestEntry[]): SourceManifestEntry[] {
  const uniqueByTypePath = new Map<string, SourceManifestEntry>();
  for (const entry of entries) {
    uniqueByTypePath.set(`${entry.type}:${entry.path}`, entry);
  }

  return [...uniqueByTypePath.values()].sort((left, right) => {
    const typeOrder = left.type.localeCompare(right.type);
    if (typeOrder !== 0) return typeOrder;
    return left.path.localeCompare(right.path);
  });
}

function stripInlineComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === '#' && !inSingle && !inDouble) {
      return raw.slice(0, index).trimEnd();
    }
  }

  return raw;
}

function parseScalar(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'");
  }
  return trimmed;
}

function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

function parseSourcesBlock(content: string): SourceManifest {
  const lines = content.split(/\r?\n/).map((line, index) => ({
    lineNumber: index + 1,
    line: line.replace(/\t/g, '  '),
    trimmedLine: line.replace(/\t/g, '  ').trim(),
  }));

  const sourcesKeywordLine = lines.find((line) =>
    /^\s*sources\s*:\s*(?:\[[^\]]*\])?\s*$/.test(stripInlineComment(line.line)),
  );
  if (!sourcesKeywordLine) {
    fail('Missing top-level sources entry.');
  }

  const rawSourcesValue = stripInlineComment(sourcesKeywordLine.line).replace(/^\s*sources\s*:\s*/, '');
  if (rawSourcesValue === '[]') {
    return { sources: [] };
  }
  if (rawSourcesValue && rawSourcesValue !== '') {
    fail(`Unexpected non-list value on line ${sourcesKeywordLine.lineNumber}: sources`);
  }

  const sourceLines = lines.slice(sourcesKeywordLine.lineNumber);
  const parsed: SourceManifestEntry[] = [];
  let index = 0;
  while (index < sourceLines.length) {
    const headerLine = sourceLines[index];
    const noCommentHeader = stripInlineComment(headerLine.line);
    if (!noCommentHeader.trim()) {
      index += 1;
      continue;
    }

    const itemMatch = /^\s*-\s*type:\s*(.+)\s*$/.exec(noCommentHeader);
    if (!itemMatch) {
      index += 1;
      continue;
    }

    const item: SourceManifestEntry = {
      type: normalizeSourceType(parseScalar(itemMatch[1])),
      path: '',
      url: '',
      addons: [],
    };

    index += 1;
    while (index < sourceLines.length) {
      const rawLine = sourceLines[index];
      const noComment = stripInlineComment(rawLine.line);
      const trimmed = noComment.trim();
      if (!trimmed) {
        index += 1;
        continue;
      }

      if (/^\s*-\s*type:\s*/.test(noComment)) {
        break;
      }

      const pathMatch = /^\s*path:\s*(.+)\s*$/.exec(noComment);
      if (pathMatch) {
        item.path = validateRepoPath(parseScalar(pathMatch[1]));
        index += 1;
        continue;
      }

      const urlMatch = /^\s*url:\s*(.+)\s*$/.exec(noComment);
      if (urlMatch) {
        item.url = parseScalar(urlMatch[1]);
        index += 1;
        continue;
      }

      const branchMatch = /^\s*branch:\s*(.+)\s*$/.exec(noComment);
      if (branchMatch) {
        item.branch = parseScalar(branchMatch[1]);
        index += 1;
        continue;
      }

      const addonsLine = /^\s*addons:\s*$/.exec(noComment);
      if (addonsLine) {
        const baseIndent = leadingSpaces(rawLine.line) + 2;
        index += 1;
        while (index < sourceLines.length) {
          const addonRaw = stripInlineComment(sourceLines[index].line);
          const addonTrimmed = addonRaw.trim();
          if (!addonTrimmed) {
            index += 1;
            continue;
          }

          const addonMatch = /^\s*-\s*(.+)\s*$/.exec(addonRaw);
          if (!addonMatch) {
            break;
          }
          if (leadingSpaces(addonRaw) < baseIndent) {
            break;
          }

          const addon = parseScalar(addonMatch[1]);
          if (addon) {
            item.addons.push(addon);
          }
          index += 1;
        }
        continue;
      }

      fail(`Unexpected source entry field on line ${rawLine.lineNumber}: ${trimmed}`);
    }

    if (!item.path) {
      fail(`Manifest entry missing path at line ${headerLine.lineNumber}`);
    }
    if (!item.url) {
      fail(`Manifest entry missing url for ${item.type}:${item.path} at line ${headerLine.lineNumber}`);
    }
    if (!isValidPathSegment(item.path)) {
      fail(`Invalid manifest path at line ${headerLine.lineNumber}: ${item.path}`);
    }

    if (item.addons.length === 0) {
      item.addons.push(item.path);
    }
    item.addons = [...new Set(item.addons.map((addon) => validateRepoPath(addon)))].sort();
    parsed.push(item);
  }

  return { sources: dedupeAndSort(parsed.filter((entry) => isValidPathSegment(entry.path))) };
}

export async function readSourceManifest(target: string): Promise<SourceManifest> {
  try {
    const content = await readFile(join(target, sourceManifestPath), 'utf8');
    return parseSourcesBlock(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { sources: [] };
    }
    throw error;
  }
}

function renderQuoted(value: string): string {
  return JSON.stringify(value);
}

export function renderSourceManifest(entries: SourceManifestEntry[]): string {
  const normalized = dedupeAndSort(entries).map((entry) => {
    const addons = [...new Set(entry.addons.map((addon) => validateRepoPath(addon)))].sort();
    return {
      type: entry.type,
      path: validateRepoPath(entry.path),
      url: entry.url.trim(),
      branch: entry.branch?.trim(),
      addons: addons.length ? addons : [validateRepoPath(entry.path)],
    };
  });

  if (normalized.length === 0) {
    return 'sources: []\n';
  }

  const body = normalized
    .map((entry) => {
      const lines: string[] = [
        `  - type: ${renderQuoted(entry.type)}`,
        `    path: ${renderQuoted(entry.path)}`,
        `    url: ${renderQuoted(entry.url)}`,
      ];
      lines.push(`    branch: ${renderQuoted(entry.branch ?? '')}`);
      lines.push('    addons:');
      for (const addon of entry.addons) {
        lines.push(`      - ${renderQuoted(addon)}`);
      }
      return lines.join('\n');
    })
    .join('\n');

  return `sources:\n${body}\n`;
}

export async function writeSourceManifest(target: string, entries: SourceManifestEntry[]): Promise<void> {
  const content = renderSourceManifest(entries);
  const path = join(target, sourceManifestPath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function entryKey(type: SourceRepoType, path: string): string {
  return `${type}:${path}`;
}

export async function upsertSourceManifestEntry(target: string, entry: SourceManifestEntry): Promise<void> {
  const manifest = await readSourceManifest(target);
  const normalized = {
    ...entry,
    type: normalizeSourceType(entry.type),
    path: validateRepoPath(entry.path),
  };

  const next = dedupeAndSort(manifest.sources.filter((current) => entryKey(current.type, current.path) !== entryKey(normalized.type, normalized.path)));
  next.push(normalized);
  await writeSourceManifest(target, next);
}

export async function removeSourceManifestEntry(target: string, type: SourceRepoType, path: string): Promise<void> {
  const manifest = await readSourceManifest(target);
  const key = entryKey(normalizeSourceType(type), validateRepoPath(path));
  const next = manifest.sources.filter((entry) => entryKey(entry.type, entry.path) !== key);
  await writeSourceManifest(target, next);
}

export function sourceManifestEntriesFromMetadata(
  sourceRepos: SourceRepo[],
  fallbackBranch: string,
): SourceManifestEntry[] {
  return sourceRepos.map((repo) => ({
    type: normalizeSourceType(repo.sourceType),
    path: validateRepoPath(repo.path),
    url: repo.url.trim(),
    branch: fallbackBranch,
    addons: repo.addons.length ? [...new Set(repo.addons.map((addon) => validateRepoPath(addon)))] : [validateRepoPath(repo.path)],
  }));
}

export async function listGitmoduleSources(target: string): Promise<SourceModuleLocation[]> {
  try {
    const gitmodules = await readFile(join(target, '.gitmodules'), 'utf8');
    const lines = gitmodules.split(/\r?\n/);
    const locations: SourceModuleLocation[] = [];

    const pathRegex = /^\s*path\s*=\s*odoo\/custom\/src\/(private|oca|external)\/(.+)\s*$/;
    const urlRegex = /^\s*url\s*=\s*(.+)\s*$/;

    let pending: SourceModuleLocation | undefined;
    for (const line of lines) {
      const parsedPath = line.match(pathRegex);
      if (parsedPath) {
        const sourceType = parsedPath[1] as SourceRepoType;
        const repoPath = parsedPath[2]?.trim() ?? '';
        if (!repoPath || !isValidPathSegment(repoPath)) {
          pending = undefined;
          continue;
        }
        pending = {
          type: sourceType,
          path: validateRepoPath(repoPath),
          url: '',
        };
        continue;
      }

      const parsedUrl = line.match(urlRegex);
      if (!parsedUrl || !pending) {
        continue;
      }
      const url = parseScalar(parsedUrl[1]);
      if (url) {
        locations.push({ ...pending, url });
      }
      pending = undefined;
    }

    return locations;
  } catch {
    return [];
  }
}

export function syncManifestFromMetadataAndGitmodules(
  sourceRepos: SourceRepo[],
  fallbackBranch: string,
  gitmodules: SourceModuleLocation[] = [],
): SourceManifestEntry[] {
  const byGitmodule = new Map<string, SourceModuleLocation>();
  for (const location of gitmodules) {
    byGitmodule.set(`${normalizeSourceType(location.type)}:${location.path}`, location);
  }

  const entries: SourceManifestEntry[] = [];
  for (const repo of sourceRepos) {
    const normalized = {
      type: normalizeSourceType(repo.sourceType),
      path: validateRepoPath(repo.path),
      url: repo.url.trim() || byGitmodule.get(`${normalizeSourceType(repo.sourceType)}:${repo.path}`)?.url || '',
      branch: fallbackBranch,
      addons: repo.addons.map(validateRepoPath),
    };

    entries.push(normalized);
  }

  for (const location of gitmodules) {
    const key = `${location.type}:${location.path}`;
    if (entries.some((entry) => `${entry.type}:${entry.path}` === key)) {
      continue;
    }

    entries.push({
      type: location.type,
      path: location.path,
      url: location.url,
      branch: fallbackBranch,
      addons: [location.path],
    });
  }

  return dedupeAndSort(entries);
}

export function sourceReposFromManifest(entries: SourceManifestEntry[]): SourceRepo[] {
  const normalized = dedupeAndSort(entries);
  return normalized.map((entry) => ({
    sourceType: entry.type,
    path: validateRepoPath(entry.path),
    url: entry.url,
    addons: entry.addons.length ? [...new Set(entry.addons.map((addon) => validateRepoPath(addon)))] : [validateRepoPath(entry.path)],
  }));
}
