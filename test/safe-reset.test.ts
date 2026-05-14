import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderSafeResetPreview, safeResetEnvironment } from '../src/safe-reset.js';

describe('safe reset', () => {
  it('explains what safe reset will and will not touch', () => {
    expect(renderSafeResetPreview('/tmp/odoo_sample_module_dev', true)).toBe(
      [
        'Safe reset will refresh generated WPMoo environment files.',
        '',
        'Target:',
        '/tmp/odoo_sample_module_dev',
        '',
        'Will update:',
        '- .wpmoo/odoo.json',
        '- moo',
        '- .gitignore',
        '- README.md',
        '- AGENTS.md',
        '- docs/appstore-release.md',
        '- Compose generated files',
        '',
        'Will not touch:',
        '- source repo folders under odoo/custom/src/private',
        '- module source code',
        '- Git history, remotes, or branches',
        '',
        'Generated changes will be staged with git add .',
      ].join('\n'),
    );
  });

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
    expect((await stat(join(target, 'moo'))).mode & 0o111).not.toBe(0);
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/odoo_sample_module:',
    );
  });

  it('uses current addons.yaml module lists when metadata is stale', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-safe-reset-stale-metadata-'));

    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify(
        {
          tool: '@wpmoo/odoo',
          version: '0.7.0',
          product: 'odoo_sample_module',
          odooVersion: '19.0',
          devRepo: 'odoo_sample_module_dev',
          devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
          sourceRepos: [
            {
              url: 'https://github.com/example-org/odoo_sample_module.git',
              path: 'odoo_sample_module',
              addons: ['odoo_sample_module_base'],
            },
          ],
        },
        null,
        2,
      ),
    );
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/odoo_sample_module:\n  - odoo_sample_module_base\n  - odoo_sample_module_extra\n',
    );

    await safeResetEnvironment({
      target,
      stage: false,
    });

    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      '├── odoo_sample_module_extra/',
    );
  });
});
