import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { safeResetEnvironment } from '../src/safe-reset.js';

describe('safe reset', () => {
  it('refreshes generated overlay files without deleting module code', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-'));
    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module');

    await mkdir(modulePath, { recursive: true });
    await writeFile(join(modulePath, 'keep.py'), 'print("keep")\n', 'utf8');
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/addons.yaml'), 'private/odoo_sample_module:\n  - odoo_sample_module\n');
    await writeFile(join(target, 'odoo/custom/src/repos.yaml'), 'odoo:\n');

    await safeResetEnvironment({
      target,
      stage: false,
    });

    await expect(readFile(join(modulePath, 'keep.py'), 'utf8')).resolves.toBe('print("keep")\n');
    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      'Odoo Sample Module Development Environment',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/odoo_sample_module:',
    );
  });
});
