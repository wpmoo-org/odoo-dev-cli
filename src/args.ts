import { resolve } from 'node:path';

import { defaultCommunityAddons, defaultProAddons } from './templates.js';
import { inferRepoPath } from './repo-url.js';
import type { ScaffoldOptions, SourceRepo } from './types.js';

type ParsedArgs = {
  values: Record<string, string | boolean>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

    if (inlineValue !== undefined) {
      values[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      values[key] = true;
      continue;
    }

    values[key] = next;
    index += 1;
  }

  return { values };
}

function stringValue(values: Record<string, string | boolean>, key: string): string | undefined {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
}

function listValue(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function valueAfter(argv: string[], index: number, key: string): { value: string; nextIndex: number } {
  const arg = argv[index];
  const inlineValue = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : undefined;

  if (inlineValue !== undefined) {
    return { value: inlineValue, nextIndex: index };
  }

  const next = argv[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`Missing value for --${key}`);
  }

  return { value: next, nextIndex: index + 1 };
}

function parseSourceRepos(argv: string[]): SourceRepo[] {
  const repos: Array<{ url: string; path?: string; addons?: string[] }> = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const rawKey = arg.slice(2).split('=', 1)[0];
    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

    if (key === 'sourceRepoUrl') {
      const parsed = valueAfter(argv, index, rawKey);
      repos.push({ url: parsed.value });
      index = parsed.nextIndex;
      continue;
    }

    if (key === 'sourcePath') {
      const current = repos.at(-1);
      if (!current) throw new Error('--source-path must follow --source-repo-url');
      const parsed = valueAfter(argv, index, rawKey);
      current.path = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (key === 'sourceAddons') {
      const current = repos.at(-1);
      if (!current) throw new Error('--source-addons must follow --source-repo-url');
      const parsed = valueAfter(argv, index, rawKey);
      current.addons = listValue(parsed.value, []);
      index = parsed.nextIndex;
    }
  }

  return repos.map((repo) => {
    if (!repo.addons?.length) {
      throw new Error(`Missing --source-addons for ${repo.url}`);
    }

    return {
      url: repo.url,
      path: repo.path?.trim() || inferRepoPath(repo.url),
      addons: repo.addons,
    };
  });
}

function booleanValue(
  values: Record<string, string | boolean>,
  key: string,
  fallback: boolean,
): boolean {
  const value = values[key];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = value.toLowerCase().trim();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;

  throw new Error(`Invalid boolean value for --${key}: ${value}`);
}

export function optionsFromArgs(argv: string[]): ScaffoldOptions | undefined {
  const { values } = parseArgs(argv);
  const product = stringValue(values, 'product');

  if (!product) {
    return undefined;
  }

  const org = stringValue(values, 'org') ?? 'wpmoo-org';
  const odooVersion = stringValue(values, 'odooVersion') ?? '19.0';
  const devRepoUrl = stringValue(values, 'devRepoUrl') ?? `https://github.com/${org}/${product}_dev.git`;
  const devRepo = stringValue(values, 'devRepo') ?? inferRepoPath(devRepoUrl);
  const communityRepo = stringValue(values, 'communityRepo') ?? product;
  const proRepo = stringValue(values, 'proRepo') ?? `${product}_pro`;
  const target = resolve(stringValue(values, 'target') ?? process.cwd());
  const communityRepoUrl =
    stringValue(values, 'communityRepoUrl') ?? `https://github.com/${org}/${communityRepo}.git`;
  const proRepoUrl = stringValue(values, 'proRepoUrl') ?? `https://github.com/${org}/${proRepo}.git`;
  const communityAddons = listValue(stringValue(values, 'communityAddons'), defaultCommunityAddons(product));
  const proAddons = listValue(stringValue(values, 'proAddons'), defaultProAddons(product));
  const parsedSourceRepos = parseSourceRepos(argv);
  const sourceRepos =
    parsedSourceRepos.length > 0
      ? parsedSourceRepos
      : [
          {
            url: communityRepoUrl,
            path: communityRepo,
            addons: communityAddons,
          },
          {
            url: proRepoUrl,
            path: proRepo,
            addons: proAddons,
          },
        ].filter((repo) => repo.url && repo.path && repo.addons.length);

  return {
    product,
    org,
    odooVersion,
    devRepo,
    devRepoUrl,
    communityRepo,
    proRepo,
    communityRepoUrl,
    proRepoUrl,
    communityAddons,
    proAddons,
    sourceRepos,
    target,
    dryRun: booleanValue(values, 'dryRun', false),
    initEmptyRepos: booleanValue(values, 'initEmptyRepos', false),
    stage: booleanValue(values, 'stage', true),
  };
}

export function isHelpRequested(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h');
}
