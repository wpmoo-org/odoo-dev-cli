import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { addModuleToSourceRepo } from '../src/module-actions.js';

const moduleName = 'sales_tracker';
const technicalModel = 'sales.tracker';

describe('generated module scaffold v2 defaults', () => {
  it('writes Train 4 quality defaults for a fresh module scaffold', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-v2-defaults-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    const report = await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName,
      odooVersion: '19.0',
      stage: false,
    });

    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module', moduleName);
    const manifest = await readFile(join(modulePath, '__manifest__.py'), 'utf8');

    expect(manifest).toContain('"depends": ["base"]');
    expect(manifest).toContain('"license": "LGPL-3"');
    expect(manifest).toContain('"installable": True');
    expect(manifest).toContain('"application": False');
    expect(manifest).toContain('"data": [');
    expect(manifest).toContain('"security/ir.model.access.csv"');
    expect(manifest).toContain(`"views/${moduleName}_views.xml"`);
    expect(manifest).toContain(`"views/${moduleName}_menus.xml"`);

    await expect(readFile(join(modulePath, 'security/ir.model.access.csv'), 'utf8')).resolves.toContain(
      `access_${moduleName}_user`,
    );
    await expect(readFile(join(modulePath, 'security/ir.model.access.csv'), 'utf8')).resolves.toContain(
      `model_${moduleName.replace(/[-.]/g, '_')}`,
    );

    await expect(readFile(join(modulePath, '__init__.py'), 'utf8')).resolves.toBe('from . import models\n');
    await expect(readFile(join(modulePath, 'models/__init__.py'), 'utf8')).resolves.toContain(`from . import ${moduleName}`);
    await expect(readFile(join(modulePath, `models/${moduleName}.py`), 'utf8')).resolves.toContain(`_name = "${technicalModel}"`);

    const views = await readFile(join(modulePath, `views/${moduleName}_views.xml`), 'utf8');
    expect(views).toContain(`id="view_${moduleName}_list"`);
    expect(views).toContain(`model">${technicalModel}</field>`);
    expect(views).toContain('<form ');

    const menus = await readFile(join(modulePath, `views/${moduleName}_menus.xml`), 'utf8');
    expect(menus).toContain(`id="action_${moduleName}"`);
    expect(menus).toContain('model="ir.actions.act_window"');
    expect(menus).toContain(`action="action_${moduleName}"`);
    expect(menus).toContain('groups="base.group_user"');

    await expect(readFile(join(modulePath, `tests/__init__.py`), 'utf8')).resolves.toContain(`from . import test_${moduleName}`);
    await expect(readFile(join(modulePath, `tests/test_${moduleName}.py`), 'utf8')).resolves.toContain('class TestSalesTracker');
    await expect(stat(join(modulePath, 'views/.gitkeep'))).resolves.toBeTruthy();
    await expect(stat(join(modulePath, 'controllers'))).rejects.toThrow();

    expect(report.checks.every((check) => check.ok)).toBe(true);
    expect(report.warnings).toEqual([]);
    expect(report.checks.map((check) => check.id)).toEqual([
      'manifest',
      'model',
      'access',
      'views',
      'menus',
      'tests',
      'registration',
    ]);
  });

  it('writes portal profile files without changing generic scaffold requirements', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-v2-portal-profile-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    const report = await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'customer_portal',
      odooVersion: '19.0',
      profile: 'portal',
      stage: false,
    });

    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module/customer_portal');
    const manifest = await readFile(join(modulePath, '__manifest__.py'), 'utf8');

    expect(manifest).toContain('"depends": ["base", "portal", "website"]');
    expect(manifest).toContain('"views/customer_portal_portal_templates.xml"');
    await expect(readFile(join(modulePath, '__init__.py'), 'utf8')).resolves.toContain('from . import controllers');
    await expect(readFile(join(modulePath, 'controllers/__init__.py'), 'utf8')).resolves.toBe('from . import main\n');
    await expect(readFile(join(modulePath, 'controllers/main.py'), 'utf8')).resolves.toContain(
      '@http.route("/customer-portal", type="http", auth="public", website=True)',
    );
    await expect(readFile(join(modulePath, 'views/customer_portal_portal_templates.xml'), 'utf8')).resolves.toContain(
      't-call="website.layout"',
    );
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it('writes scoring profile dependencies and extension placeholders', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-v2-scoring-profile-'));
    await mkdir(join(target, 'odoo/custom/src/private/odoo_sample_module'), { recursive: true });

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName: 'event_scoring',
      odooVersion: '19.0',
      profile: 'scoring',
      stage: false,
    });

    const modulePath = join(target, 'odoo/custom/src/private/odoo_sample_module/event_scoring');
    const manifest = await readFile(join(modulePath, '__manifest__.py'), 'utf8');

    expect(manifest).toContain('"depends": ["base", "mail"]');
    await expect(stat(join(modulePath, 'data/.gitkeep'))).resolves.toBeTruthy();
    await expect(stat(join(modulePath, 'reports/.gitkeep'))).resolves.toBeTruthy();
  });

  it('keeps existing user files intact when re-scaffolding a partially existing module', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-v2-partial-'));
    const repoRoot = join(target, 'odoo/custom/src/private/odoo_sample_module');
    const modulePath = join(repoRoot, moduleName);

    const userManifest = `{
    "name": "Sales Tracker",
    "version": "19.0.2.0.0",
    "summary": "Sales tracker with custom metadata",
    "depends": ["base", "sale"],
    "data": [
        "security/ir.model.access.csv",
        "views/${moduleName}_views.xml",
        "views/${moduleName}_menus.xml",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
`;
    const userModuleInit = 'from . import models\nfrom . import legacy_helper\n';
    const userModelInit = `from . import ${moduleName}\nfrom . import helper\n`;
    const userModel = `from odoo import fields, models


class ${moduleName.split('_').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join('')}(models.Model):
    _name = "${technicalModel}"
    _description = "Custom sales tracker"

    name = fields.Char(required=True, default="Custom")
`;
    const userAccess = [
      'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
      `access_${moduleName}_user,access_${moduleName}_user,model_${moduleName.replace(/[-.]/g, '_')},base.group_user,1,1,1,1`,
      '',
    ].join('\n');
    const userTestsInit = 'from . import test_sales_tracker\nfrom . import test_sales_tracker_old\n';
    const userTests = [
      'from odoo.tests import tagged',
      'from odoo.tests.common import TransactionCase',
      '',
      '',
      '@tagged("post_install", "-at_install")',
      'class TestSalesTracker(TransactionCase):',
      '',
      '    def test_create_record(self):',
      `        self.env["${technicalModel}"]`,
      '        self.assertTrue(True)',
      '',
    ].join('\n');
    const userViews = `<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="view_${moduleName}_list" model="ir.ui.view">
        <field name="name">sales.tracker.list</field>
        <field name="model">${technicalModel}</field>
        <field name="arch" type="xml">
            <list string="Sales tracker">
                <field name="name"/>
            </list>
        </field>
    </record>
    <record id="view_${moduleName}_form" model="ir.ui.view">
        <field name="name">sales.tracker.form</field>
        <field name="model">${technicalModel}</field>
        <field name="arch" type="xml">
            <form string="Sales tracker">
                <sheet>
                    <group>
                        <field name="name"/>
                    </group>
                </sheet>
            </form>
        </field>
    </record>
</odoo>
`;
    const userMenus = `<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="action_${moduleName}" model="ir.actions.act_window">
        <field name="name">Sales Tracker</field>
        <field name="res_model">${technicalModel}</field>
        <field name="view_mode">list,form</field>
    </record>

    <menuitem id="menu_${moduleName}_root" name="Sales" groups="base.group_user" sequence="10"/>
    <menuitem id="menu_${moduleName}" name="Sales Tracker" parent="menu_${moduleName}_root" action="action_${moduleName}" groups="base.group_user" sequence="10"/>
</odoo>
`;

    await mkdir(join(modulePath, 'models'), { recursive: true });
    await mkdir(join(modulePath, 'security'), { recursive: true });
    await mkdir(join(modulePath, 'tests'), { recursive: true });
    await mkdir(join(modulePath, 'views'), { recursive: true });
    await writeFile(join(modulePath, '__manifest__.py'), userManifest, 'utf8');
    await writeFile(join(modulePath, '__init__.py'), userModuleInit, 'utf8');
    await writeFile(join(modulePath, 'models/__init__.py'), userModelInit, 'utf8');
    await writeFile(join(modulePath, `models/${moduleName}.py`), userModel, 'utf8');
    await writeFile(join(modulePath, 'security/ir.model.access.csv'), userAccess, 'utf8');
    await writeFile(join(modulePath, 'tests/__init__.py'), userTestsInit, 'utf8');
    await writeFile(join(modulePath, `tests/test_${moduleName}.py`), userTests, 'utf8');
    await writeFile(join(modulePath, `views/${moduleName}_views.xml`), userViews, 'utf8');
    await writeFile(join(modulePath, `views/${moduleName}_menus.xml`), userMenus, 'utf8');

    const repo = await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module',
      moduleName,
      odooVersion: '19.0',
      stage: false,
    });

    await expect(readFile(join(modulePath, '__manifest__.py'), 'utf8')).resolves.toBe(userManifest);
    await expect(readFile(join(modulePath, '__init__.py'), 'utf8')).resolves.toBe(userModuleInit);
    await expect(readFile(join(modulePath, 'models/__init__.py'), 'utf8')).resolves.toBe(userModelInit);
    await expect(readFile(join(modulePath, `models/${moduleName}.py`), 'utf8')).resolves.toBe(userModel);
    await expect(readFile(join(modulePath, 'security/ir.model.access.csv'), 'utf8')).resolves.toBe(userAccess);
    await expect(readFile(join(modulePath, 'tests/__init__.py'), 'utf8')).resolves.toBe(userTestsInit);
    await expect(readFile(join(modulePath, `tests/test_${moduleName}.py`), 'utf8')).resolves.toBe(userTests);
    await expect(readFile(join(modulePath, `views/${moduleName}_views.xml`), 'utf8')).resolves.toBe(userViews);
    await expect(readFile(join(modulePath, `views/${moduleName}_menus.xml`), 'utf8')).resolves.toBe(userMenus);

    expect(repo.checks.every((check) => check.ok)).toBe(true);
    expect(repo.warnings).toEqual([]);
    expect(reportIsUnchanged(repo)).toBeTruthy();
  });

  it('uses the same quality checks for custom defaults present in partial modules', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-v2-preserve-on-error-'));
    const repoRoot = join(target, 'odoo/custom/src/private/odoo_sample_module');
    const modulePath = join(repoRoot, moduleName);

    await mkdir(modulePath, { recursive: true });
    await mkdir(join(modulePath, 'models'), { recursive: true });
    await mkdir(join(modulePath, 'security'), { recursive: true });
    await mkdir(join(modulePath, 'tests'), { recursive: true });
    await mkdir(join(modulePath, 'views'), { recursive: true });

    await writeFile(
      join(modulePath, '__manifest__.py'),
      `{
    "name": "Sales Tracker",
    "version": "19.0.1.0.0",
    "summary": "Custom partial module",
    "depends": ["base"],
    "data": [
        "security/ir.model.access.csv",
        "views/${moduleName}_views.xml",
        "views/${moduleName}_menus.xml",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
`,
      'utf8',
    );
    await writeFile(join(modulePath, '__init__.py'), 'from . import models\n', 'utf8');
    await writeFile(join(modulePath, 'models/__init__.py'), `from . import ${moduleName}\n`, 'utf8');
    await writeFile(
      join(modulePath, `models/${moduleName}.py`),
      `from odoo import fields, models


class SalesTracker(models.Model):
    _name = "${technicalModel}"
`,
      'utf8',
    );
    await writeFile(
      join(modulePath, 'security/ir.model.access.csv'),
      [
        'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
        `access_${moduleName}_user,access_${moduleName}_user,model_${moduleName.replace(/[-.]/g, '_')},base.group_user,1,1,1,1`,
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(join(modulePath, 'tests/__init__.py'), 'from . import test_sales_tracker\n', 'utf8');
    await writeFile(join(modulePath, `tests/test_${moduleName}.py`), 'def test_smoke():\n    pass\n', 'utf8');
    await writeFile(
      join(modulePath, `views/${moduleName}_views.xml`),
      '<?xml version="1.0" encoding="utf-8"?>\n<odoo></odoo>\n',
      'utf8',
    );
    await writeFile(
      join(modulePath, `views/${moduleName}_menus.xml`),
      '<?xml version="1.0" encoding="utf-8"?>\n<odoo></odoo>\n',
      'utf8',
    );

    const beforeManifest = await readFile(join(modulePath, '__manifest__.py'), 'utf8');
    const beforeModelFile = await readFile(join(modulePath, `models/${moduleName}.py`), 'utf8');

    await expect(
      addModuleToSourceRepo({
        target,
        repoPath: 'odoo_sample_module',
        moduleName,
        odooVersion: '19.0',
        stage: false,
      }),
    ).rejects.toThrow('missing action menu action_sales_tracker');

    await expect(readFile(join(modulePath, '__manifest__.py'), 'utf8')).resolves.toBe(beforeManifest);
    await expect(readFile(join(modulePath, `models/${moduleName}.py`), 'utf8')).resolves.toBe(beforeModelFile);
    await expect(readFile(join(modulePath, `views/${moduleName}_menus.xml`), 'utf8')).resolves.toBe(
      '<?xml version="1.0" encoding="utf-8"?>\n<odoo></odoo>\n',
    );
    await expect(stat(join(modulePath, 'views/.gitkeep'))).resolves.toBeTruthy();
  });
});

function reportIsUnchanged(report: { warnings: string[]; checks: Array<{ ok: boolean }> }): boolean {
  return report.warnings.length === 0 && report.checks.every((check) => check.ok);
}
