import { describe, expect, it, vi } from 'vitest';

import { cockpitCommands } from '../src/cockpit/command-registry.js';
import {
  cockpitMenuBackValue,
  selectCockpitCategoryCommand,
  selectCockpitTopLevelMenu,
  type CockpitMenuSelectPrompt,
} from '../src/cockpit/menu.js';
import { MenuBackSignal } from '../src/menu-navigation.js';

describe('cockpit category menus', () => {
  it('selects a top-level category from stable menu labels', async () => {
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      expect(options.message).toBe('What do you want to do?');
      expect(options.options.map((option) => option.label)).toEqual([
        'Command palette /',
        'Services',
        'Modules',
        'Database',
        'Diagnostics',
        'Repositories',
        'Maintenance',
        'Exit',
      ]);
      return 'services';
    });

    await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
      kind: 'category',
      category: 'services',
    });
  });

  it('returns the command-palette selection value from the top-level menu', async () => {
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      expect(options.options[0]).toEqual({
        value: 'command-palette',
        label: 'Command palette /',
      });
      return 'command-palette';
    });

    await expect(selectCockpitTopLevelMenu({ select: prompt })).resolves.toEqual({
      kind: 'command-palette',
    });
  });

  it('selects a command from a category menu', async () => {
    const installCommand = cockpitCommands.find((command) => command.id === 'install');
    expect(installCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      expect(options.message).toBe('Modules · Esc to go back');
      expect(options.options.map((option) => option.label)).toContain('Install module');
      expect(options.options.at(-1)).toEqual({
        value: cockpitMenuBackValue,
        label: 'Back',
      });
      return installCommand;
    });

    await expect(selectCockpitCategoryCommand('modules', { select: prompt })).resolves.toBe(installCommand);
  });

  it('does not show Exit inside category menus', async () => {
    const safeResetCommand = cockpitCommands.find((command) => command.id === 'safe-reset');
    expect(safeResetCommand).toBeDefined();

    const prompt: CockpitMenuSelectPrompt = vi.fn(async (options: Parameters<CockpitMenuSelectPrompt>[0]) => {
      expect(options.options.map((option) => option.label)).toEqual(['Safe reset environment', 'Back']);
      return safeResetCommand;
    });

    await expect(selectCockpitCategoryCommand('maintenance', { select: prompt })).resolves.toBe(safeResetCommand);
  });

  it('throws MenuBackSignal when Back is selected in a category menu', async () => {
    const prompt: CockpitMenuSelectPrompt = vi.fn(async () => cockpitMenuBackValue);

    await expect(selectCockpitCategoryCommand('database', { select: prompt })).rejects.toThrow(MenuBackSignal);
  });
});
