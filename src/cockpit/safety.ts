import { confirm, isCancel, type ConfirmOptions } from '@clack/prompts';

import { handlePromptCancel, menuPromptMessage, type PromptCancelAction } from '../menu-navigation.js';
import type { CockpitCommand } from './command-registry.js';

export type CockpitRiskConfirmPrompt = (options: ConfirmOptions) => Promise<boolean | symbol>;

export type CockpitSafetyDeps = {
  confirm?: CockpitRiskConfirmPrompt;
  handleCancel?: (value: unknown, action: PromptCancelAction) => void;
  cancelAction?: PromptCancelAction;
};

function defaultHandleCancel(value: unknown, action: PromptCancelAction): void {
  handlePromptCancel(isCancel(value), action);
}

function riskConfirmationMessage(command: CockpitCommand, action: PromptCancelAction): string {
  return menuPromptMessage(
    `Run ${command.slashAlias} ${command.label}? This can change or remove environment state.`,
    action,
  );
}

export async function confirmCockpitCommandRisk(
  command: CockpitCommand,
  deps: CockpitSafetyDeps = {},
): Promise<boolean> {
  if (!command.isRisky) {
    return true;
  }

  const prompt = deps.confirm ?? confirm;
  const cancelAction = deps.cancelAction ?? 'back';
  const approved = await prompt({
    message: riskConfirmationMessage(command, cancelAction),
    initialValue: false,
  });
  const handleCancel = deps.handleCancel ?? defaultHandleCancel;
  handleCancel(approved, cancelAction);

  return approved === true;
}
