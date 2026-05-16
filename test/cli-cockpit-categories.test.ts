import { describe, expect, it, vi } from 'vitest';

import { cockpitCommands, type CockpitCommand } from '../src/cockpit/command-registry.js';
import {
  selectCockpitTopLevelMenu,
  type CockpitMenuChoice,
  type CockpitMenuSelectPrompt,
} from '../src/cockpit/menu.js';
import { promptCancelled } from '../src/prompts/index.js';
import { MenuBackSignal, recordPromptCancelKey } from '../src/menu-navigation.js';

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
        inlineCommand('Start services', 'Start the Odoo development services.'),
        inlineCommand('Stop services', 'Stop the Odoo development services.'),
        inlineCommand('Restart services', 'Restart the Odoo development services.'),
        inlineCommand('View logs', 'Stream logs for an Odoo environment service.'),
        inlineCommand('Open shell', 'Open a shell inside the Odoo service container.'),
        ' ',
        category('Modules'),
        inlineCommand('List modules', 'Browse detected Odoo modules by source category.'),
        inlineCommand('Install module', 'Install one or more Odoo modules into a database.'),
        inlineCommand('Update module', 'Update one or more Odoo modules in a database.'),
        inlineCommand('Run tests', 'Run Odoo tests for one or more modules.'),
        inlineCommand('Run lint', 'Run the configured module lint checks.'),
        inlineCommand('Generate POT', 'Generate translation template files for a module.'),
        inlineCommand('Add module', 'Add a module folder to a source repository.'),
        inlineCommand('Remove module', 'Remove a module folder from a source repository.'),
        ' ',
        category('Database'),
        inlineCommand('Open psql', 'Open a PostgreSQL prompt for an environment database.'),
        inlineCommand('Create snapshot', 'Create a database snapshot.'),
        inlineCommand('Restore snapshot', 'Restore a database from a named snapshot.'),
        inlineCommand('Reset database', 'Reset an environment database.'),
        ' ',
        category('Diagnostics'),
        inlineCommand('Environment status', 'Show a summary of the current environment state.'),
        inlineCommand('Run doctor', 'Run environment diagnostics and report actionable issues.'),
        ' ',
        category('Repositories'),
        inlineCommand('Add source repo', 'Add a source repository as an environment submodule.'),
        inlineCommand('Remove source repo', 'Remove a source repository from the environment.'),
        ' ',
        category('Maintenance'),
        inlineCommand('Safe reset environment', 'Refresh generated environment files while preserving source repositories.'),
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

  it('keeps top-level menu open when Escape cancels the top-level selection prompt', async () => {
    recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
    const prompt: CockpitMenuSelectPrompt = vi.fn(async () => promptCancelled);

    await expect(selectCockpitTopLevelMenu({ select: prompt })).rejects.toBeInstanceOf(MenuBackSignal);
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

  it('keeps service commands visible but disables start when services are running', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    const stopCommand = cockpitCommands.find((command) => command.id === 'stop');
    const logsCommand = cockpitCommands.find((command) => command.id === 'logs');
    expect(startCommand).toBeDefined();
    expect(stopCommand).toBeDefined();
    expect(logsCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;
      const choices = (config.choices ?? []).filter(isMenuChoice);

      expect(menuChoiceLabels(config)).toContain(inlineCommand('Start services', 'Start the Odoo development services.'));
      expect(disabledValue(choices.find((choice) => choice.value === startCommand))).toBe(true);
      expect(disabledValue(choices.find((choice) => choice.value === stopCommand))).toBeUndefined();
      expect(disabledValue(choices.find((choice) => choice.value === logsCommand))).toBeUndefined();
      expect(config.disabledError).toBe('This option is disabled and cannot be selected.\nReason: Already running.');
      expect(config.default).toBe(stopCommand);
      return stopCommand;
    });

    await expect(selectCockpitTopLevelMenu({
      select: prompt,
      serviceStatus: { kind: 'running' },
    })).resolves.toEqual({
      kind: 'command',
      command: stopCommand,
    });
  });

  it('keeps service commands visible but disables dependent service actions when services are stopped', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    const stopCommand = cockpitCommands.find((command) => command.id === 'stop');
    const restartCommand = cockpitCommands.find((command) => command.id === 'restart');
    const logsCommand = cockpitCommands.find((command) => command.id === 'logs');
    const shellCommand = cockpitCommands.find((command) => command.id === 'shell');
    expect(startCommand).toBeDefined();
    expect(stopCommand).toBeDefined();
    expect(restartCommand).toBeDefined();
    expect(logsCommand).toBeDefined();
    expect(shellCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;
      const choices = (config.choices ?? []).filter(isMenuChoice);

      expect(disabledValue(choices.find((choice) => choice.value === startCommand))).toBeUndefined();
      expect(disabledValue(choices.find((choice) => choice.value === stopCommand))).toBe(true);
      expect(disabledValue(choices.find((choice) => choice.value === restartCommand))).toBe(true);
      expect(disabledValue(choices.find((choice) => choice.value === logsCommand))).toBe(true);
      expect(disabledValue(choices.find((choice) => choice.value === shellCommand))).toBe(true);
      expect(config.disabledError).toBe('This option is disabled and cannot be selected.\nReason: Services stopped.');
      expect(config.default).toBe(startCommand);
      return startCommand;
    });

    await expect(selectCockpitTopLevelMenu({
      select: prompt,
      serviceStatus: { kind: 'stopped' },
    })).resolves.toEqual({
      kind: 'command',
      command: startCommand,
    });
  });

  it('disables all service actions when Docker is not running', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    const statusCommand = cockpitCommands.find((command) => command.id === 'status');
    expect(startCommand).toBeDefined();
    expect(statusCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;
      const choices = (config.choices ?? []).filter(isMenuChoice);
      const serviceChoices = choices.filter((choice) => isMenuChoice(choice) && (choice.value as CockpitCommand).category === 'services');

      expect(serviceChoices).toHaveLength(5);
      expect(serviceChoices.every((choice) => disabledValue(choice) === true)).toBe(true);
      expect(config.disabledError).toBe('This option is disabled and cannot be selected.\nReason: Docker not running.');
      expect(config.default).toBe(statusCommand);
      return statusCommand;
    });

    await expect(selectCockpitTopLevelMenu({
      select: prompt,
      serviceStatus: { kind: 'docker-not-running' },
    })).resolves.toEqual({
      kind: 'command',
      command: statusCommand,
    });
  });
});
