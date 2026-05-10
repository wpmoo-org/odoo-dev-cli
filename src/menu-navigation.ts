import { emitKeypressEvents } from 'node:readline';

export type PromptCancelAction = 'exit' | 'back';
export type PromptCancelKey = 'escape' | 'interrupt' | 'other';

type KeypressKey = {
  ctrl?: boolean;
  name?: string;
  sequence?: string;
};

let lastPromptCancelKey: PromptCancelKey | undefined;

export class MenuBackSignal extends Error {
  constructor() {
    super('Return to previous menu');
    this.name = 'MenuBackSignal';
  }
}

export function isMenuBackSignal(error: unknown): error is MenuBackSignal {
  return error instanceof MenuBackSignal;
}

export function menuIntroTitle(title: string, action: PromptCancelAction): string {
  return action === 'back' ? `${title} · Back (Esc)` : title;
}

export function menuPromptMessage(message: string, action: PromptCancelAction): string {
  return action === 'back' ? `${message} · Esc to go back` : message;
}

export function promptCancelOutcome(
  cancelled: boolean,
  action: PromptCancelAction,
  key: PromptCancelKey | undefined,
): 'continue' | 'back' | 'exit' {
  if (!cancelled) {
    return 'continue';
  }

  if (action === 'back' && key !== 'interrupt') {
    return 'back';
  }

  return 'exit';
}

export function recordPromptCancelKey(key: KeypressKey): void {
  if (key.ctrl && key.name === 'c') {
    lastPromptCancelKey = 'interrupt';
    return;
  }

  if (key.name === 'escape' || key.sequence === '\u001B') {
    lastPromptCancelKey = 'escape';
    return;
  }

  lastPromptCancelKey = 'other';
}

export function consumePromptCancelKey(): PromptCancelKey | undefined {
  const key = lastPromptCancelKey;
  lastPromptCancelKey = undefined;
  return key;
}

export function installPromptCancelKeyTracker(input: NodeJS.ReadStream = process.stdin): () => void {
  emitKeypressEvents(input);
  const listener = (_value: string, key: KeypressKey) => {
    if (key.ctrl || key.name === 'escape' || key.sequence === '\u001B') {
      recordPromptCancelKey(key);
    }
  };
  input.on('keypress', listener);
  return () => input.off('keypress', listener);
}

export function handlePromptCancel(cancelled: boolean, action: PromptCancelAction): void {
  const outcome = promptCancelOutcome(cancelled, action, consumePromptCancelKey());

  if (outcome === 'continue') {
    return;
  }

  if (outcome === 'back') {
    throw new MenuBackSignal();
  }

  process.exit(1);
}

export function handleUnavailableMenuChoice(action: PromptCancelAction): void {
  if (action === 'back') {
    throw new MenuBackSignal();
  }
}
