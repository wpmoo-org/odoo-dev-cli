import { styleText } from 'node:util';

import {
  cockpitCommands,
  type CockpitCommand,
  type CockpitCommandCategory,
} from './command-registry.js';
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
};

export type CockpitMenuSelectPrompt = (options: {
  message: string;
  choices: Array<CockpitMenuChoice | PromptSeparator>;
  default?: CockpitMenuChoice['value'];
  pageSize?: number;
  loop?: boolean;
}) => Promise<unknown>;

type CockpitMenuDeps = {
  select?: CockpitMenuSelectPrompt;
  handleCancel?: (value: unknown, action: 'exit' | 'back') => void;
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

function color(format: Parameters<typeof styleText>[0], value: string): string {
  return styleText(format, value, { validateStream: false });
}

function categoryHeading(category: CockpitCommandCategory): string {
  return color('white', categoryLabels[category]);
}

function commandName(command: CockpitCommand): string {
  return `${color('yellow', `  ${command.label.padEnd(topLevelCommandLabelWidth)}`)}${color('dim', `  ${command.description}`)}`;
}

function categoryChoices(category: CockpitCommandCategory, index: number): readonly (CockpitMenuChoice | PromptSeparator)[] {
  const choices: (CockpitMenuChoice | PromptSeparator)[] = [
    promptSeparator(categoryHeading(category)),
    ...topLevelCommands
      .filter((command) => command.category === category)
      .map((command) => ({
        value: command,
        name: commandName(command),
        short: command.label,
      })),
  ];

  if (index < topLevelCategoryOrder.length - 1) {
    choices.push(promptSeparator(' '));
  }

  return choices;
}

const topLevelChoices: readonly (CockpitMenuChoice | PromptSeparator)[] = [
  ...topLevelCategoryOrder.flatMap(categoryChoices),
  { value: 'exit', name: 'Exit', short: 'Exit' },
] as const;

const minimumTopLevelPageSize = 8;
const startupViewportReservedRows = 23;

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

function menuDeps(deps: CockpitMenuDeps = {}): Required<CockpitMenuDeps> {
  return {
    select: deps.select ?? defaultSelect,
    handleCancel: deps.handleCancel ?? defaultCancelHandler,
  };
}

function isCockpitCommand(value: unknown): value is CockpitCommand {
  return typeof value === 'object' && value !== null && 'id' in value && 'slashAlias' in value;
}

export async function selectCockpitTopLevelMenu(options: CockpitMenuDeps = {}): Promise<CockpitTopLevelMenuSelection> {
  const deps = menuDeps(options);

  const selected = await deps.select({
    message: 'What do you want to do?',
    choices: [...topLevelChoices],
    default: topLevelCommands[0],
    pageSize: topLevelPageSize(topLevelChoices.length),
    loop: false,
  });
  deps.handleCancel(selected, 'exit');

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
