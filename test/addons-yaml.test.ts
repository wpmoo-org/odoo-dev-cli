import { describe, expect, it } from 'vitest';

import { addSourceRepoToAddonsYaml, removeSourceRepoFromAddonsYaml } from '../src/addons-yaml.js';

describe('addons.yaml helpers', () => {
  it('adds source repo blocks idempotently', () => {
    const initial = '# Addons activated from source submodules.\n\nprivate/odoo_sample_module:\n  - odoo_sample_module\n';

    const updated = addSourceRepoToAddonsYaml(initial, {
      path: 'odoo_sample_module_reports',
      addons: ['odoo_sample_module_reports'],
    });

    expect(updated).toContain('private/odoo_sample_module_reports:\n  - odoo_sample_module_reports\n');
    expect(addSourceRepoToAddonsYaml(updated, {
      path: 'odoo_sample_module_reports',
      addons: ['odoo_sample_module_reports'],
    })).toBe(updated);
  });

  it('removes only the selected source repo block', () => {
    const initial = [
      '# Addons activated from source submodules.',
      '',
      'private/odoo_sample_module:',
      '  - odoo_sample_module',
      '',
      'private/odoo_sample_module_reports:',
      '  - odoo_sample_module_reports',
      '',
      'private/odoo_sample_module_payment:',
      '  - odoo_sample_module_payment',
      '',
    ].join('\n');

    const updated = removeSourceRepoFromAddonsYaml(initial, 'odoo_sample_module_reports');

    expect(updated).toContain('private/odoo_sample_module:');
    expect(updated).not.toContain('private/odoo_sample_module_reports:');
    expect(updated).toContain('private/odoo_sample_module_payment:');
    expect(removeSourceRepoFromAddonsYaml(updated, 'odoo_sample_module_reports')).toBe(updated);
  });
});
