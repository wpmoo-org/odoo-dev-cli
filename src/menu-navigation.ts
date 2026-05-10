export type PromptCancelAction = 'exit' | 'back';

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
  return action === 'back' ? `${title} · Esc to go back` : title;
}

export function handlePromptCancel(cancelled: boolean, action: PromptCancelAction): void {
  if (!cancelled) {
    return;
  }

  if (action === 'back') {
    throw new MenuBackSignal();
  }

  process.exit(1);
}

export function handleUnavailableMenuChoice(action: PromptCancelAction): void {
  if (action === 'back') {
    throw new MenuBackSignal();
  }
}
