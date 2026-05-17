import {
  handlePromptCancel,
  type PromptCancelAction,
} from '../menu-navigation.js';
import {
  isPromptCancel,
  selectPrompt,
  type PromptChoice,
  type PromptSeparator,
} from '../prompts/index.js';
import type { ListedModule } from '../module-actions.js';

type ModuleActionChoice = PromptChoice<ModuleActionId>;

export type ModuleActionId = 'delete' | 'update' | 'test' | 'lint';

const moduleActions: readonly { id: ModuleActionId; label: string }[] = [
  { id: 'delete', label: 'Delete module' },
  { id: 'update', label: 'Update' },
  { id: 'test', label: 'Test' },
  { id: 'lint', label: 'Run environment lint' },
];

export type ModuleActionSelectPrompt = (options: {
  message: string;
  choices: Array<ModuleActionChoice | PromptSeparator>;
  default?: ModuleActionId;
  pageSize?: number;
  loop?: boolean;
  hideMessage?: boolean;
  navigationHelp?: 'exit' | 'back';
}) => Promise<unknown>;

export type ModuleActionDeps = {
  select?: ModuleActionSelectPrompt;
  handleCancel?: (value: unknown, action: PromptCancelAction) => void;
  cancelAction?: PromptCancelAction;
};

function defaultCancelHandler(value: unknown, action: PromptCancelAction): void {
  handlePromptCancel(isPromptCancel(value), action);
}

function deps(options: ModuleActionDeps = {}): Required<Pick<ModuleActionDeps, 'select' | 'handleCancel'>> {
  return {
    select: options.select ?? ((options) => selectPrompt<ModuleActionId>(options)),
    handleCancel: options.handleCancel ?? defaultCancelHandler,
  };
}

export function moduleActionChoices(): Array<ModuleActionChoice | PromptSeparator> {
  return moduleActions.map(({ id, label }) => ({ value: id, name: label }));
}

function isModuleAction(value: unknown): value is ModuleActionId {
  return typeof value === 'string' && moduleActions.some((action) => action.id === value);
}

export async function selectModuleAction(
  module: ListedModule,
  options: ModuleActionDeps = {},
): Promise<ModuleActionId | undefined> {
  const promptDeps = deps(options);
  const cancelAction = options.cancelAction ?? 'back';
  const selected = await promptDeps.select({
    message: `Module: ${module.moduleName}`,
    choices: moduleActionChoices(),
    default: 'update',
    loop: false,
    hideMessage: true,
    navigationHelp: cancelAction === 'back' ? 'back' : 'exit',
  });
  promptDeps.handleCancel(selected, cancelAction);
  if (isModuleAction(selected)) {
    return selected;
  }

  return undefined;
}
