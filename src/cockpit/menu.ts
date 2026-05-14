import { isCancel, select } from '@clack/prompts';

import {
  cockpitCommands,
  type CockpitCommand,
  type CockpitCommandCategory,
} from './command-registry.js';
import { handlePromptCancel, menuPromptMessage, MenuBackSignal } from '../menu-navigation.js';

export const cockpitMenuBackValue = '__wpmoo_cockpit_menu_back__';

type CockpitTopLevelMenuValue = 'command-palette' | 'exit' | CockpitCommandCategory;

export type CockpitTopLevelMenuSelection =
  | {
      kind: 'command-palette';
    }
  | {
      kind: 'category';
      category: CockpitCommandCategory;
    }
  | {
      kind: 'exit';
    };

export type CockpitMenuOption = {
  value: CockpitTopLevelMenuValue | CockpitCommand | typeof cockpitMenuBackValue;
  label: string;
  hint?: string;
};

export type CockpitMenuSelectPrompt = (options: {
  message: string;
  options: CockpitMenuOption[];
  initialValue?: CockpitMenuOption['value'];
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

const topLevelOptions = [
  { value: 'command-palette', label: 'Command palette /' },
  { value: 'services', label: categoryLabels.services },
  { value: 'modules', label: categoryLabels.modules },
  { value: 'database', label: categoryLabels.database },
  { value: 'diagnostics', label: categoryLabels.diagnostics },
  { value: 'repositories', label: categoryLabels.repositories },
  { value: 'maintenance', label: categoryLabels.maintenance },
  { value: 'exit', label: 'Exit' },
] as const satisfies readonly CockpitMenuOption[];

const categories = new Set<CockpitCommandCategory>([
  'services',
  'modules',
  'database',
  'diagnostics',
  'repositories',
  'maintenance',
]);

function defaultSelect(options: Parameters<CockpitMenuSelectPrompt>[0]): Promise<unknown> {
  return select(options);
}

function defaultCancelHandler(value: unknown, action: 'exit' | 'back'): void {
  handlePromptCancel(isCancel(value), action);
}

function menuDeps(deps: CockpitMenuDeps = {}): Required<CockpitMenuDeps> {
  return {
    select: deps.select ?? defaultSelect,
    handleCancel: deps.handleCancel ?? defaultCancelHandler,
  };
}

function isCockpitCommandCategory(value: unknown): value is CockpitCommandCategory {
  return typeof value === 'string' && categories.has(value as CockpitCommandCategory);
}

export async function selectCockpitTopLevelMenu(options: CockpitMenuDeps = {}): Promise<CockpitTopLevelMenuSelection> {
  const deps = menuDeps(options);
  const selected = await deps.select({
    message: 'What do you want to do?',
    options: [...topLevelOptions],
    initialValue: 'command-palette',
  });
  deps.handleCancel(selected, 'exit');

  if (selected === 'command-palette') {
    return { kind: 'command-palette' };
  }

  if (selected === 'exit') {
    return { kind: 'exit' };
  }

  if (isCockpitCommandCategory(selected)) {
    return {
      kind: 'category',
      category: selected,
    };
  }

  return { kind: 'exit' };
}

export async function selectCockpitCategoryCommand(
  category: CockpitCommandCategory,
  options: CockpitMenuDeps = {},
): Promise<CockpitCommand> {
  const deps = menuDeps(options);
  const commands = cockpitCommands.filter((command) => command.category === category);
  const selected = await deps.select({
    message: menuPromptMessage(categoryLabels[category], 'back'),
    options: [
      ...commands.map((command) => ({
        value: command,
        label: command.label,
        hint: command.description,
      })),
      { value: cockpitMenuBackValue, label: 'Back' },
    ],
    initialValue: commands[0],
  });
  deps.handleCancel(selected, 'back');

  if (selected === cockpitMenuBackValue) {
    throw new MenuBackSignal();
  }

  return selected as CockpitCommand;
}
