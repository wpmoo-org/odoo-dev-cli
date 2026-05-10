import { confirm, isCancel, text, type ConfirmOptions, type TextOptions } from '@clack/prompts';

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
}: {
  label: string;
  suggestedUrl?: string;
  placeholder: string;
  prompt?: RepositoryUrlPromptApi;
}): Promise<string> {
  if (suggestedUrl) {
    const useSuggested = await prompt.confirm({
      message: `Use ${label}? (Y/n)\n${suggestedUrl}`,
      active: 'Y',
      inactive: 'n',
      initialValue: true,
    });
    if (isCancel(useSuggested)) {
      throw new Error(`${label} prompt cancelled`);
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
    throw new Error(`${label} prompt cancelled`);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new Error(`${label} is required`);
}
