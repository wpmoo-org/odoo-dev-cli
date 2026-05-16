import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'odoo_sample_module_base',
      odooVersion: '18.0',
      stage: false,
    });

    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_base');
    await expect(readFile(join(modulePath, '__init__.py'), 'utf8')).resolves.toBe('from . import models\n');
    await expect(readFile(join(modulePath, 'models/__init__.py'), 'utf8')).resolves.toBe('');
    await expect(readFile(join(modulePath, 'security/ir.model.access.csv'), 'utf8')).resolves.toContain(
      'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
    );
    await expect(readFile(join(modulePath, '__manifest__.py'), 'utf8')).resolves.toContain(
      '"version": "18.0.1.0.0"',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/odoo_sample_module:\n  - odoo_sample_module_base',
    );
  });

  it('lists modules in a selected source repo and removes activation without deleting files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-remove-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'odoo_sample_module_base',
      odooVersion: '19.0',
      stage: false,
    });

    await expect(listModulesInSourceRepo(target, 'odoo_sample_module')).resolves.toEqual(['odoo_sample_module_base']);

    await removeModuleFromSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'odoo_sample_module_base',
      deleteFiles: false,
      stage: false,
    });

    await expect(
      stat(join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_base')),
    ).resolves.toBeTruthy();
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.not.toContain(
      '  - odoo_sample_module_base',
    );
  });

  it('stages module file changes inside the selected source repo as well as the dev repo', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-stage-'));
    const git = recordingGit();
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    await addModuleToSourceRepo(
      {
        target,
        repoPath: 'odoo_sample_module',
        moduleName: 'odoo_sample_module_base',
        odooVersion: '19.0',
        stage: true,
      },
      git,
    );

    expect(git.calls).toContainEqual({
      cwd: join(target, 'odoo/custom/src/private/odoo_sample_module'),
      args: ['add', '.'],
    });
    expect(git.calls).toContainEqual({ cwd: target, args: ['add', '.'] });
  });

  it('skips non-module directories and returns [] when source repo path does not exist', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-list-fallback-'));
    const repoRoot = join(target, 'odoo/custom/src/private/odoo_sample_module');
    await mkdir(join(repoRoot, 'odoo_sample_module_valid'), { recursive: true });
    await mkdir(join(repoRoot, 'docs'), { recursive: true });
    await mkdir(join(repoRoot, 'scripts'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/odoo_missing_manifest'), { recursive: true });
    await writeFile(join(repoRoot, 'odoo_sample_module_valid/__manifest__.py'), '{}\n', 'utf8');

    await expect(listModulesInSourceRepo(target, 'odoo_sample_module')).resolves.toEqual(['odoo_sample_module_valid']);
    await expect(listModulesInSourceRepo(target, 'odoo_sample_module_reports')).resolves.toEqual([]);
  });

  it('removes module files and stages both source repo + target when deleteFiles=true and stage=true', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-remove-delete-stage-'));
    const git = recordingGit();
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_base/models'), {
      recursive: true,
    });
    await writeFile(
      join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_base/__manifest__.py'),
      '{}\n',
      'utf8',
    );
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/odoo_sample_module:\n  - odoo_sample_module_base\n',
      'utf8',
    );

    await removeModuleFromSourceRepo(
      {
        target,
        repoPath: 'odoo_sample_module',
        moduleName: 'odoo_sample_module_base',
        deleteFiles: true,
        stage: true,
      },
      git,
    );

    await expect(
      stat(join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_base')),
    ).rejects.toThrow();
    expect(git.calls).toContainEqual({
      cwd: join(target, 'odoo/custom/src/private/odoo_sample_module'),
      args: ['add', '.'],
    });
    expect(git.calls).toContainEqual({ cwd: target, args: ['add', '.'] });
  });

  it('stages only target repo when deleteFiles=false and stage=true', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-remove-no-delete-stage-'));
    const git = recordingGit();
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_base'), {
      recursive: true,
    });
    await mkdir(join(target, 'odoo/custom/src'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/addons.yaml'),
      'private/odoo_sample_module:\n  - odoo_sample_module_base\n',
      'utf8',
    );

    await removeModuleFromSourceRepo(
      {
        target,
        repoPath: 'odoo_sample_module',
        moduleName: 'odoo_sample_module_base',
        deleteFiles: false,
        stage: true,
      },
      git,
    );

    expect(git.calls).not.toContainEqual({
      cwd: join(target, 'odoo/custom/src/private/odoo_sample_module'),
      args: ['add', '.'],
    });
    expect(git.calls).toContainEqual({ cwd: target, args: ['add', '.'] });
  });

  it('skips addons.yaml updates in compose environments for add/remove module operations', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-compose-addons-skip-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/odoo.json'),
      JSON.stringify({ tool: '@wpmoo/odoo', version: '0.8.0', engine: 'compose' }, null, 2),
      'utf8',
    );

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'odoo_sample_module_base',
      odooVersion: '19.0',
      stage: false,
    });
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();

    await removeModuleFromSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'odoo_sample_module_base',
      deleteFiles: false,
      stage: false,
    });
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();
  });

  it('rejects traversal repo paths before writing module files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-traversal-add-'));
    const escapedPath = resolve(target, 'odoo/custom/src/private', '../../../../../outside_target');

    await expect(
      addModuleToSourceRepo({
        target,
        repoPath: '../../../../../outside_target',
        moduleName: 'injected_mod',
        odooVersion: '19.0',
        stage: false,
      }),
    ).rejects.toThrow('Invalid repo path');

    await expect(stat(join(escapedPath, 'injected_mod'))).rejects.toThrow();
  });

  it('rejects traversal module names before writing module files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-traversal-name-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    await expect(
      addModuleToSourceRepo({
        target,
        repoPath: 'odoo_sample_module',
        moduleName: '../injected_mod',
        odooVersion: '19.0',
        stage: false,
      }),
    ).rejects.toThrow('Invalid module name');
  });

  it('rejects traversal repo paths before deleting module files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-traversal-remove-'));

    await expect(
      removeModuleFromSourceRepo({
        target,
        repoPath: '../../../../../outside_target',
        moduleName: 'injected_mod',
        deleteFiles: true,
        stage: false,
      }),
    ).rejects.toThrow('Invalid repo path');
  });

  it('writes module files under the requested source directory for OCA repos', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-add-oca-'));
    await mkdir(join(target, 'odoo/custom/src/oca/odoo_oca_module'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_oca_module',
      sourceType: 'oca',
      moduleName: 'odoo_oca_module_base',
      odooVersion: '19.0',
      stage: false,
    });

    const modulePath = join(target, 'odoo/custom/src/oca/odoo_oca_module/odoo_oca_module_base');
    await expect(readFile(join(modulePath, '__init__.py'), 'utf8')).resolves.toBe('from . import models\n');
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();
  });

  it('lists modules by selected source type', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-list-source-type-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module/private_module'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/oca/odoo_oca_module'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/oca/odoo_oca_module/oca_module'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/odoo_sample_module/private_module/__manifest__.py'), '{}\n', 'utf8');
    await writeFile(join(target, 'odoo/custom/src/oca/odoo_oca_module/oca_module/__manifest__.py'), '{}\n', 'utf8');

    await expect(listModulesInSourceRepo(target, 'odoo_sample_module')).resolves.toEqual(['private_module']);
    await expect(listModulesInSourceRepo(target, 'odoo_oca_module', 'oca')).resolves.toEqual(['oca_module']);
  });

  it('removes module files from a selected source repo when deleteFiles=true and stages the selected source path', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-remove-delete-oca-'));
    const git = recordingGit();
    await mkdir(join(target, 'odoo/custom/src/oca/odoo_oca_module/odoo_oca_module_base/models'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/oca/odoo_oca_module/odoo_oca_module_base/__manifest__.py'),
      '{}\n',
      'utf8',
    );

    await removeModuleFromSourceRepo(
      {
        target,
        repoPath: 'odoo_oca_module',
        sourceType: 'oca',
        moduleName: 'odoo_oca_module_base',
        deleteFiles: true,
        stage: true,
      },
      git,
    );

    await expect(
      stat(join(target, 'odoo/custom/src/oca/odoo_oca_module/odoo_oca_module_base')),
    ).rejects.toThrow();
    expect(git.calls).toContainEqual({
      cwd: join(target, 'odoo/custom/src/oca/odoo_oca_module'),
      args: ['add', '.'],
    });
    expect(git.calls).toContainEqual({ cwd: target, args: ['add', '.'] });
  });

  it('does not touch addons.yaml for non-private source types', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-nonprivate-addons-'));
    const git = recordingGit();
    await mkdir(join(target, 'odoo/custom/src/external/odoo_sample_external_module'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_external_module',
      sourceType: 'external',
      moduleName: 'odoo_sample_external_module_base',
      odooVersion: '19.0',
      stage: false,
    });

    await removeModuleFromSourceRepo(
      {
        target,
        repoPath: 'odoo_sample_external_module',
        sourceType: 'external',
        moduleName: 'odoo_sample_external_module_base',
        deleteFiles: true,
        stage: true,
      },
      git,
    );

    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).rejects.toThrow();
    expect(git.calls).toContainEqual({
      cwd: join(target, 'odoo/custom/src/external/odoo_sample_external_module'),
      args: ['add', '.'],
    });
    expect(git.calls).toContainEqual({ cwd: target, args: ['add', '.'] });
    await expect(
      stat(join(target, 'odoo/custom/src/external/odoo_sample_external_module/odoo_sample_external_module_base')),
    ).rejects.toThrow();
  });
});
