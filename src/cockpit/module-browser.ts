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
  selectPrompt,
  type PromptChoice,
  type PromptSeparator,
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
export type ModuleBrowserDeps = {
  select?: ModuleBrowserSelectPrompt;
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

function deps(options: ModuleBrowserDeps = {}): Required<Pick<ModuleBrowserDeps, 'select' | 'handleCancel'>> {
  return {
    select: options.select ?? ((selectOptions) => selectPrompt<ModuleBrowserValue>(selectOptions)),
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

export async function selectModuleFromBrowser(
  target: string,
  options: ModuleBrowserDeps = {},
): Promise<ListedModule | undefined> {
  const modules = await listModulesInEnvironment(target);
  if (modules.length === 0) {
    return undefined;
  }

  const moduleChoices = moduleBrowserChoices(modules);
  const promptDeps = deps(options);
  const cancelAction = options.cancelAction ?? 'back';
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
