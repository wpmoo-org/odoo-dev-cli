import { resolve } from 'node:path';

import { parseArgs } from '../args.js';
import { commandOdooVersion } from '../environment-version.js';
import { outroPrompt } from '../prompts/index.js';
import { addModuleRepo, removeModuleRepo, type AddModuleRepoOptions, type RemoveModuleRepoOptions } from '../repo-actions.js';
import { normalizeRepositoryUrl } from '../repo-url.js';
import {
  listSources,
  renderSourceList,
  renderSourceSyncPlan,
  sourceListJson,
  sourceSyncPlan,
  sourceSyncPlanJson,
  sourceSyncJson,
  syncSources,
  type SourceSyncOptions,
} from '../source-actions.js';
import { renderBanner } from '../templates.js';
import type { SourceRepoType } from '../types.js';
import {
  booleanOption,
  jsonOption,
  optionalSourceTypeValue,
  printJson,
  sourceTypeValue,
  stringOption,
} from './options.js';

export function renderedSourceRepoPath(target: string, sourceType: SourceRepoType, repoPath?: string): string {
  if (repoPath) {
    return `${target}/odoo/custom/src/${sourceType}/${repoPath}`;
  }
  return `${target}/odoo/custom/src/${sourceType}`;
}

export async function addRepoOptionsFromArgs(argv: string[]): Promise<AddModuleRepoOptions | undefined> {
  const { values } = parseArgs(argv);
  const repoUrl = stringOption(values, 'repoUrl') ?? stringOption(values, 'sourceRepoUrl');
  if (!repoUrl) {
    return undefined;
  }

  const target = resolve(stringOption(values, 'target') ?? process.cwd());
  return {
    target,
    repoUrl: normalizeRepositoryUrl(repoUrl),
    repoPath: stringOption(values, 'repo') ?? stringOption(values, 'sourcePath'),
    sourceType: sourceTypeValue(values),
    odooVersion: await commandOdooVersion(target, stringOption(values, 'odooVersion')),
    initEmptyRepos: booleanOption(values, 'initEmptyRepos', false),
    stage: booleanOption(values, 'stage', true),
  };
}

export function removeRepoOptionsFromArgs(argv: string[]): RemoveModuleRepoOptions | undefined {
  const { values } = parseArgs(argv);
  const repoPath = stringOption(values, 'repo') ?? stringOption(values, 'sourcePath');
  if (!repoPath) {
    return undefined;
  }

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    repoPath,
    sourceType: optionalSourceTypeValue(values),
    stage: booleanOption(values, 'stage', true),
  };
}

export function sourceUsage(): string {
  return 'Usage: wpmoo source <list|sync|add|remove> [options]';
}

export type SourceSyncCliOptions = SourceSyncOptions & {
  json: boolean;
  dryRun: boolean;
};

export function sourceSyncOptionsFromArgs(argv: string[]): SourceSyncCliOptions {
  const { values } = parseArgs(argv);

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    stage: booleanOption(values, 'stage', true),
    json: jsonOption(values),
    dryRun: booleanOption(values, 'dryRun', false),
  };
}

export function sourceListOptionsFromArgs(argv: string[]): { target: string; json: boolean } {
  const { values } = parseArgs(argv);
  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    json: jsonOption(values),
  };
}

export async function runSourceCommand(argv: string[]): Promise<void> {
  const [subcommand, ...subcommandArgv] = argv;
  if (!subcommand) {
    throw new Error(sourceUsage());
  }

  if (subcommand === 'list') {
    const options = sourceListOptionsFromArgs(subcommandArgv);
    const sources = await listSources(options.target);
    if (options.json) {
      printJson(sourceListJson(sources));
      return;
    }

    console.log(renderBanner());
    console.log(renderSourceList(sources));
    return;
  }

  if (subcommand === 'sync') {
    const options = sourceSyncOptionsFromArgs(subcommandArgv);
    if (options.dryRun) {
      const plan = await sourceSyncPlan(options.target);
      if (options.json) {
        printJson(sourceSyncPlanJson(plan));
        return;
      }

      console.log(renderBanner());
      console.log(renderSourceSyncPlan(plan));
      return;
    }

    const sources = await syncSources({ target: options.target, stage: options.stage });
    if (options.json) {
      printJson(sourceSyncJson(sources, options.target));
      return;
    }

    console.log(renderBanner());
    outroPrompt(`Synced source manifest in ${options.target}.`);
    return;
  }

  if (subcommand === 'add') {
    const options = await addRepoOptionsFromArgs(subcommandArgv);
    if (!options) {
      throw new Error('Usage: wpmoo source add --repo-url <url> [--source-type private|oca|external]');
    }
    console.log(renderBanner());
    await addModuleRepo(options);
    outroPrompt(`Added source repo under ${renderedSourceRepoPath(options.target, options.sourceType ?? 'private', options.repoPath)}.`);
    return;
  }

  if (subcommand === 'remove') {
    const options = removeRepoOptionsFromArgs(subcommandArgv);
    if (!options) {
      throw new Error('Usage: wpmoo source remove --repo <name> [--source-type private|oca|external]');
    }
    console.log(renderBanner());
    await removeModuleRepo(options);
    outroPrompt(`Removed source repo ${options.repoPath} from ${options.target}.`);
    return;
  }

  throw new Error(sourceUsage());
}
