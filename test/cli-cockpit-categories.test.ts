import { describe, expect, it, vi } from 'vitest';

import { cockpitCommands, type CockpitCommand, type CockpitCommandCategory } from '../src/cockpit/command-registry.js';
import {
  selectCockpitTopLevelMenu,
  type CockpitMenuChoice,
  type CockpitMenuSelectPrompt,
} from '../src/cockpit/menu.js';
import { promptCancelled } from '../src/prompts/index.js';
import { recordPromptCancelKey } from '../src/menu-navigation.js';
import type { ServiceRuntimeStatus } from '../src/service-runtime-status.js';

type MenuPromptConfig = Parameters<CockpitMenuSelectPrompt>[0] & {
  choices?: Parameters<CockpitMenuSelectPrompt>[0]['choices'];
  pageSize?: number;
};

type MenuChoiceItem = NonNullable<MenuPromptConfig['choices']>[number];
type MenuSeparator = Extract<MenuChoiceItem, { separator: string }>;

function isSeparatorChoice(choice: MenuChoiceItem): choice is MenuSeparator {
  return 'separator' in choice;
}

function isMenuChoice(choice: MenuChoiceItem): choice is CockpitMenuChoice {
  return 'value' in choice;
}

function menuChoiceLabels(config: MenuPromptConfig): string[] {
  return (config.choices ?? []).map((choice) => (isSeparatorChoice(choice) ? choice.separator : choice.name));
}

function rgb(red: number, green: number, blue: number, value: string): string {
  return `\u001B[38;2;${red};${green};${blue}m${value}\u001B[39m`;
}

function category(value: string): string {
  return `\u001B[1D${rgb(143, 211, 255, value)}`;
}

function command(value: string): string {
  return rgb(226, 184, 96, value);
}

function dim(value: string): string {
  return `\u001B[2m${value}\u001B[22m`;
}

function inlineCommand(label: string, description: string): string {
  return `${command(` ${label.padEnd(22)}`)}${dim(`  ${description}`)}`;
}

function disabledValue(choice: CockpitMenuChoice | undefined): unknown {
  return (choice as { disabled?: unknown } | undefined)?.disabled;
}

function renderDisabledError(value: unknown, reason?: string): unknown {
  return typeof value === 'function' ? (value as (activeReason?: string) => string)(reason) : value;
}

type MenuChoiceExpectation = {
  id: string;
  category: CockpitCommandCategory;
  disabled?: string;
};

type DisabledReasonCase = {
  description: string;
  serviceStatus?: ServiceRuntimeStatus;
  moduleCount?: number;
  sourceRepoCount?: number;
  disabled: readonly Omit<MenuChoiceExpectation, 'category'>[];
  defaultChoice: string;
  expectAddModuleEnabled?: boolean;
};

function menuChoiceExpectationMatrix(overrides: readonly Omit<MenuChoiceExpectation, 'category'>[]): MenuChoiceExpectation[] {
  return cockpitCommands
    .filter((command) => command.id !== 'exit')
    .map((command) => ({
      id: command.id,
      category: command.category,
      disabled: overrides.find((entry) => entry.id === command.id)?.disabled,
    }));
}

function expectMenuChoiceMatrix(config: MenuPromptConfig, expectations: readonly MenuChoiceExpectation[]): void {
  const choices = (config.choices ?? []).filter(isMenuChoice);
  expect(choices).toHaveLength(expectations.length);

  for (const expectation of expectations) {
    const choice = choices.find((candidate) => (candidate.value as CockpitCommand).id === expectation.id);
    expect(choice).toBeDefined();
    expect((choice?.value as CockpitCommand).id).toBe(expectation.id);
    expect((choice?.value as CockpitCommand).category).toBe(expectation.category);
    expect(disabledValue(choice)).toBe(expectation.disabled);
  }
}

