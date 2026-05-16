import { describe, expect, it, vi } from 'vitest';

import {
  moduleActionChoices,
  selectModuleAction,
  type ModuleActionSelectPrompt,
} from '../src/cockpit/module-action-menu.js';
import type { ListedModule } from '../src/module-actions.js';

function choiceLabel(choice: ReturnType<typeof moduleActionChoices>[number]): string {
  if ('value' in choice) {
    return choice.name ?? String(choice.value);
  }

  return String((choice as { separator?: string }).separator ?? '');
}

describe('cockpit module action menu', () => {
  it('shows the module action labels and asks for explicit back navigation', async () => {
    const module: ListedModule = {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private',
    };
    const select: ModuleActionSelectPrompt = vi.fn(async (options) => {
      expect(options).toMatchObject({
        message: 'Module: odoo_sample_module_base',
        hideMessage: true,
        navigationHelp: 'back',
        loop: false,
      });

      const labels = options.choices.map(choiceLabel);
      expect(labels).toEqual(['Delete module', 'Update', 'Test', 'Lint', 'Back']);
      return 'update';
    });

    await expect(selectModuleAction(module, { select })).resolves.toEqual('update');
  });

  it('returns "back" when Back is selected', async () => {
    const module: ListedModule = {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private',
    };
    const select: ModuleActionSelectPrompt = vi.fn(async () => 'back');
    await expect(selectModuleAction(module, { select })).resolves.toEqual('back');
  });

  it('returns undefined for non-action prompt values but still applies back handling', async () => {
    const module: ListedModule = {
      moduleName: 'odoo_sample_module_base',
      repoPath: 'odoo_sample_module',
      sourceType: 'private',
    };
    const handleCancel = vi.fn();

    const select: ModuleActionSelectPrompt = vi.fn(async () => {
      return { invalid: true };
    });

    await expect(selectModuleAction(module, { select, handleCancel })).resolves.toBeUndefined();
    expect(handleCancel).toHaveBeenCalled();
  });
});
