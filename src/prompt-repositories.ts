import { confirm, isCancel, text, type ConfirmOptions, type TextOptions } from '@clack/prompts';

import { handlePromptCancel, type PromptCancelAction } from './menu-navigation.js';

export type RepositoryUrlPromptApi = {
  confirm(options: ConfirmOptions): Promise<boolean | symbol>;
  text(options: TextOptions): Promise<string | symbol>;
};

const defaultPrompt: RepositoryUrlPromptApi = {
  confirm,
  text,
};

export async function promptRepositoryUrl({
  label,
  suggestedUrl,
  placeholder,
  prompt = defaultPrompt,
  cancelAction = 'exit',
}: {
  label: string;
  suggestedUrl?: string;
  placeholder: string;
  prompt?: RepositoryUrlPromptApi;
  cancelAction?: PromptCancelAction;
}): Promise<string> {
  if (suggestedUrl) {
    const useSuggested = await prompt.confirm({
      message: `Use ${label}? (Y/n)\n${suggestedUrl}`,
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });
    if (isCancel(useSuggested)) {
      handlePromptCancel(true, cancelAction);
    }
    if (useSuggested) {
      return suggestedUrl;
    }
  }

  const value = await prompt.text({
    message: label,
    placeholder,
    validate: (input) => (input.trim() ? undefined : `Enter the ${label.toLowerCase()}.`),
  });
  if (isCancel(value)) {
    handlePromptCancel(true, cancelAction);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new Error(`${label} is required`);
}