describe('cockpit top-level menu', () => {
  it('shows runnable commands in a single menu with spaced category headings', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    expect(startCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expect(config.message).toBe('');
      expect(config.hideMessage).toBe(true);
      expect(menuChoiceLabels(config)).toEqual([
        category('Services'),
        inlineCommand('Start services', 'Start Odoo services.'),
        inlineCommand('Stop services', 'Stop Odoo services.'),
        inlineCommand('Restart services', 'Restart Odoo services.'),
        inlineCommand('View logs', 'Tail service logs.'),
        inlineCommand('Open shell', 'Open a service shell.'),
        ' ',
        category('Modules'),
        inlineCommand('List modules', 'Browse detected Odoo modules by source category.'),
        inlineCommand('Install module', 'Install modules in the database.'),
        inlineCommand('Update module', 'Update modules in the database.'),
        inlineCommand('Run tests', 'Run tests for selected modules.'),
        inlineCommand('Run environment lint', 'Run environment lint checks.'),
        inlineCommand('Generate POT', 'Generate module translation templates.'),
        inlineCommand('Add module', 'Add a module to a source repository.'),
        inlineCommand('Remove module', 'Remove a module from a source repository.'),
        ' ',
        category('Database'),
        inlineCommand('Open psql', 'Open PostgreSQL prompt.'),
        inlineCommand('Create snapshot', 'Create a database snapshot.'),
        inlineCommand('Restore snapshot', 'Restore a named snapshot.'),
        inlineCommand('Reset database', 'Reset the environment database.'),
        ' ',
        category('Diagnostics'),
        inlineCommand('Environment status', 'Show a summary of the current environment state.'),
        inlineCommand('Run doctor', 'Run environment diagnostics.'),
        ' ',
        category('Repositories'),
        inlineCommand('Add source repo', 'Add a source repository.'),
        inlineCommand('Remove source repo', 'Remove a source repository.'),
        ' ',
        category('Maintenance'),
        inlineCommand('Safe reset environment', 'Refresh generated files only.'),
      ]);
      expect(config.pageSize).toBeGreaterThan(0);
      expect(config.pageSize).toBeLessThanOrEqual(config.choices?.length ?? 0);
      expect(config.loop).toBe(false);
      expect(config.choices?.filter(isSeparatorChoice).map((choice) => choice.separator)).toEqual([
        category('Services'),
        ' ',
        category('Modules'),
        ' ',
        category('Database'),
        ' ',
        category('Diagnostics'),
        ' ',
        category('Repositories'),
        ' ',
        category('Maintenance'),
      ]);
      expect(config.default).toBe(startCommand);
      expect(config.choices?.filter(isMenuChoice).find((choice) => choice.value === startCommand)?.description).toBeUndefined();
      return startCommand;
    });

    await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
      kind: 'command',
      command: startCommand,
    });
  });

  it('does not expose the command palette as a duplicate top-level menu item', async () => {
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expect(menuChoiceLabels(config)).not.toContain('Command palette /');
      return 'exit';
    });

    await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
      kind: 'exit',
    });
  });

  it('caps the visible page size to avoid terminal repaint artifacts', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    expect(startCommand).toBeDefined();
    const originalRows = process.stdout.rows;
    Object.defineProperty(process.stdout, 'rows', { configurable: true, value: 14 });

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expect(config.choices?.length).toBeGreaterThan(20);
      expect(config.pageSize).toBe(8);
      return startCommand;
    });

    try {
      await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
        kind: 'command',
        command: startCommand,
      });
    } finally {
      Object.defineProperty(process.stdout, 'rows', { configurable: true, value: originalRows });
    }
  });

  it('reserves compact startup rows when sizing the top-level menu', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    expect(startCommand).toBeDefined();
    const originalRows = process.stdout.rows;
    Object.defineProperty(process.stdout, 'rows', { configurable: true, value: 30 });

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expect(config.choices?.length).toBeGreaterThan(20);
      expect(config.pageSize).toBe(19);
      return startCommand;
    });

    try {
      await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
        kind: 'command',
        command: startCommand,
      });
    } finally {
      Object.defineProperty(process.stdout, 'rows', { configurable: true, value: originalRows });
    }
  });

  it('does not expose Exit as a selectable command and handles prompt cancellation with back-style action', async () => {
    const handleCancel = vi.fn();
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expect(config.choices?.find((choice) => isMenuChoice(choice) && choice.value === 'exit')).toBeUndefined();
      expect(menuChoiceLabels(config)).not.toContain(command('Exit'));
      return promptCancelled;
    });

    await expect(selectCockpitTopLevelMenu({ select: prompt, handleCancel })).resolves.toEqual({
      kind: 'exit',
    });
    expect(handleCancel).toHaveBeenCalledWith(promptCancelled, 'back');
  });

  it('configures Escape as ignored for the active top-level prompt', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    expect(startCommand).toBeDefined();
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      expect(options.escapeBehavior).toBe('ignore');
      return startCommand;
    });

    await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
      kind: 'command',
      command: startCommand,
    });
    expect(vi.mocked(prompt)).toHaveBeenCalledTimes(1);
  });

  it('still exits on Ctrl+C cancellation from the top-level selection prompt', async () => {
    recordPromptCancelKey({ ctrl: true, name: 'c', sequence: '\u0003' });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const prompt: CockpitMenuSelectPrompt = vi.fn(async () => promptCancelled);

    try {
      await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
        kind: 'exit',
      });
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  const disabledReasonCases: readonly DisabledReasonCase[] = [
    {
      description: 'Already running.',
      serviceStatus: { kind: 'running' },
      disabled: [{ id: 'start', disabled: 'Already running.' }],
      defaultChoice: 'stop',
    },
    {
      description: 'Services stopped.',
      serviceStatus: { kind: 'stopped' },
      disabled: [
        { id: 'stop', disabled: 'Services stopped.' },
        { id: 'restart', disabled: 'Services stopped.' },
        { id: 'logs', disabled: 'Services stopped.' },
        { id: 'shell', disabled: 'Services stopped.' },
      ],
      defaultChoice: 'start',
    },
    {
      description: 'Docker not running.',
      serviceStatus: { kind: 'docker-not-running' },
      disabled: [
        { id: 'start', disabled: 'Docker not running.' },
        { id: 'stop', disabled: 'Docker not running.' },
        { id: 'restart', disabled: 'Docker not running.' },
        { id: 'logs', disabled: 'Docker not running.' },
        { id: 'shell', disabled: 'Docker not running.' },
      ],
      defaultChoice: 'status',
    },
    {
      description: 'No modules found.',
      sourceRepoCount: 1,
      moduleCount: 0,
      disabled: [
        { id: 'list-modules', disabled: 'No modules found.' },
        { id: 'install', disabled: 'No modules found.' },
        { id: 'update', disabled: 'No modules found.' },
        { id: 'test', disabled: 'No modules found.' },
        { id: 'lint', disabled: 'No modules found.' },
        { id: 'pot', disabled: 'No modules found.' },
        { id: 'remove-module', disabled: 'No modules found.' },
      ],
      defaultChoice: 'start',
      expectAddModuleEnabled: true,
    },
    {
      description: 'No source repos found.',
      sourceRepoCount: 0,
      disabled: [{ id: 'add-module', disabled: 'No source repos found.' }],
      defaultChoice: 'start',
    },
  ];

  it.each(disabledReasonCases)('sets disabled reasons for "$description" context', async ({
    description,
    serviceStatus,
    moduleCount,
    sourceRepoCount,
    disabled,
    defaultChoice,
    expectAddModuleEnabled,
  }) => {
    const expected = menuChoiceExpectationMatrix(disabled);
    const defaultCommand = cockpitCommands.find((command) => command.id === defaultChoice);
    const addRepoChoice = expected.find((entry) => entry.id === 'add-repo');
    const addModuleChoice = expected.find((entry) => entry.id === 'add-module');
    expect(defaultCommand).toBeDefined();
    expect(addRepoChoice).toBeDefined();
    expect(addModuleChoice).toBeDefined();
    if (expectAddModuleEnabled) {
      expect(addModuleChoice?.disabled).toBeUndefined();
    }

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expectMenuChoiceMatrix(config, expected);
      expect(renderDisabledError(config.disabledError)).toBe('This option is disabled and cannot be selected.');
      if (disabled.length > 0) {
        const activeReason = disabled[0]?.disabled;
        expect(renderDisabledError(config.disabledError, activeReason)).toContain(`Reason: ${activeReason}`);
      }
      expect(config.default).toBe(defaultCommand);
      expect(addRepoChoice?.disabled).toBeUndefined();
      return defaultCommand;
    });

    await expect(selectCockpitTopLevelMenu({
      select: prompt,
      serviceStatus,
      moduleCount,
      sourceRepoCount,
    })).resolves.toEqual({
      kind: 'command',
      command: defaultCommand,
    });
  });
});
