import { describe, expect, it } from 'vitest';

import { promptRepositoryUrl, type RepositoryUrlPromptApi } from '../src/prompt-repositories.js';

function promptApi(confirmValue: boolean, textValue = ''): RepositoryUrlPromptApi & { calls: unknown[] } {
  const calls: unknown[] = [];

  return {
    calls,
    async confirm(options) {
      calls.push({ type: 'confirm', options });
      return confirmValue;
    },
    async text(options) {
      calls.push({ type: 'text', options });
      return textValue;
    },
  };
}

describe('repository URL prompts', () => {
  it('accepts the suggested URL through a default-yes confirmation', async () => {
    const api = promptApi(true);
    const suggestedUrl = 'https://github.com/cangir/odoo_sample_module_dev.git';

    await expect(
      promptRepositoryUrl({
        label: 'Dev environment repo URL',
        suggestedUrl,
        placeholder: 'https://github.com/owner/odoo_sample_module_dev.git',
        prompt: api,
      }),
    ).resolves.toBe(suggestedUrl);

    expect(api.calls).toEqual([
      {
        type: 'confirm',
        options: {
          message: `Use Dev environment repo URL? (Y/n)\n${suggestedUrl}`,
          active: 'Y',
          inactive: 'n',
          initialValue: true,
        },
      },
    ]);
  });

  it('asks for a custom URL when the suggested URL is rejected', async () => {
    const api = promptApi(false, 'https://github.com/wpmoo-org/odoo_sample_module_dev.git');

    await expect(
      promptRepositoryUrl({
        label: 'Dev environment repo URL',
        suggestedUrl: 'https://github.com/cangir/odoo_sample_module_dev.git',
        placeholder: 'https://github.com/owner/odoo_sample_module_dev.git',
        prompt: api,
      }),
    ).resolves.toBe('https://github.com/wpmoo-org/odoo_sample_module_dev.git');

    expect(api.calls).toHaveLength(2);
    expect(api.calls[1]).toMatchObject({
      type: 'text',
      options: {
        message: 'Dev environment repo URL',
        placeholder: 'https://github.com/owner/odoo_sample_module_dev.git',
      },
    });
  });

  it('keeps repository URL prompt messages free of inline back hints', async () => {
    const api = promptApi(false, 'https://github.com/wpmoo-org/odoo_sample_module.git');
    const suggestedUrl = 'https://github.com/cangir/odoo_sample_module.git';

    await expect(
      promptRepositoryUrl({
        label: 'Source repo URL',
        suggestedUrl,
        placeholder: 'https://github.com/owner/odoo_sample_module.git',
        prompt: api,
        cancelAction: 'back',
      }),
    ).resolves.toBe('https://github.com/wpmoo-org/odoo_sample_module.git');

    expect(api.calls).toMatchObject([
      {
        type: 'confirm',
        options: {
          message: `Use Source repo URL? (Y/n)\n${suggestedUrl}`,
        },
      },
      {
        type: 'text',
        options: {
          message: 'Source repo URL',
        },
      },
    ]);
  });

  it('throws a required label error when manual input is blank', async () => {
    const api = promptApi(false, ' \n\t ');

    await expect(
      promptRepositoryUrl({
        label: 'Dev environment repo URL',
        suggestedUrl: 'https://github.com/cangir/odoo_sample_module_dev.git',
        placeholder: 'https://github.com/owner/odoo_sample_module_dev.git',
        prompt: api,
      }),
    ).rejects.toThrow('Dev environment repo URL is required');
  });
});
