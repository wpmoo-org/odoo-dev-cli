import { describe, expect, it, vi } from 'vitest';

import { cockpitCommands } from '../src/cockpit/command-registry.js';
import {
  selectCockpitTopLevelMenu,
  type CockpitMenuChoice,
  type CockpitMenuSelectPrompt,
} from '../src/cockpit/menu.js';

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

function white(value: string): string {
  return `\u001B[37m${value}\u001B[39m`;
}

function yellow(value: string): string {
  return `\u001B[33m${value}\u001B[39m`;
}

function dim(value: string): string {
  return `\u001B[2m${value}\u001B[22m`;
}

function inlineCommand(label: string, description: string): string {
  return `${yellow(`  ${label.padEnd(22)}`)}${dim(`  ${description}`)}`;
}

describe('cockpit top-level menu', () => {
  it('shows runnable commands in a single menu with spaced category headings', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    expect(startCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expect(config.message).toBe('What do you want to do?');
      expect(menuChoiceLabels(config)).toEqual([
        white('Services'),
        inlineCommand('Start services', 'Start the Odoo development services.'),
        inlineCommand('Stop services', 'Stop the Odoo development services.'),
        inlineCommand('Restart services', 'Restart the Odoo development services.'),
        inlineCommand('View logs', 'Stream logs for an Odoo environment service.'),
        inlineCommand('Open shell', 'Open a shell inside the Odoo service container.'),
        ' ',
        white('Modules'),
        inlineCommand('Install module', 'Install one or more Odoo modules into a database.'),
        inlineCommand('Update module', 'Update one or more Odoo modules in a database.'),
        inlineCommand('Run tests', 'Run Odoo tests for one or more modules.'),
        inlineCommand('Run lint', 'Run the configured module lint checks.'),
        inlineCommand('Generate POT', 'Generate translation template files for a module.'),
        inlineCommand('Add module', 'Add a module folder to a source repository.'),
        inlineCommand('Remove module', 'Remove a module folder from a source repository.'),
        ' ',
        white('Database'),
        inlineCommand('Open psql', 'Open a PostgreSQL prompt for an environment database.'),
        inlineCommand('Create snapshot', 'Create a database snapshot.'),
        inlineCommand('Restore snapshot', 'Restore a database from a named snapshot.'),
        inlineCommand('Reset database', 'Reset an environment database.'),
        ' ',
        white('Diagnostics'),
        inlineCommand('Environment status', 'Show a summary of the current environment state.'),
        inlineCommand('Run doctor', 'Run environment diagnostics and report actionable issues.'),
        ' ',
        white('Repositories'),
        inlineCommand('Add source repo', 'Add a source repository as an environment submodule.'),
        inlineCommand('Remove source repo', 'Remove a source repository from the environment.'),
        ' ',
        white('Maintenance'),
        inlineCommand('Safe reset environment', 'Refresh generated environment files while preserving source repositories.'),
        'Exit',
      ]);
      expect(config.pageSize).toBeGreaterThan(0);
      expect(config.pageSize).toBeLessThanOrEqual(config.choices?.length ?? 0);
      expect(config.loop).toBe(false);
      expect(config.choices?.filter(isSeparatorChoice).map((choice) => choice.separator)).toEqual([
        white('Services'),
        ' ',
        white('Modules'),
        ' ',
        white('Database'),
        ' ',
        white('Diagnostics'),
        ' ',
        white('Repositories'),
        ' ',
        white('Maintenance'),
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

  it('reserves 23 startup banner and status rows when sizing the top-level menu', async () => {
    const startCommand = cockpitCommands.find((command) => command.id === 'start');
    expect(startCommand).toBeDefined();
    const originalRows = process.stdout.rows;
    Object.defineProperty(process.stdout, 'rows', { configurable: true, value: 30 });

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

  it('returns exit when Exit is selected from the single menu', async () => {
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      const config = options as MenuPromptConfig;

      expect(config.choices?.at(-1)).toEqual({ value: 'exit', name: 'Exit', short: 'Exit' });
      return 'exit';
    });

    await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
      kind: 'exit',
    });
  });
});
