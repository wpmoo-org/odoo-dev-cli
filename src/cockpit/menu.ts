import { styleText } from 'node:util';

import {
  cockpitCommands,
  type CockpitCommand,
  type CockpitCommandCategory,
} from './command-registry.js';
import type { ServiceRuntimeStatus } from '../service-runtime-status.js';
import { handlePromptCancel } from '../menu-navigation.js';
import {
  isPromptCancel,
  promptSeparator,
  selectPrompt,
  type PromptSeparator,
} from '../prompts/index.js';

type CockpitTopLevelMenuValue = 'exit' | CockpitCommand;

export type CockpitTopLevelMenuSelection =
  | {
      kind: 'command';
      command: CockpitCommand;
    }
  | {
      kind: 'exit';
    };

export type CockpitMenuChoice = {
  value: CockpitTopLevelMenuValue;
  name: string;
  short?: string;
  description?: string;
  disabled?: boolean | string;
};

export type CockpitMenuSelectPrompt = (options: {
  message: string;
  choices: Array<CockpitMenuChoice | PromptSeparator>;
  default?: CockpitMenuChoice['value'];
  pageSize?: number;
  loop?: boolean;
  hideMessage?: boolean;
  disabledError?: string;
  navigationWarning?: string | (() => string | undefined);
  escapeBehavior?: 'cancel' | 'ignore';
}) => Promise<unknown>;

type CockpitMenuDeps = {
  select?: CockpitMenuSelectPrompt;
  handleCancel?: (value: unknown, action: 'exit' | 'back') => void;
  serviceStatus?: ServiceRuntimeStatus;
  moduleCount?: number;
  navigationWarning?: string | (() => string | undefined);
};

const categoryLabels: Record<CockpitCommandCategory, string> = {
  services: 'Services',
  modules: 'Modules',
  database: 'Database',
  diagnostics: 'Diagnostics',
  repositories: 'Repositories',
  maintenance: 'Maintenance',
};

const topLevelCategoryOrder: readonly CockpitCommandCategory[] = [
  'services',
  'modules',
  'database',
  'diagnostics',
  'repositories',
  'maintenance',
];

const topLevelCommands: readonly CockpitCommand[] = topLevelCategoryOrder.flatMap((category) =>
  cockpitCommands.filter((command) => command.category === category && command.id !== 'exit'),
);
const topLevelCommandLabelWidth = Math.max(...topLevelCommands.map((command) => command.label.length));
const moduleDependentCommandIds = new Set(['list-modules', 'install', 'update', 'test', 'lint', 'pot', 'remove-module']);

function rgb(red: number, green: number, blue: number, value: string): string {
  return `\u001B[38;2;${red};${green};${blue}m${value}\u001B[39m`;
}

function dim(value: string): string {
  return styleText('dim', value, { validateStream: false });
}

function categoryHeading(category: CockpitCommandCategory): string {
  return `\u001B[1D${rgb(143, 211, 255, categoryLabels[category])}`;
}

function commandName(command: CockpitCommand): string {
  return `${rgb(226, 184, 96, ` ${command.label.padEnd(topLevelCommandLabelWidth)}`)}${dim(`  ${command.description}`)}`;
}

function serviceDisabledReason(command: CockpitCommand, serviceStatus?: ServiceRuntimeStatus): string | undefined {
  if (command.category !== 'services' || !serviceStatus) return undefined;
  if (serviceStatus.kind === 'docker-not-running') return 'Docker not running.';
  if (serviceStatus.kind === 'running' && command.id === 'start') return 'Already running.';
  if (serviceStatus.kind === 'stopped' && ['stop', 'restart', 'logs', 'shell'].includes(command.id)) {
    return 'Services stopped.';
  }
  return undefined;
}

function moduleDisabledReason(command: CockpitCommand, moduleCount?: number): string | undefined {
  return moduleCount === 0 && moduleDependentCommandIds.has(command.id) ? 'No modules found.' : undefined;
}

