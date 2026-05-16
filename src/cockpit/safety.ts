import { handlePromptCancel, menuPromptMessage, type PromptCancelAction } from '../menu-navigation.js';
import type { CockpitCommand } from './command-registry.js';
import { confirmPrompt, isPromptCancel, type ConfirmPromptOptions } from '../prompts/index.js';

export type CockpitRiskConfirmPrompt = (options: ConfirmPromptOptions) => Promise<boolean | symbol>;

export type CockpitSafetyDeps = {
  confirm?: CockpitRiskConfirmPrompt;
  handleCancel?: (value: unknown, action: PromptCancelAction) => void;
  cancelAction?: PromptCancelAction;
};

function defaultHandleCancel(value: unknown, action: PromptCancelAction): void {
  handlePromptCancel(isPromptCancel(value), action);
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

  const prompt = deps.confirm ?? confirmPrompt;
  const cancelAction = deps.cancelAction ?? 'back';
  const approved = await prompt({
    message: riskConfirmationMessage(command, cancelAction),
    initialValue: false,
  });
  const handleCancel = deps.handleCancel ?? defaultHandleCancel;
  handleCancel(approved, cancelAction);

  return approved === true;
}
