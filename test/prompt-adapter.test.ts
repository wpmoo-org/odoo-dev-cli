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
      message: 'Source repo · Esc to go back',
    });

    process.stdin.emit('keypress', '', { name: 'escape', sequence: '\u001B' });

    await expect(resultPromise).resolves.toBe(promptCancelled);
    expect(consumePromptCancelKey()).toBe('escape');
  });

  it('renders intro, note, and outro output with ASCII text', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    introPrompt('WPMoo Tool');
    notePrompt('Add Odoo module paths', 'Repository setup');
    outroPrompt('Created environment.');

    expect(spy).toHaveBeenCalledWith('WPMoo Tool');
    expect(spy).toHaveBeenCalledWith('[Repository setup]');
    expect(spy).toHaveBeenCalledWith('  Add Odoo module paths');
    expect(spy).toHaveBeenCalledWith('Done: Created environment.');
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
