import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inquirer/select', () => ({
  __esModule: true,
  default: vi.fn(),
  Separator: class {
    readonly type = 'separator';

    constructor(readonly separator: string) {}
  },
}));
vi.mock('@inquirer/search', () => ({
  __esModule: true,
  default: vi.fn(),
}));
vi.mock('@inquirer/prompts', () => ({
  __esModule: true,
  confirm: vi.fn(),
  input: vi.fn(),
}));

import inquirerSelect from '@inquirer/select';
import inquirerSearch from '@inquirer/search';
import { confirm as inquirerConfirm, input as inquirerInput } from '@inquirer/prompts';
import {
  confirmPrompt,
  inputPrompt,
  introPrompt,
  isPromptCancel,
  notePrompt,
  outroPrompt,
  promptCancelled,
  promptSeparator,
  searchPrompt,
  selectPrompt,
  textPrompt,
} from '../src/prompts/index.js';
import { consumePromptCancelKey } from '../src/menu-navigation.js';

describe('prompt adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps clack-style select prompts to inquirer select config', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('moduleB');

    const value = await selectPrompt({
      message: 'Pick module',
      options: [
        { value: 'moduleA', label: 'Module A', hint: 'preferred' },
        { value: 'moduleB', label: 'Module B' },
      ],
      initialValue: 'moduleB',
      pageSize: 10,
      loop: false,
    });

    expect(value).toBe('moduleB');
    const [promptArgs] = select.mock.calls[0];
    expect(promptArgs.message).toBe('Pick module');
    expect(promptArgs.choices).toEqual([
      { value: 'moduleA', name: 'Module A', description: 'preferred' },
      { value: 'moduleB', name: 'Module B', description: undefined },
    ]);
    expect(promptArgs.default).toBe('moduleB');
  });

  it('passes native inquirer select options through', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('native');

    const nativeOptions = {
      message: 'Native select',
      choices: ['native' as const, 'fallback' as const],
      pageSize: 5,
      loop: false,
    };

    const value = await selectPrompt(nativeOptions);

    expect(value).toBe('native');
    expect(select.mock.calls[0][0]).toBe(nativeOptions);
    expect(select.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('can hide native select prompt chrome for cockpit menus', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('native');

    const value = await selectPrompt({
      message: 'What do you want to do?',
      choices: ['native' as const],
      hideMessage: true,
      disabledError: 'This option is disabled and cannot be selected.\nReason: Services stopped.',
    });

    expect(value).toBe('native');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      prefix?: string;
      style?: {
        message?: (text: string, status: string) => string;
        highlight?: (text: string) => string;
        disabled?: (text: string) => string;
        keysHelpTip?: (keys: [key: string, action: string][]) => string;
      };
      icon?: {
        cursor?: string;
      };
      i18n?: {
        disabledError?: string;
      };
    };
    expect(promptArgs.message).toBe('');
    expect(theme.prefix).toBe('');
    expect(theme.style?.message?.('What do you want to do?', 'idle')).toBe('');
    expect(theme.style?.highlight?.('row')).toBe('row');
    expect(theme.style?.disabled?.('- row (disabled)')).toBe('\u001B[2m- row\u001B[22m');
    expect(theme.style?.keysHelpTip?.([])).toBe('↑↓ navigate • ⏎ select • Ctrl+C exit');
    expect(theme.icon?.cursor).toBe('\u001B[38;2;226;184;96m❯\u001B[39m');
    expect(theme.i18n?.disabledError).toBe('This option is disabled and cannot be selected.\nReason: Services stopped.');
  });

  it('supports boolean-disabled choices in hidden select prompts', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('backup');

    const value = await selectPrompt({
      message: '',
      choices: [
        {
          value: 'start' as const,
          name: 'Start services',
          disabled: true,
        },
        {
          value: 'backup' as const,
          name: 'Create backup',
          disabled: 'Disk full.',
        },
      ],
      hideMessage: true,
      disabledError: 'This option is disabled and cannot be selected.',
    });

    expect(value).toBe('backup');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      style?: {
        disabled?: (text: string) => string;
      };
      i18n?: {
        disabledError?: string;
      };
      icon?: {
        cursor?: string;
      };
    };
    const cursor = theme.icon?.cursor ?? '';

    expect(theme.style?.disabled?.('- Start services (disabled)')).toBe('\u001B[2m- Start services\u001B[22m');
    expect(theme.style?.disabled?.(`${cursor} Create backup Disk full.`)).toBe(
      '\u001B[2m\u001B[38;2;226;184;96m❯\u001B[39m Create backup\u001B[22m',
    );
    expect(theme.i18n?.disabledError).toBe(
      'This option is disabled and cannot be selected.\nReason: Disk full.',
    );
  });

  it('hides disabled reason suffixes in rows and reports only the active disabled reason', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('install');

    const value = await selectPrompt({
      message: '',
      choices: [
        {
          value: 'start' as const,
          name: 'Start services',
          disabled: 'Already running.',
        },
        {
          value: 'install' as const,
          name: 'Install module',
          disabled: 'No modules found.',
        },
      ],
      hideMessage: true,
      disabledError: 'This option is disabled and cannot be selected.',
    });

    expect(value).toBe('install');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      style?: {
        disabled?: (text: string) => string;
      };
      icon?: {
        cursor?: string;
      };
      i18n?: {
        disabledError?: string;
      };
    };
    const cursor = theme.icon?.cursor ?? '';

    expect(theme.style?.disabled?.('- Start services Already running.')).toBe('\u001B[2m- Start services\u001B[22m');
    expect(theme.style?.disabled?.(`${cursor} Install module No modules found.`)).toBe(
      '\u001B[2m\u001B[38;2;226;184;96m❯\u001B[39m Install module\u001B[22m',
    );
    expect(theme.i18n?.disabledError).toBe(
      'This option is disabled and cannot be selected.\nReason: No modules found.',
    );
  });

  it('supports disabled error renderers for active disabled reasons', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('install');

    const value = await selectPrompt({
      message: '',
      choices: [
        {
          value: 'install' as const,
          name: 'Install module',
          disabled: 'No modules found.',
        },
      ],
      hideMessage: true,
      disabledError: (reason) =>
        reason
          ? `This option is disabled and cannot be selected.\nReason: ${reason}\nNext: choose "Add module" first.`
          : 'This option is disabled and cannot be selected.',
    });

    expect(value).toBe('install');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      style?: {
        disabled?: (text: string) => string;
      };
      icon?: {
        cursor?: string;
      };
      i18n?: {
        disabledError?: string;
      };
    };
    const cursor = theme.icon?.cursor ?? '';

    expect(theme.style?.disabled?.(`${cursor} Install module No modules found.`)).toBe(
      '\u001B[2m\u001B[38;2;226;184;96m❯\u001B[39m Install module\u001B[22m',
    );
    expect(theme.i18n?.disabledError).toBe(
      'This option is disabled and cannot be selected.\nReason: No modules found.\nNext: choose "Add module" first.',
    );
  });

  it('renders back-navigation help text for hidden select prompts', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('native');

    const value = await selectPrompt({
      message: 'Back-enabled submodule menu',
      choices: ['native' as const],
      hideMessage: true,
      navigationHelp: 'back',
    });

    expect(value).toBe('native');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      style?: {
        keysHelpTip?: (keys: [key: string, action: string][]) => string;
      };
    };
    expect(theme.style?.keysHelpTip?.([])).toBe('↑↓ navigate • ⏎ select • Esc to go back');
  });

  it('renders exit help text for visible select prompts when requested', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('retry');

    const value = await selectPrompt({
      message: 'If you have installed the prerequisites',
      options: [{ value: 'retry' as const, label: 'Check again' }],
      navigationHelp: 'exit',
      loop: false,
    });

    expect(value).toBe('retry');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      style?: {
        message?: (text: string, status: string) => string;
        keysHelpTip?: (keys: [key: string, action: string][]) => string;
      };
    };
    expect(promptArgs.message).toBe('If you have installed the prerequisites');
    expect(theme.style?.message).toBeUndefined();
    expect(theme.style?.keysHelpTip?.([])).toBe('↑↓ navigate • ⏎ select • Ctrl+C exit');
  });

  it('renders hidden select navigation warnings above the bottom help text', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('native');

    const value = await selectPrompt({
      message: 'Cockpit',
      choices: ['native' as const],
      hideMessage: true,
      navigationWarning: 'Already in Cockpit. Press Ctrl+C to exit.',
    });

    expect(value).toBe('native');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      style?: {
        keysHelpTip?: (keys: [key: string, action: string][]) => string;
      };
    };
    expect(theme.style?.keysHelpTip?.([])).toBe(
      '\u001B[2m\u001B[38;2;226;184;96mAlready in Cockpit. Press Ctrl+C to exit.\u001B[0m\n↑↓ navigate • ⏎ select • Ctrl+C exit',
    );
  });

  it('re-evaluates navigationWarning each time help text is rendered', async () => {
    const select = vi.mocked(inquirerSelect);
    select.mockResolvedValue('native');

    let warningCounter = 0;
    const value = await selectPrompt({
      message: 'Navigation Warning',
      choices: ['native' as const],
      hideMessage: true,
      navigationWarning: () => `Warning ${(warningCounter += 1)}`,
    });

    expect(value).toBe('native');
    const [promptArgs] = select.mock.calls[0];
    const theme = promptArgs.theme as {
      style?: {
        keysHelpTip?: (keys: [key: string, action: string][]) => string;
      };
    };

    expect(theme.style?.keysHelpTip?.([])).toBe(
      '\u001B[2m\u001B[38;2;226;184;96mWarning 1\u001B[0m\n↑↓ navigate • ⏎ select • Ctrl+C exit',
    );
    expect(theme.style?.keysHelpTip?.([])).toBe(
      '\u001B[2m\u001B[38;2;226;184;96mWarning 2\u001B[0m\n↑↓ navigate • ⏎ select • Ctrl+C exit',
    );
  });

  it('creates prompt separators through the adapter', () => {
    const separator = promptSeparator('Services');

    expect(separator).toMatchObject({ separator: 'Services' });
  });

  it('maps clack-style text options to inquirer input config', async () => {
    const input = vi.mocked(inquirerInput);
    input.mockResolvedValue('repo');

    const validate = vi.fn((value: string) => (value.length > 0 ? undefined : 'Required.'));
    await textPrompt({
      message: 'Source repo',
      placeholder: 'odoo/custom',
      defaultValue: 'odoo/private',
      validate,
    });

    const [promptArgs] = input.mock.calls[0];
    expect(promptArgs.message).toBe('Source repo');
    expect(promptArgs.default).toBe('odoo/private');
    expect(promptArgs.validate?.('repo')).toBe(true);
    expect(promptArgs.validate?.('')).toBe('Required.');
  });

  it('maps clack-style confirm options to inquirer confirm config', async () => {
    const confirm = vi.mocked(inquirerConfirm);
    confirm.mockResolvedValue(true);

    await confirmPrompt({
      message: 'Remove module',
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });

    const [promptArgs] = confirm.mock.calls[0];
    expect(promptArgs.message).toBe('Remove module (Y/n)');
    expect(promptArgs.default).toBe(true);
  });

  it('passes search prompts through search config', async () => {
    const search = vi.mocked(inquirerSearch);
    search.mockResolvedValue('match');

    const source = vi.fn(() => [{ value: 'command', label: 'Command', hint: 'Run command' }]);
    await searchPrompt({
      message: 'Search items',
      source,
      pageSize: 6,
    });

    const searchCall = search.mock.calls[0];
    expect(searchCall[0].message).toBe('Search items');
    expect(searchCall[0].pageSize).toBe(6);

    const sourceResult = await searchCall[0].source('query', { signal: new AbortController().signal });
    expect(sourceResult).toEqual([{ value: 'command', name: 'Command', description: 'Run command' }]);
  });

  it('normalizes inquirer cancel errors to a stable cancel sentinel', async () => {
    const input = vi.mocked(inquirerInput);
    const error = new Error('Prompt was canceled');
    error.name = 'CancelPromptError';
    input.mockRejectedValue(error);

    const result = await inputPrompt({
      message: 'Cancelled input',
    });

    expect(isPromptCancel(result)).toBe(true);
    expect(result).toBe(promptCancelled);
  });

  it('turns Escape keypresses into prompt cancellation for back navigation', async () => {
    const input = vi.mocked(inquirerInput);
    const error = new Error('Prompt aborted');
    error.name = 'AbortPromptError';
    input.mockImplementationOnce((_config, context) => {
      if (!context?.signal) {
        throw new Error('Expected prompt context signal.');
      }

      return new Promise<string>((_resolve, reject) => {
        context.signal?.addEventListener('abort', () => reject(error), { once: true });
      });
    });

    const resultPromise = inputPrompt({
      message: 'Source repo',
    });

    process.stdin.emit('keypress', '', { name: 'escape', sequence: '\u001B' });

    await expect(resultPromise).resolves.toBe(promptCancelled);
    expect(consumePromptCancelKey()).toBe('escape');
  });

  it('turns Ctrl+C prompt cancellation into the stable cancel sentinel', async () => {
    const input = vi.mocked(inquirerInput);
    const error = new Error('Prompt aborted with SIGINT');
    error.name = 'ExitPromptError';
    input.mockRejectedValue(error);

    const value = await inputPrompt({
      message: 'Source repo',
    });

    expect(value).toBe(promptCancelled);
    expect(consumePromptCancelKey()).toBe('interrupt');
  });

  it('can ignore Escape keypresses without aborting an active select prompt', async () => {
    const select = vi.mocked(inquirerSelect);
    const inquirerKeypress = vi.fn();
    const error = new Error('Prompt aborted');
    error.name = 'AbortPromptError';
    select.mockImplementationOnce((_config, context) => {
      if (!context?.signal) {
        throw new Error('Expected prompt context signal.');
      }

      return new Promise<string>((resolve, reject) => {
        process.stdin.on('keypress', inquirerKeypress);
        context.signal?.addEventListener('abort', () => reject(error), { once: true });
        setImmediate(() => {
          process.stdin.off('keypress', inquirerKeypress);
          resolve('native');
        });
      });
    });

    const resultPromise = selectPrompt({
      message: 'Cockpit',
      choices: ['native' as const],
      hideMessage: true,
      escapeBehavior: 'ignore',
    });
    process.stdin.emit('keypress', '', { name: 'escape', sequence: '\u001B' });

    await expect(resultPromise).resolves.toBe('native');
    expect(inquirerKeypress).not.toHaveBeenCalled();
    expect(consumePromptCancelKey()).toBeUndefined();
  });

  it('renders intro, note, and outro output with ASCII text', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    introPrompt('WPMoo Toolkit');
    notePrompt('Add Odoo module paths', 'Repository setup');
    outroPrompt('Created environment.');

    expect(spy).toHaveBeenCalledWith('WPMoo Toolkit');
    expect(spy).toHaveBeenCalledWith('[Repository setup]');
    expect(spy).toHaveBeenCalledWith('  Add Odoo module paths');
    expect(spy).toHaveBeenCalledWith('Done: Created environment.');
    spy.mockRestore();
  });

  it('renders intro titles in bold in interactive terminals', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalIsTTY = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;

    try {
      introPrompt('Run doctor');

      expect(spy).toHaveBeenCalledWith('\u001B[1mRun doctor\u001B[22m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
      spy.mockRestore();
    }
  });

  it('can render note body lines without indentation', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    notePrompt('Environment is ready.\ncd moo_olympiad_dev\n./moo', 'Next steps', { indent: false });

    expect(spy).toHaveBeenCalledWith('[Next steps]');
    expect(spy).toHaveBeenCalledWith('Environment is ready.');
    expect(spy).toHaveBeenCalledWith('cd moo_olympiad_dev');
    expect(spy).toHaveBeenCalledWith('./moo');
    expect(spy).not.toHaveBeenCalledWith('  Environment is ready.');
    spy.mockRestore();
  });

  it('can render note bodies without a title line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    notePrompt('Summary: ✓ Environment ready.', 'Environment status', { indent: false, showTitle: false });

    expect(spy).not.toHaveBeenCalledWith('[Environment status]');
    expect(spy).toHaveBeenCalledWith('Summary: ✓ Environment ready.');
    spy.mockRestore();
  });

  it('supports inputPrompt as a text alias', async () => {
    const input = vi.mocked(inquirerInput);
    input.mockResolvedValue('value');

    const value = await inputPrompt({
      message: 'Alias',
      defaultValue: 'value',
    });

    expect(value).toBe('value');
  });
});