function disabledReason(
  command: CockpitCommand,
  serviceStatus?: ServiceRuntimeStatus,
  moduleCount?: number,
): string | undefined {
  return serviceDisabledReason(command, serviceStatus) ?? moduleDisabledReason(command, moduleCount);
}

function disabledError(): string {
  return 'This option is disabled and cannot be selected.';
}

function commandDisabledValue(reason: string | undefined): string | undefined {
  if (!reason) {
    return undefined;
  }

  return reason;
}

function categoryChoices(
  category: CockpitCommandCategory,
  index: number,
  serviceStatus?: ServiceRuntimeStatus,
  moduleCount?: number,
): readonly (CockpitMenuChoice | PromptSeparator)[] {
  const choices: (CockpitMenuChoice | PromptSeparator)[] = [
    promptSeparator(categoryHeading(category)),
    ...topLevelCommands
      .filter((command) => command.category === category)
      .map((command) => {
        return {
          value: command,
          name: commandName(command),
          short: command.label,
          disabled: commandDisabledValue(disabledReason(command, serviceStatus, moduleCount)),
        };
      }),
  ];

  if (index < topLevelCategoryOrder.length - 1) {
    choices.push(promptSeparator(' '));
  }

  return choices;
}

const minimumTopLevelPageSize = 8;
const startupViewportReservedRows = 11;

function topLevelPageSize(choiceCount: number): number {
  const terminalRows = process.stdout.rows;
  if (!terminalRows || terminalRows <= 0) {
    return Math.min(choiceCount, 12);
  }

  return Math.min(choiceCount, Math.max(minimumTopLevelPageSize, terminalRows - startupViewportReservedRows));
}

function defaultSelect(options: Parameters<CockpitMenuSelectPrompt>[0]): Promise<unknown> {
  return selectPrompt<CockpitTopLevelMenuValue>(options);
}

function defaultCancelHandler(value: unknown, action: 'exit' | 'back'): void {
  handlePromptCancel(isPromptCancel(value), action);
}

function menuDeps(deps: CockpitMenuDeps = {}): Required<Pick<CockpitMenuDeps, 'select' | 'handleCancel'>> {
  return {
    select: deps.select ?? defaultSelect,
    handleCancel: deps.handleCancel ?? defaultCancelHandler,
  };
}

function isCockpitCommand(value: unknown): value is CockpitCommand {
  return typeof value === 'object' && value !== null && 'id' in value && 'slashAlias' in value;
}

function topLevelChoices(
  serviceStatus?: ServiceRuntimeStatus,
  moduleCount?: number,
): readonly (CockpitMenuChoice | PromptSeparator)[] {
  return topLevelCategoryOrder.flatMap((category, index) => categoryChoices(category, index, serviceStatus, moduleCount));
}

function defaultCommand(serviceStatus?: ServiceRuntimeStatus): CockpitCommand {
  if (serviceStatus?.kind === 'running') {
    return cockpitCommands.find((command) => command.id === 'stop') ?? topLevelCommands[0];
  }
  if (serviceStatus?.kind === 'docker-not-running') {
    return cockpitCommands.find((command) => command.id === 'status') ?? topLevelCommands[0];
  }
  return cockpitCommands.find((command) => command.id === 'start') ?? topLevelCommands[0];
}

export async function selectCockpitTopLevelMenu(options: CockpitMenuDeps = {}): Promise<CockpitTopLevelMenuSelection> {
  const deps = menuDeps(options);
  const choices = topLevelChoices(options.serviceStatus, options.moduleCount);
  const cancelAction: 'back' = 'back';

  const selected = await deps.select({
    message: '',
    choices: [...choices],
    default: defaultCommand(options.serviceStatus),
    pageSize: topLevelPageSize(choices.length),
    loop: false,
    hideMessage: true,
    disabledError: disabledError(),
    navigationWarning: options.navigationWarning,
    escapeBehavior: 'ignore',
  });
  deps.handleCancel(selected, cancelAction);

  if (selected === 'exit') {
    return { kind: 'exit' };
  }

  if (isCockpitCommand(selected)) {
    return {
      kind: 'command',
      command: selected,
    };
  }

  return { kind: 'exit' };
}
