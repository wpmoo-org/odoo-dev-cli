import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { markerPath } from '../src/environment.js';
import {
  addModuleToSourceRepo,
  listModulesInEnvironment,
  listModulesInSourceRepo,
  removeModuleFromSourceRepo,
  type ListedModule,
} from '../src/module-actions.js';
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
  async function writeSourceManifestFixture(target: string, addons = ['sale_coupon']): Promise<void> {
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(
      join(target, markerPath),
      `${JSON.stringify(
        {
          tool: '@wpmoo/toolkit',
          version: '0.9.8',
          product: 'product',
          odooVersion: '19.0',
          devRepo: 'product_dev',
          devRepoUrl: 'https://github.com/example/product_dev.git',
          engine: 'compose',
          sourceRepos: [
            {
              sourceType: 'oca',
              path: 'sale-workflow',
              url: 'https://github.com/OCA/sale-workflow.git',
              addons,
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await writeFile(
      join(target, 'odoo/custom/manifests/sources.yaml'),
      [
        'sources:',
        '  - type: "oca"',
        '    path: "sale-workflow"',
        '    url: "https://github.com/OCA/sale-workflow.git"',
        '    branch: "19.0"',
        '    addons:',
        ...addons.map((addon) => `      - "${addon}"`),
        '',
      ].join('\n'),
      'utf8',
    );
  }

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
    await expect(readFile(join(modulePath, 'models/__init__.py'), 'utf8')).resolves.toBe(
      'from . import odoo_sample_module_base\n',
    );
    await expect(readFile(join(modulePath, 'models/odoo_sample_module_base.py'), 'utf8')).resolves.toBe(
      `from odoo import fields, models


class OdooSampleModuleBase(models.Model):
    _name = "odoo.sample.module.base"
    _description = "Odoo Sample Module Base"

    name = fields.Char(required=True, default="New")
`,
    );
    await expect(readFile(join(modulePath, 'security/ir.model.access.csv'), 'utf8')).resolves.toBe(
      [
        'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
        'access_odoo_sample_module_base_user,access_odoo_sample_module_base_user,model_odoo_sample_module_base,base.group_user,1,1,1,1',
        '',
      ].join('\n'),
    );
    await expect(readFile(join(modulePath, 'tests/__init__.py'), 'utf8')).resolves.toBe(
      'from . import test_odoo_sample_module_base\n',
    );
    await expect(readFile(join(modulePath, 'tests/test_odoo_sample_module_base.py'), 'utf8')).resolves.toBe(
      `from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged("post_install", "-at_install")
class TestOdooSampleModuleBase(TransactionCase):

    def test_create_record(self):
        record = self.env["odoo.sample.module.base"].create({"name": "Test Odoo Sample Module Base"})
        self.assertEqual(record.name, "Test Odoo Sample Module Base")
`,
    );
    const manifest = await readFile(join(modulePath, '__manifest__.py'), 'utf8');
    expect(manifest).toContain('"version": "18.0.1.0.0"');
    expect(manifest).toContain('"summary": "Odoo Sample Module Base module"');
    expect(manifest).toContain('"views/odoo_sample_module_base_views.xml"');
    expect(manifest).toContain('"views/odoo_sample_module_base_menus.xml"');
    expect(manifest.indexOf('"views/odoo_sample_module_base_views.xml"')).toBeLessThan(
      manifest.indexOf('"views/odoo_sample_module_base_menus.xml"'),
    );
    expect(manifest).not.toContain('"summary": "TODO"');
    const viewsXml = await readFile(join(modulePath, 'views/odoo_sample_module_base_views.xml'), 'utf8');
    expect(viewsXml).toContain('<record id="view_odoo_sample_module_base_list" model="ir.ui.view">');
    expect(viewsXml).toContain('<field name="name">odoo.sample.module.base.list</field>');
    expect(viewsXml).toContain('<list string="Odoo Sample Module Base">');
    expect(viewsXml).toContain('<field name="name"/>');
    expect(viewsXml).toContain('<record id="view_odoo_sample_module_base_form" model="ir.ui.view">');
    expect(viewsXml).toContain('<form string="Odoo Sample Module Base">');
    await expect(readFile(join(modulePath, 'views/odoo_sample_module_base_menus.xml'), 'utf8')).resolves.toContain(
      '<menuitem id="menu_odoo_sample_module_base_root"',
    );
    await expect(readFile(join(modulePath, 'views/odoo_sample_module_base_menus.xml'), 'utf8')).resolves.toContain(
      'model="ir.actions.act_window"',
    );
    await expect(readFile(join(modulePath, 'views/odoo_sample_module_base_menus.xml'), 'utf8')).resolves.toContain(
      '<field name="res_model">odoo.sample.module.base</field>',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/odoo_sample_module:\n  - odoo_sample_module_base',
    );
  });

  it('uses tree views for generated modules targeting Odoo versions before 18', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-add-legacy-view-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'odoo_sample_module_legacy',
      odooVersion: '17.0',
      stage: false,
    });

    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_legacy');
    const viewsXml = await readFile(join(modulePath, 'views/odoo_sample_module_legacy_views.xml'), 'utf8');
    expect(viewsXml).toContain('<record id="view_odoo_sample_module_legacy_tree" model="ir.ui.view">');
    expect(viewsXml).toContain('<field name="name">odoo.sample.module.legacy.tree</field>');
    expect(viewsXml).toContain('<tree string="Odoo Sample Module Legacy">');
    expect(viewsXml).not.toContain('<list string=');
  });

  it('does not overwrite existing generated module test files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-add-test-idempotent-'));
    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module/odoo_sample_module_base');
    await mkdir(join(modulePath, 'tests'), { recursive: true });
    await writeFile(join(modulePath, 'tests/test_odoo_sample_module_base.py'), '# custom test\n', 'utf8');

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'odoo_sample_module_base',
      odooVersion: '18.0',
      stage: false,
    });

    await expect(readFile(join(modulePath, 'tests/test_odoo_sample_module_base.py'), 'utf8')).resolves.toBe(
      '# custom test\n',
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
      JSON.stringify({ tool: '@wpmoo/toolkit', version: '0.8.0', engine: 'compose' }, null, 2),
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

  it('lists modules in all configured source repos and keeps source metadata', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-list-environment-'));
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/manifests/sources.yaml'),
      [
        'sources:',
        '  - type: "oca"',
        '    path: "server_tools"',
        '    url: "https://github.com/OCA/server-tools.git"',
        '    branch: "19.0"',
        '    addons:',
        '      - "queue_job"',
        '  - type: "external"',
        '    path: "partner_tools"',
        '    url: "https://github.com/example/partner-tools.git"',
        '    branch: "19.0"',
        '    addons:',
        '      - "partner_dashboard"',
        '  - type: "private"',
        '    path: "product"',
        '    url: "https://github.com/example/product.git"',
        '    branch: "19.0"',
        '    addons:',
        '      - "custom_module"',
        '',
      ].join('\n'),
      'utf8',
    );
    await mkdir(join(target, 'odoo/custom/src/oca/server_tools'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/oca/server_tools/oca_module'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/external/partner_tools'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/external/partner_tools/partner_dashboard'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/product'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/product/custom_module'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/product/zeta_module'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/private/product/custom_module/__manifest__.py'),
      '{}\n',
      'utf8',
    );
    await writeFile(
      join(target, 'odoo/custom/src/private/product/zeta_module/__manifest__.py'),
      '{}\n',
      'utf8',
    );
    await writeFile(
      join(target, 'odoo/custom/src/oca/server_tools/oca_module/__manifest__.py'),
      '{}\n',
      'utf8',
    );
    await writeFile(
      join(target, 'odoo/custom/src/external/partner_tools/partner_dashboard/__manifest__.py'),
      '{}\n',
      'utf8',
    );

    const expected: ListedModule[] = [
      { moduleName: 'custom_module', repoPath: 'product', sourceType: 'private' },
      { moduleName: 'zeta_module', repoPath: 'product', sourceType: 'private' },
      { moduleName: 'oca_module', repoPath: 'server_tools', sourceType: 'oca' },
      { moduleName: 'partner_dashboard', repoPath: 'partner_tools', sourceType: 'external' },
    ];

    await expect(listModulesInEnvironment(target)).resolves.toMatchObject(expected);
  });

  it('includes optional repository display metadata from source manifest', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-list-context-'));
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/manifests/sources.yaml'),
      [
        'sources:',
        '  - type: "private"',
        '    path: "product"',
        '    url: "https://github.com/wpmoo-org/product.git"',
        '    addons:',
        '      - "custom_module"',
        '  - type: "external"',
        '    path: "external_tooling"',
        '    url: "https://example.org/org/external_tooling.tar.gz"',
        '    addons:',
        '      - "partner_dashboard"',
        '',
      ].join('\n'),
      'utf8',
    );
    await mkdir(join(target, 'odoo/custom/src/private/product'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/product/custom_module'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/external/external_tooling'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/external/external_tooling/partner_dashboard'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/private/product/custom_module/__manifest__.py'),
      '{}\n',
      'utf8',
    );
    await writeFile(
      join(target, 'odoo/custom/src/external/external_tooling/partner_dashboard/__manifest__.py'),
      '{}\n',
      'utf8',
    );

    await expect(listModulesInEnvironment(target)).resolves.toEqual([
      {
        moduleName: 'custom_module',
        repoPath: 'product',
        sourceType: 'private',
        repoUrl: 'https://github.com/wpmoo-org/product.git',
        repoSlug: 'wpmoo-org/product',
      },
      {
        moduleName: 'partner_dashboard',
        repoPath: 'external_tooling',
        sourceType: 'external',
        repoUrl: 'https://example.org/org/external_tooling.tar.gz',
      },
    ]);
  });

  it('falls back to legacy private repos when source configuration is empty', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-list-fallback-'));
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/private/legacy_repo"]',
        '\tpath = odoo/custom/src/private/legacy_repo',
        '\turl = https://github.com/example-org/legacy-repo.git',
        '',
      ].join('\n'),
      'utf8',
    );
    await mkdir(join(target, 'odoo/custom/src/private/legacy_repo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/legacy_repo/legacy_module'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/private/legacy_repo/legacy_module/__manifest__.py'),
      '{}\n',
      'utf8',
    );

    vi.resetModules();
    vi.doMock('../src/source-actions.js', () => ({
      listSources: async () => [],
    }));
    const moduleActions = await import('../src/module-actions.js');

    const entries: ListedModule[] = await moduleActions.listModulesInEnvironment(target);
    expect(entries).toEqual([{ moduleName: 'legacy_module', repoPath: 'legacy_repo', sourceType: 'private' }]);
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

  it('rejects module names that cannot produce lower snake_case Python files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-invalid-name-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    await expect(
      addModuleToSourceRepo({
        target,
        repoPath: 'odoo_sample_module',
        moduleName: 'invalid-module',
        odooVersion: '19.0',
        stage: false,
      }),
    ).rejects.toThrow('Invalid module name');

    await expect(
      addModuleToSourceRepo({
        target,
        repoPath: 'odoo_sample_module',
        moduleName: 'InvalidModule',
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

  it('registers added modules in the source manifest and metadata source addons', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-source-manifest-add-'));
    await writeSourceManifestFixture(target);
    await mkdir(join(target, 'odoo/custom/src/oca/sale-workflow'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'sale-workflow',
      sourceType: 'oca',
      moduleName: 'sale_order_line_no_discount',
      odooVersion: '19.0',
      stage: false,
    });

    await expect(readFile(join(target, 'odoo/custom/manifests/sources.yaml'), 'utf8')).resolves.toContain(
      '      - "sale_order_line_no_discount"',
    );
    await expect(readFile(join(target, markerPath), 'utf8')).resolves.toContain('"sale_order_line_no_discount"');
  });

  it('unregisters modules from the source manifest and metadata without deleting files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-source-manifest-remove-'));
    await writeSourceManifestFixture(target, ['sale_coupon', 'sale_order_line_no_discount']);
    await mkdir(join(target, 'odoo/custom/src/oca/sale-workflow/sale_order_line_no_discount'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/oca/sale-workflow/sale_order_line_no_discount/__manifest__.py'),
      '{}\n',
      'utf8',
    );

    await removeModuleFromSourceRepo({
      target,
      repoPath: 'sale-workflow',
      sourceType: 'oca',
      moduleName: 'sale_order_line_no_discount',
      deleteFiles: false,
      stage: false,
    });

    await expect(
      stat(join(target, 'odoo/custom/src/oca/sale-workflow/sale_order_line_no_discount')),
    ).resolves.toBeTruthy();
    await expect(readFile(join(target, 'odoo/custom/manifests/sources.yaml'), 'utf8')).resolves.not.toContain(
      'sale_order_line_no_discount',
    );
    await expect(readFile(join(target, markerPath), 'utf8')).resolves.not.toContain(
      'sale_order_line_no_discount',
    );
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
