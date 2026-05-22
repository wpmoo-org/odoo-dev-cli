import { styleText } from 'node:util';

import {
  listModulesInEnvironment,
  type ListedModule,
} from '../module-actions.js';
import {
  handlePromptCancel,
  type PromptCancelAction,
} from '../menu-navigation.js';
import {
  isPromptCancel,
  promptSeparator,
  searchPrompt,
  selectPrompt,
  type PromptChoice,
  type PromptSeparator,
  type SearchPromptChoice,
  type SearchPromptOptions,
} from '../prompts/index.js';
import type { SourceRepoType } from '../types.js';

type ModuleBrowserValue = ListedModule;
type ModuleBrowserChoice = PromptChoice<ModuleBrowserValue>;
type ModuleBrowserSelectOptions = {
  message: string;
  choices: Array<ModuleBrowserChoice | PromptSeparator>;
  default?: ModuleBrowserValue;
  pageSize?: number;
  loop?: boolean;
  hideMessage?: boolean;
  navigationHelp?: 'exit' | 'back';
};

export type ModuleBrowserSelectPrompt = (options: ModuleBrowserSelectOptions) => Promise<unknown>;
export type ModuleBrowserSearchPrompt = (
  options: SearchPromptOptions<ModuleBrowserValue>,
) => Promise<ModuleBrowserValue | symbol>;
export type ModuleBrowserDeps = {
  select?: ModuleBrowserSelectPrompt;
  search?: ModuleBrowserSearchPrompt;
  handleCancel?: (value: unknown, action: PromptCancelAction) => void;
  cancelAction?: PromptCancelAction;
};

const sourceTypeLabels: Record<SourceRepoType, string> = {
  private: 'Private',
  oca: 'OCA',
  external: 'External',
};

const sourceTypeOrder: readonly SourceRepoType[] = ['private', 'oca', 'external'];
const minimumPageSize = 8;
const reservedRows = 7;
const searchableModuleThreshold = 20;

function rgb(red: number, green: number, blue: number, value: string): string {
  return `\u001B[38;2;${red};${green};${blue}m${value}\u001B[39m`;
}

function dim(value: string): string {
  return styleText('dim', value, { validateStream: false });
}

function categoryHeading(label: string): string {
  return `\u001B[1D${rgb(143, 211, 255, label)}`;
}

function repositoryHeading(repoLabel: string, repoContext: string, width: number): string {
  return `\u001B[1D${rgb(143, 211, 255, `📁 ${repoLabel.padEnd(width)}`)}${dim(`    ${repoContext}`)}`;
}

function repositoryContext(module: ListedModule): string {
  return module.repoSlug ?? module.repoPath;
}

function sourceContext(module: ListedModule): string {
  return `${module.sourceType}/${module.repoPath}`;
}

export function renderModuleDetails(module: ListedModule): string {
  return [
    `Name: ${module.moduleName}`,
    `Source: ${sourceContext(module)}`,
    `Path: odoo/custom/src/${module.sourceType}/${module.repoPath}/${module.moduleName}`,
  ].join('\n');
}

function moduleChoiceName(module: ListedModule, width: number): string {
  return `${rgb(226, 184, 96, ` ${module.moduleName.padEnd(width)}`)}${dim(`  ${sourceContext(module)}`)}`;
}

function pageSize(choiceCount: number): number {
  const terminalRows = process.stdout.rows;
  if (!terminalRows || terminalRows <= 0) {
    return Math.min(choiceCount, 12);
  }

  return Math.min(choiceCount, Math.max(minimumPageSize, terminalRows - reservedRows));
}

function defaultCancelHandler(value: unknown, action: PromptCancelAction): void {
  handlePromptCancel(isPromptCancel(value), action);
}

function deps(options: ModuleBrowserDeps = {}): Required<Pick<ModuleBrowserDeps, 'select' | 'search' | 'handleCancel'>> {
  return {
    select: options.select ?? ((selectOptions) => selectPrompt<ModuleBrowserValue>(selectOptions)),
    search: options.search ?? ((searchOptions) => searchPrompt<ModuleBrowserValue>(searchOptions)),
    handleCancel: options.handleCancel ?? defaultCancelHandler,
  };
}

