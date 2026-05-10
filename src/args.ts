import { resolve } from 'node:path';

import { defaultCommunityAddons, defaultProAddons } from './templates.js';
import type { ScaffoldOptions } from './types.js';

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
  const devRepo = stringValue(values, 'devRepo') ?? `${product}_dev`;
  const communityRepo = stringValue(values, 'communityRepo') ?? product;
  const proRepo = stringValue(values, 'proRepo') ?? `${product}_pro`;
  const target = resolve(stringValue(values, 'target') ?? process.cwd());
  const communityRepoUrl =
    stringValue(values, 'communityRepoUrl') ?? `https://github.com/${org}/${communityRepo}.git`;
  const proRepoUrl = stringValue(values, 'proRepoUrl') ?? `https://github.com/${org}/${proRepo}.git`;

  return {
    product,
    org,
    odooVersion,
    devRepo,
    communityRepo,
    proRepo,
    communityRepoUrl,
    proRepoUrl,
    communityAddons: listValue(stringValue(values, 'communityAddons'), defaultCommunityAddons(product)),
    proAddons: listValue(stringValue(values, 'proAddons'), defaultProAddons(product)),
    target,
    dryRun: booleanValue(values, 'dryRun', false),
    initEmptyRepos: booleanValue(values, 'initEmptyRepos', false),
    stage: booleanValue(values, 'stage', true),
  };
}
