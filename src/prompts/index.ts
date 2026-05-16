import { emitKeypressEvents } from 'node:readline';
import inquirerSelect, { Separator as InquirerSeparator } from '@inquirer/select';
import inquirerSearch from '@inquirer/search';
import { confirm as inquirerConfirm, input as inquirerInput } from '@inquirer/prompts';
import { recordPromptCancelKey } from '../menu-navigation.js';

export type PromptCancellation = typeof promptCancelled;
export type PromptOption<T> = {
  value: T;
  label: string;
  hint?: string;
};
export type PromptSeparator = InquirerSeparator;
export type PromptChoice<T> = {
  value: T;
  name?: string;
  description?: string;
  short?: string;
};
export type SelectPromptOptions<T> =
  | {
      message: string;
      options: readonly PromptOption<T>[];
      initialValue?: T;
      pageSize?: number;
      loop?: boolean;
    }
  | {
      message: string;
      choices: readonly (T | PromptChoice<T> | PromptSeparator)[];
      pageSize?: number;
      loop?: boolean;
      default?: T;
    };
export type TextPromptOptions = {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: (value: string) => string | undefined;
};
export type ConfirmPromptOptions = {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
};
export type SearchPromptOptions<T> = {
  message: string;
  source: (
    term: string | undefined,
    opt: {
      signal: AbortSignal;
    },
  ) => readonly SearchPromptChoice<T>[] | Promise<readonly SearchPromptChoice<T>[]>;
  pageSize?: number;
};

export type SearchPromptChoice<T> = {
  value: T;
  label?: string;
  hint?: string;
  name?: string;
  description?: string;
  short?: string;
};
type InquirerSearchPromptConfig<T> = Parameters<typeof inquirerSearch<T>>[0];
type PromptContext = {
  signal: AbortSignal;
};

export const promptCancelled = Symbol.for('wpmoo.prompt.cancelled');

export function promptSeparator(label: string): PromptSeparator {
  return new InquirerSeparator(label);
}

function isPromptCancelError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return ['AbortError', 'CancelPromptError', 'AbortPromptError', 'ExitPromptError'].includes(error.name);
}

function markPromptCancel(error: unknown): PromptCancellation {
  if (error instanceof Error && error.name === 'ExitPromptError' && /SIGINT/.test(error.message)) {
    recordPromptCancelKey({ ctrl: true, name: 'c', sequence: '\u0003' });
    return promptCancelled;
  }

  return promptCancelled;
}

function mapSearchChoice<T>(
  choice: SearchPromptChoice<T>,
): {
  value: T;
  name?: string;
  description?: string;
  short?: string;
} {
  if (choice.name !== undefined || choice.description !== undefined || choice.short !== undefined) {
    return {
      value: choice.value,
      name: choice.name,
      description: choice.description,
      short: choice.short,
    };
  }

  return {
    value: choice.value,
    name: choice.label,
    description: choice.hint,
  };
}

function asInquirerSearchConfig<T>(options: SearchPromptOptions<T>): InquirerSearchPromptConfig<T> {
  return {
    message: options.message,
    source: async (term, signal) => {
      const choices = await options.source(term, signal);
      return choices.map((choice) => mapSearchChoice(choice));
    },
    pageSize: options.pageSize,
  };
}

function installEscapeAbortController(controller: AbortController): () => void {
  emitKeypressEvents(process.stdin);
  const listener = (_value: string, key: { ctrl?: boolean; name?: string; sequence?: string }) => {
    if (key.name !== 'escape' && key.sequence !== '\u001B') {
      return;
    }

    recordPromptCancelKey(key);
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  process.stdin.on('keypress', listener);
  return () => process.stdin.off('keypress', listener);
}

async function withPromptCancelGuard<T>(
  callback: (context: PromptContext) => Promise<T>,
): Promise<T | PromptCancellation> {
  const controller = new AbortController();
  const removeEscapeListener = installEscapeAbortController(controller);

  try {
    return await callback({ signal: controller.signal });
  } catch (error) {
    if (!isPromptCancelError(error)) {
      throw error;
    }

    return markPromptCancel(error);
  } finally {
    removeEscapeListener();
  }
}

function isClackSelectOptions<T>(
  options: SelectPromptOptions<T>,
): options is { message: string; options: readonly PromptOption<T>[]; initialValue?: T; pageSize?: number; loop?: boolean } {
  return 'options' in options;
}

function asInquirerSelectConfig<T>(
  options: { message: string; options: readonly PromptOption<T>[]; initialValue?: T; pageSize?: number; loop?: boolean },
): {
  message: string;
  choices: readonly PromptChoice<T>[];
  default?: T;
  pageSize?: number;
  loop?: boolean;
} {
  return {
    message: options.message,
    choices: options.options.map((option) => ({
      value: option.value,
      name: option.label,
      description: option.hint,
    })),
    default: options.initialValue,
    pageSize: options.pageSize,
    loop: options.loop,
  };
}

function asInquirerConfirmConfig(options: ConfirmPromptOptions): {
  message: string;
  default?: boolean;
} {
  const hasChoiceLabels = Boolean(options.active && options.inactive);
  return {
    message: hasChoiceLabels ? `${options.message} (${options.active}/${options.inactive})` : options.message,
    default: options.initialValue,
  };
}

function asInquirerInputConfig(options: TextPromptOptions): {
  message: string;
  default?: string;
  validate?: (value: string) => boolean | string;
} {
  return {
    message: options.message,
    default: options.defaultValue ?? options.initialValue,
    validate: options.validate
      ? (value) => {
          const result = options.validate?.(value);
          return result === undefined ? true : result;
        }
      : undefined,
  };
}

export function isPromptCancel(value: unknown): value is PromptCancellation {
  return value === promptCancelled;
}

export async function selectPrompt<T>(
  options: SelectPromptOptions<T>,
): Promise<T | PromptCancellation> {
  if (isClackSelectOptions(options)) {
    return withPromptCancelGuard((context) => inquirerSelect(asInquirerSelectConfig(options), context));
  }

  return withPromptCancelGuard((context) => inquirerSelect(options, context));
}

export async function inputPrompt(options: TextPromptOptions): Promise<string | PromptCancellation> {
  return withPromptCancelGuard((context) => inquirerInput(asInquirerInputConfig(options), context));
}

export async function textPrompt(options: TextPromptOptions): Promise<string | PromptCancellation> {
  return inputPrompt(options);
}

export async function confirmPrompt(options: ConfirmPromptOptions): Promise<boolean | PromptCancellation> {
  return withPromptCancelGuard((context) => inquirerConfirm(asInquirerConfirmConfig(options), context));
}

export async function searchPrompt<T>(
  options: SearchPromptOptions<T>,
): Promise<T | PromptCancellation> {
  return withPromptCancelGuard((context) => inquirerSearch<T>(asInquirerSearchConfig(options), context));
}

export function introPrompt(title: string): void {
  const rule = '-'.repeat(Math.min(80, Math.max(title.length, 3)));
  console.log('');
  console.log(title);
  console.log(rule);
}

export function notePrompt(message: string, title = 'Note'): void {
  const lines = message.split('\n');
  console.log(`[${title}]`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

export function outroPrompt(message: string): void {
  console.log(`Done: ${message}`);
}