export function moduleBrowserChoices(modules: readonly ListedModule[]): Array<ModuleBrowserChoice | PromptSeparator> {
  const moduleWidth = Math.max(...modules.map((module) => module.moduleName.length), 1);
  const repositoryWidth = Math.max(...modules.map((module) => module.repoPath.length), 1);
  const choices: Array<ModuleBrowserChoice | PromptSeparator> = [];

  for (const sourceType of sourceTypeOrder) {
    const sourceModules = modules
      .filter((module) => module.sourceType === sourceType)
      .sort((left, right) => left.repoPath.localeCompare(right.repoPath) || left.moduleName.localeCompare(right.moduleName));
    if (sourceModules.length === 0) {
      continue;
    }

    if (choices.length > 0) {
      choices.push(promptSeparator(' '));
    }

    choices.push(promptSeparator(categoryHeading(sourceTypeLabels[sourceType])));

    const modulesByRepo = new Map<string, ListedModule[]>();
    for (const module of sourceModules) {
      const bucket = modulesByRepo.get(module.repoPath);
      if (bucket) {
        bucket.push(module);
      } else {
        modulesByRepo.set(module.repoPath, [module]);
      }
    }

    for (const [repoPath, repoModules] of modulesByRepo) {
      const sortedRepoModules = [...repoModules].sort((left, right) => left.moduleName.localeCompare(right.moduleName));
      const headingLabel = repositoryHeading(repoPath, repositoryContext(sortedRepoModules[0]), repositoryWidth);
      choices.push(promptSeparator(headingLabel));
      choices.push(
        ...sortedRepoModules.map((module) => ({
          value: module,
          name: moduleChoiceName(module, moduleWidth),
          short: module.moduleName,
        })),
      );
    }
  }

  return choices;
}

function normalizeModuleSearchTerm(term: string | undefined): string[] {
  return (term ?? '')
    .trim()
    .toLowerCase()
    .replace(/[/:]+/g, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}

function searchableModuleFields(module: ListedModule): readonly string[] {
  const repoSlugName = module.repoSlug?.split('/').at(-1) ?? '';
  return [
    module.moduleName,
    module.repoPath,
    repoSlugName,
    module.sourceType,
    sourceContext(module),
  ].map((value) => value.toLowerCase());
}

function moduleSearchScore(module: ListedModule, terms: readonly string[]): number {
  if (terms.length === 0) {
    return 50;
  }

  const moduleName = module.moduleName.toLowerCase();
  const repoPath = module.repoPath.toLowerCase();
  if (terms.some((term) => moduleName === term)) {
    return 0;
  }
  if (terms.some((term) => moduleName.startsWith(term))) {
    return 1;
  }
  if (terms.some((term) => repoPath === term)) {
    return 2;
  }
  if (terms.some((term) => repoPath.startsWith(term))) {
    return 3;
  }
  if (terms.some((term) => module.sourceType === term)) {
    return 4;
  }
  return 5;
}

export function searchModuleBrowserChoices(
  modules: readonly ListedModule[],
  term: string | undefined,
): SearchPromptChoice<ModuleBrowserValue>[] {
  const terms = normalizeModuleSearchTerm(term);
  const moduleWidth = Math.max(...modules.map((module) => module.moduleName.length), 1);
  return modules
    .filter((module) => {
      if (terms.length === 0) {
        return true;
      }
      const fields = searchableModuleFields(module);
      return terms.every((term) => fields.some((field) => field.includes(term)));
    })
    .sort((left, right) => {
      const score = moduleSearchScore(left, terms) - moduleSearchScore(right, terms);
      return score || left.sourceType.localeCompare(right.sourceType) || left.repoPath.localeCompare(right.repoPath) || left.moduleName.localeCompare(right.moduleName);
    })
    .map((module) => ({
      value: module,
      name: moduleChoiceName(module, moduleWidth),
      description: sourceContext(module),
      short: module.moduleName,
    }));
}

export async function selectModuleFromBrowser(
  target: string,
  options: ModuleBrowserDeps = {},
): Promise<ListedModule | undefined> {
  const modules = await listModulesInEnvironment(target);
  if (modules.length === 0) {
    return undefined;
  }

  const promptDeps = deps(options);
  const cancelAction = options.cancelAction ?? 'back';
  if (modules.length > searchableModuleThreshold) {
    const selected = await promptDeps.search({
      message: 'Search modules',
      pageSize: pageSize(modules.length),
      source: (term) => searchModuleBrowserChoices(modules, term),
    });
    promptDeps.handleCancel(selected, cancelAction);

    if (typeof selected === 'object' && selected !== null && 'moduleName' in selected) {
      return selected as ListedModule;
    }

    return undefined;
  }

  const moduleChoices = moduleBrowserChoices(modules);
  const selected = await promptDeps.select({
    message: '',
    choices: moduleChoices,
    default: modules[0],
    pageSize: pageSize(moduleChoices.length),
    loop: false,
    hideMessage: true,
    navigationHelp: cancelAction === 'back' ? 'back' : 'exit',
  });
  promptDeps.handleCancel(selected, cancelAction);

  if (typeof selected === 'object' && selected !== null && 'moduleName' in selected) {
    return selected as ListedModule;
  }

  return undefined;
}
