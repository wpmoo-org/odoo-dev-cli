import { describe, expect, it, vi } from 'vitest';

import { cockpitCommands, type CockpitCommandCategory, type CockpitCommand } from '../src/cockpit/command-registry.js';
import { selectCockpitTopLevelMenu, type CockpitMenuSelectPrompt } from '../src/cockpit/menu.js';
import { type ServiceRuntimeStatus } from '../src/service-runtime-status.js';

type MenuPromptConfig = Parameters<CockpitMenuSelectPrompt>[0];
type MenuSeparator = Extract<MenuPromptConfig['choices'][number], { separator: string }>;
type SemanticChoice = Extract<MenuPromptConfig['choices'][number], { value: unknown }>;

type SemanticMenuSnapshot = {
  categories: CockpitCommandCategory[];
  commandIds: string[];
  default: {
    id: string;
    category: CockpitCommandCategory;
  };
  disabled: Readonly<Record<string, string>>;
  enabled: string[];
};

function isMenuChoice(choice: MenuPromptConfig['choices'][number]): choice is SemanticChoice {
  return 'value' in choice;
}

function isMenuSeparator(choice: MenuPromptConfig['choices'][number]): choice is MenuSeparator {
  return 'separator' in choice;
}

function renderDisabledError(value: unknown, reason?: string): unknown {
  return typeof value === 'function' ? (value as (activeReason?: string) => string)(reason) : value;
}

function extractSemanticSnapshot(config: MenuPromptConfig): SemanticMenuSnapshot {
  const commandChoices = (config.choices ?? []).filter(isMenuChoice).map((choice) => ({
    id: (choice.value as CockpitCommand).id,
    category: (choice.value as CockpitCommand).category,
    disabled: typeof choice.disabled === 'string' ? choice.disabled : undefined,
  }));

  const categories = commandChoices.reduce<CockpitCommandCategory[]>((result, entry) => {
    if (!result.includes(entry.category)) {
      result.push(entry.category);
    }
    return result;
  }, []);

  const disabled = Object.fromEntries(
    commandChoices
      .filter((entry) => entry.disabled !== undefined)
      .map((entry) => [entry.id, entry.disabled] as const),
  ) as Record<string, string>;

  const commandIds = commandChoices.map((entry) => entry.id);
  const enabled = commandChoices.filter((entry) => entry.disabled === undefined).map((entry) => entry.id);

  const defaultChoice = config.default as CockpitCommand | undefined;
  expect(defaultChoice).toBeDefined();

  return {
    categories,
    commandIds,
    default: {
      id: defaultChoice!.id,
      category: defaultChoice!.category,
    },
    disabled,
    enabled,
  };
}

function categoryOrderFromCommands(commands: readonly CockpitCommand[]): CockpitCommandCategory[] {
  return commands.reduce<CockpitCommandCategory[]>((result, command) => {
    if (!result.includes(command.category)) {
      result.push(command.category);
    }
    return result;
  }, []);
}

describe('cockpit top-level semantic menu', () => {
  const nonExitCommands = cockpitCommands.filter((command) => command.id !== 'exit');
  const expectedCategoryOrder = categoryOrderFromCommands(nonExitCommands);
  const expectedCommandIds = expectedCategoryOrder.flatMap((category) =>
    nonExitCommands.filter((command) => command.category === category).map((command) => command.id),
  );

  it('emits stable category order and command ids without ANSI labels', async () => {
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: MenuPromptConfig) => {
      const snapshot = extractSemanticSnapshot(options);
      expect(renderDisabledError(options.disabledError)).toBe('This option is disabled and cannot be selected.');
      expect(options.escapeBehavior).toBe('ignore');
      expect(snapshot.commandIds).toEqual(expectedCommandIds);
      expect(snapshot.categories).toEqual(expectedCategoryOrder);
      expect(snapshot.default).toEqual({ id: 'start', category: 'services' });
      expect(snapshot.disabled).toEqual({});
      expect(snapshot.enabled).toEqual(expectedCommandIds);
      expect(options.choices?.filter(isMenuSeparator).length).toBeGreaterThan(0);
      return nonExitCommands[0];
    });

    await selectCockpitTopLevelMenu({ select: prompt });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  const disabledCases: ReadonlyArray<{
    description: string;
    serviceStatus?: ServiceRuntimeStatus;
    moduleCount?: number;
    sourceRepoCount?: number;
    defaultId: string;
    disabled: Record<string, string>;
    enabled: string[];
  }> = [
    {
      description: 'running services',
      serviceStatus: { kind: 'running' },
      defaultId: 'stop',
      disabled: { start: 'Already running.' },
      enabled: expectedCommandIds.filter((id) => id !== 'start'),
    },
    {
      description: 'stopped services',
      serviceStatus: { kind: 'stopped' },
      defaultId: 'start',
      disabled: {
        stop: 'Services stopped.',
        restart: 'Services stopped.',
        logs: 'Services stopped.',
        shell: 'Services stopped.',
      },
      enabled: expectedCommandIds.filter(
        (id) => !['stop', 'restart', 'logs', 'shell'].includes(id),
      ),
    },
    {
      description: 'Docker not running',
      serviceStatus: { kind: 'docker-not-running' },
      defaultId: 'status',
      disabled: {
        start: 'Docker not running.',
        stop: 'Docker not running.',
        restart: 'Docker not running.',
        logs: 'Docker not running.',
        shell: 'Docker not running.',
      },
      enabled: expectedCommandIds.filter((id) => !['start', 'stop', 'restart', 'logs', 'shell'].includes(id)),
    },
    {
      description: 'no module candidates found',
      moduleCount: 0,
      sourceRepoCount: 1,
      defaultId: 'start',
      disabled: {
        'list-modules': 'No modules found.',
        install: 'No modules found.',
        update: 'No modules found.',
        test: 'No modules found.',
        lint: 'No modules found.',
        pot: 'No modules found.',
        'remove-module': 'No modules found.',
      },
      enabled: expectedCommandIds.filter(
        (id) => !['list-modules', 'install', 'update', 'test', 'lint', 'pot', 'remove-module'].includes(id),
      ),
    },
    {
      description: 'no source repos found',
      moduleCount: 1,
      sourceRepoCount: 0,
      defaultId: 'start',
      disabled: {
        'add-module': 'No source repos found.',
      },
      enabled: expectedCommandIds.filter((id) => id !== 'add-module'),
    },
  ];

  it.each(disabledCases)('captures disabled reasons and enabled actions for "$description"', async (testCase) => {
    const defaultCommand = cockpitCommands.find((command) => command.id === testCase.defaultId);
    expect(defaultCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: MenuPromptConfig) => {
      const snapshot = extractSemanticSnapshot(options);

      expect(snapshot.default).toEqual({
        id: testCase.defaultId,
        category: defaultCommand!.category,
      });
      expect(snapshot.disabled).toEqual(testCase.disabled);
      expect(snapshot.enabled).toEqual(testCase.enabled);
      return defaultCommand;
    });

    await selectCockpitTopLevelMenu({
      select: prompt,
      serviceStatus: testCase.serviceStatus,
      moduleCount: testCase.moduleCount,
      sourceRepoCount: testCase.sourceRepoCount,
    });

    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
