import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { addModuleToSourceRepo, listModulesInSourceRepo, removeModuleFromSourceRepo } from '../src/module-actions.js';
import type { GitRunner } from '../src/git.js';

function recordingGit(): GitRunner & { calls: Array<{ cwd: string; args: string[] }> } {
  const calls: Array<{ cwd: string; args: string[] }> = [];

  return {
    calls,
    async run(cwd, args) {
      calls.push({ cwd, args });
      return { stdout: '', stderr: '' };
    },
  };
}

describe('module actions', () => {
  it('creates a minimal Odoo 16-19 compatible module skeleton and activates it', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-add-'));
    await mkdir(join(target, 'odoo/custom/src/private/moo_test'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'moo_test',
      moduleName: 'moo_test_base',
      odooVersion: '18.0',
      stage: false,
    });

    const modulePath = join(target, 'odoo/custom/src/private/moo_test/moo_test_base');
    await expect(readFile(join(modulePath, '__init__.py'), 'utf8')).resolves.toBe('from . import models\n');
    await expect(readFile(join(modulePath, 'models/__init__.py'), 'utf8')).resolves.toBe('');
    await expect(readFile(join(modulePath, 'security/ir.model.access.csv'), 'utf8')).resolves.toContain(
      'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
    );
    await expect(readFile(join(modulePath, '__manifest__.py'), 'utf8')).resolves.toContain(
      '"version": "18.0.1.0.0"',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/moo_test:\n  - moo_test_base',
    );
  });

  it('lists modules in a selected source repo and removes activation without deleting files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-remove-'));
    await mkdir(join(target, 'odoo/custom/src/private/moo_test'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'moo_test',
      moduleName: 'moo_test_base',
      odooVersion: '19.0',
      stage: false,
    });

    await expect(listModulesInSourceRepo(target, 'moo_test')).resolves.toEqual(['moo_test_base']);

    await removeModuleFromSourceRepo({
      target,
      repoPath: 'moo_test',
      moduleName: 'moo_test_base',
      deleteFiles: false,
      stage: false,
    });

    await expect(stat(join(target, 'odoo/custom/src/private/moo_test/moo_test_base'))).resolves.toBeTruthy();
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.not.toContain(
      '  - moo_test_base',
    );
  });

  it('stages module file changes inside the selected source repo as well as the dev repo', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-stage-'));
    const git = recordingGit();
    await mkdir(join(target, 'odoo/custom/src/private/moo_test'), { recursive: true });

    await addModuleToSourceRepo(
      {
        target,
        repoPath: 'moo_test',
        moduleName: 'moo_test_base',
        odooVersion: '19.0',
        stage: true,
      },
      git,
    );

    expect(git.calls).toContainEqual({
      cwd: join(target, 'odoo/custom/src/private/moo_test'),
      args: ['add', '.'],
    });
    expect(git.calls).toContainEqual({ cwd: target, args: ['add', '.'] });
  });
});
