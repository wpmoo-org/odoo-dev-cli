import { emitKeypressEvents } from 'node:readline';
import { styleText } from 'node:util';
import inquirerSelect, { Separator as InquirerSeparator } from '@inquirer/select';
import inquirerSearch from '@inquirer/search';
import { confirm as inquirerConfirm, input as inquirerInput } from '@inquirer/prompts';
import { consumePromptCancelKey, recordPromptCancelKey } from '../menu-navigation.js';

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
  disabled?: boolean | string;
};
type SelectNavigationHelp = 'exit' | 'back';
type SelectNavigationWarning = string | (() => string | undefined);
type SelectEscapeBehavior = 'cancel' | 'ignore';
export type DisabledErrorRenderer = string | ((reason: string | undefined) => string);
export type SelectPromptOptions<T> =
  | {
      message: string;
      options: readonly PromptOption<T>[];
      initialValue?: T;
      pageSize?: number;
      loop?: boolean;
      hideMessage?: boolean;
      disabledError?: DisabledErrorRenderer;
      navigationHelp?: SelectNavigationHelp;
      navigationWarning?: SelectNavigationWarning;
      escapeBehavior?: SelectEscapeBehavior;
    }
  | {
      message: string;
      choices: readonly (T | PromptChoice<T> | PromptSeparator)[];
      pageSize?: number;
      loop?: boolean;
      default?: T;
      hideMessage?: boolean;
      disabledError?: DisabledErrorRenderer;
      navigationHelp?: SelectNavigationHelp;
      navigationWarning?: SelectNavigationWarning;
      escapeBehavior?: SelectEscapeBehavior;
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
export type NotePromptOptions = {
  indent?: boolean;
  showTitle?: boolean;
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
type InquirerSelectPromptConfig<T> = Parameters<typeof inquirerSelect<T>>[0];
type HideableSelectPromptConfig<T> = InquirerSelectPromptConfig<T> & {
  hideMessage?: boolean;
  disabledError?: DisabledErrorRenderer;
  navigationHelp?: SelectNavigationHelp;
  navigationWarning?: SelectNavigationWarning;
  escapeBehavior?: SelectEscapeBehavior;
};
type PromptContext = {
  signal: AbortSignal;
};
type PromptCancelGuardOptions = {
  escapeBehavior?: SelectEscapeBehavior;
};
type KeypressKey = {
  ctrl?: boolean;
  name?: string;
  sequence?: string;
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

function isEscapeKey(key: unknown): key is KeypressKey {
  if (typeof key !== 'object' || key === null) {
    return false;
  }

  const candidate = key as KeypressKey;
  return candidate.name === 'escape' || candidate.sequence === '\u001B';
}

function installIgnoredEscapeFilter(options: PromptCancelGuardOptions): () => void {
  emitKeypressEvents(process.stdin);
  const input = process.stdin;
  const originalEmit = input.emit;
  const patchedEmit = function patchedEmit(this: NodeJS.ReadStream, eventName: string | symbol, ...args: unknown[]): boolean {
    if (eventName === 'keypress' && isEscapeKey(args[1])) {
      consumePromptCancelKey();
      return true;
    }

    return Reflect.apply(originalEmit, this, [eventName, ...args]) as boolean;
  };

  input.emit = patchedEmit as typeof input.emit;
  return () => {
    if (input.emit === patchedEmit) {
      input.emit = originalEmit;
    }
  };
}

function installEscapeAbortController(controller: AbortController, options: PromptCancelGuardOptions = {}): () => void {
  emitKeypressEvents(process.stdin);
  if (options.escapeBehavior === 'ignore') {
    return installIgnoredEscapeFilter(options);
  }

  const listener = (_value: string, key: KeypressKey) => {
    if (!isEscapeKey(key)) {
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
  options: PromptCancelGuardOptions = {},
): Promise<T | PromptCancellation> {
  const controller = new AbortController();
  const removeEscapeListener = installEscapeAbortController(controller, options);

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
): options is {
  message: string;
  options: readonly PromptOption<T>[];
  initialValue?: T;
  pageSize?: number;
  loop?: boolean;
  hideMessage?: boolean;
  disabledError?: DisabledErrorRenderer;
  navigationHelp?: SelectNavigationHelp;
  navigationWarning?: SelectNavigationWarning;
  escapeBehavior?: SelectEscapeBehavior;
} {
  return 'options' in options;
}

function asInquirerSelectConfig<T>(
  options: {
    message: string;
    options: readonly PromptOption<T>[];
    initialValue?: T;
    pageSize?: number;
    loop?: boolean;
    hideMessage?: boolean;
    disabledError?: DisabledErrorRenderer;
    navigationHelp?: SelectNavigationHelp;
    navigationWarning?: SelectNavigationWarning;
    escapeBehavior?: SelectEscapeBehavior;
  },
): HideableSelectPromptConfig<T> {
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
    hideMessage: options.hideMessage,
    disabledError: options.disabledError,
    navigationHelp: options.navigationHelp,
    navigationWarning: options.navigationWarning,
    escapeBehavior: options.escapeBehavior,
  };
}

function renderedNavigationWarning(navigationWarning?: SelectNavigationWarning): string | undefined {
  const warning = typeof navigationWarning === 'function' ? navigationWarning() : navigationWarning;
  return warning ? `\u001B[2m\u001B[38;2;226;184;96m${warning}\u001B[0m` : undefined;
}

function hiddenSelectTheme<T>(
  disabledError?: DisabledErrorRenderer,
  navigationHelp: SelectNavigationHelp = 'exit',
  navigationWarning?: SelectNavigationWarning,
  hideMessage = true,
  disabledReasonLabels: readonly string[] = [],
): InquirerSelectPromptConfig<T>['theme'] {
  let activeDisabledReason: string | undefined;
  const keysHelpTip =
    navigationHelp === 'back'
      ? '↑↓ navigate • ⏎ select • Esc to go back'
      : '↑↓ navigate • ⏎ select • Ctrl+C exit';
  const disabledLabelPattern = / \(disabled\)$/u;
  const disabledReasonSuffixes = [...disabledReasonLabels]
    .sort((left, right) => right.length - left.length)
    .map((reason) => ` ${reason}`);
  const cursor = '\u001B[38;2;226;184;96m❯\u001B[39m';
  const disabledCursor = '-';

  const style: NonNullable<InquirerSelectPromptConfig<T>['theme']>['style'] = {
    highlight: (text: string) => text,
    disabled: (text: string) => {
      let renderedText = text.replace(disabledLabelPattern, '');
      const reasonSuffix = disabledReasonSuffixes.find((suffix) => renderedText.endsWith(suffix));
      if (reasonSuffix) {
        renderedText = renderedText.slice(0, -reasonSuffix.length);
      }

      if (text.startsWith(`${cursor} `) || text.startsWith(`${disabledCursor} ${cursor} `)) {
        activeDisabledReason = reasonSuffix?.trim();
      }

      return styleText('dim', renderedText, { validateStream: false });
    },
    keysHelpTip: () => {
      const warning = renderedNavigationWarning(navigationWarning);
      return warning ? `${warning}\n${keysHelpTip}` : keysHelpTip;
    },
  };

  if (hideMessage) {
    style.message = () => '';
  }

  return {
    prefix: '',
    icon: {
      cursor,
    },
    style,
    i18n: disabledError ? disabledErrorI18n(disabledError, () => activeDisabledReason) : undefined,
  };
}

function disabledErrorI18n(
  disabledError: DisabledErrorRenderer,
  activeReason: () => string | undefined,
): { disabledError: string } {
  const i18n: { disabledError: string } =
    typeof disabledError === 'string' ? { disabledError } : { disabledError: disabledError(undefined) };
  Object.defineProperty(i18n, 'disabledError', {
    get: () => {
      const reason = activeReason();
      if (typeof disabledError === 'function') {
        return disabledError(reason);
      }

      return reason ? `${disabledError}\nReason: ${reason}` : disabledError;
    },
  });
  return i18n;
}

function collectDisabledReasonLabels<T>(choices: readonly (T | PromptChoice<T> | PromptSeparator)[]): string[] {
  const reasons = new Set<string>();
  for (const choice of choices) {
    if (
      typeof choice === 'object' &&
      choice !== null &&
      'disabled' in choice &&
      typeof choice.disabled === 'string'
    ) {
      reasons.add(choice.disabled);
    }
  }
  return [...reasons];
}

function withHiddenSelectMessage<T>(config: HideableSelectPromptConfig<T>): InquirerSelectPromptConfig<T> {
  if (
    !config.hideMessage &&
    !config.disabledError &&
    !config.navigationHelp &&
    !config.navigationWarning &&
    !config.escapeBehavior
  ) {
    return config;
  }

  const {
    disabledError,
    hideMessage: _hideMessage,
    navigationHelp,
    navigationWarning,
    escapeBehavior: _escapeBehavior,
    ...inquirerConfig
  } = config;
  return {
    ...inquirerConfig,
    message: config.hideMessage ? '' : inquirerConfig.message,
    theme: hiddenSelectTheme<T>(
      disabledError,
      navigationHelp,
      navigationWarning,
      Boolean(config.hideMessage),
      collectDisabledReasonLabels(inquirerConfig.choices),
    ),
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
  const guardOptions: PromptCancelGuardOptions = {
    escapeBehavior: options.escapeBehavior,
  };
  if (isClackSelectOptions(options)) {
    return withPromptCancelGuard(
      (context) => inquirerSelect(withHiddenSelectMessage(asInquirerSelectConfig(options)), context),
      guardOptions,
    );
  }

  return withPromptCancelGuard((context) => inquirerSelect(withHiddenSelectMessage(options), context), guardOptions);
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
  const renderedTitle =
    Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined
      ? `\u001B[1m${title}\u001B[22m`
      : title;
  console.log('');
  console.log(renderedTitle);
  console.log(rule);
}

export function notePrompt(message: string, title = 'Note', options: NotePromptOptions = {}): void {
  const lines = message.split('\n');
  const prefix = options.indent === false ? '' : '  ';
  if (options.showTitle !== false) {
    console.log(`[${title}]`);
  }
  for (const line of lines) {
    console.log(`${prefix}${line}`);
  }
}

export function outroPrompt(message: string): void {
  console.log(`Done: ${message}`);
}
