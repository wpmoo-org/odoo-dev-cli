import { describe, expect, it } from 'vitest';

import { renderRepositorySetupNote } from '../src/prompt-copy.js';

describe('prompt copy', () => {
  it('renders compact repository setup guidance', () => {
    const copy = renderRepositorySetupNote('odoo_sample_module');
    const lines = copy.split('\n');

    expect(copy).toContain('Dev repo: odoo_sample_module_dev');
    expect(copy).toContain('Module repo: odoo_sample_module');
    expect(copy).toContain('Local folder: ./odoo_sample_module_dev');
    expect(copy).toContain('Submodule path: odoo/custom/src/private/odoo_sample_module');
    expect(lines).toHaveLength(4);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(64);
  });
});
