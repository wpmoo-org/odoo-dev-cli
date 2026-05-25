import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeModuleDirectory,
  scanModuleQuality,
  type ModuleQualitySummary,
} from '../src/module-quality.js';

type ScanResultWithDependencyGraph = ModuleQualitySummary & {
  dependencyGraph?: {
    dependencies: Array<{
      moduleName: string;
      dependency: string;
      kind: 'local' | 'external' | 'unresolved';
    }>;
    missingDependencies: Array<{
      moduleName: string;
      dependency: string;
    }>;
    cycles: string[][];
  };
};

async function makeTarget(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function formatPyList(values: string[]): string {
  return `[${values.map((value) => `"${value}"`).join(', ')}]`;
}

function buildManifest(overrides: {
  includeLicense?: boolean;
  depends?: string[];
  data?: string[];
  includeDepends?: boolean;
}) {
  const lines: string[] = [
    '{',
    "  'name': 'Demo',",
    "  'installable': True,",
    "  'version': '1.0.0',",
  ];

  if (overrides.includeLicense ?? true) {
    lines.push("  'license': 'LGPL-3',");
  }

  if (overrides.includeDepends ?? true) {
    lines.push(`  'depends': ${formatPyList(overrides.depends ?? ['base'])},`);
  }

  lines.push(`  'data': ${formatPyList(overrides.data ?? ['security/ir.model.access.csv', 'views/demo_views.xml'])},`);
  lines.push('}');

  return lines.join('\n');
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function writeMenuXml(modulePath: string, moduleName: string): Promise<void> {
  await writeText(
    join(modulePath, 'views', `${moduleName}_menus.xml`),
    [
      '<odoo><record',
      ` id="action_${moduleName}" model="ir.actions.act_window"/>`,
      ` <menuitem id="menu_${moduleName}" action="action_${moduleName}"/>`,
      '</odoo>',
      '',
    ].join(''),
  );
}

async function writeModelScaffold(modulePath: string, moduleName: string): Promise<void> {
  await writeText(join(modulePath, 'models', '__init__.py'), `from . import ${moduleName}\n`);
  await writeText(join(modulePath, 'models', `${moduleName}.py`), 'from odoo import models\n');
}

async function writeStandardQualityFiles(modulePath: string, moduleName: string): Promise<void> {
  await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
  await writeText(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
  await writeText(join(modulePath, 'views', 'demo_views.xml'), '<odoo></odoo>\n');
  await writeMenuXml(modulePath, moduleName);
  await mkdir(join(modulePath, 'tests'), { recursive: true });
}

describe('analyzeModuleDirectory module quality v2 checks', () => {
  it('returns actionable errors when manifest syntax is invalid', async () => {
    const target = await makeTarget('wpmoo-module-quality-invalid-manifest-');
    const modulePath = join(target, 'demo_module');
    await writeText(join(modulePath, '__manifest__.py'), '{\n  \'name\': \'Demo\',\n  \'installable\': True\n');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: expect.stringContaining('invalid manifest syntax'),
        }),
      ]),
    );
  });

  it('flags missing manifest license', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-license-');
    const modulePath = join(target, 'demo_module');
    await writeText(join(modulePath, '__manifest__.py'), buildManifest({ includeLicense: false }));
    await writeStandardQualityFiles(modulePath, 'demo_module');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing license in __manifest__.py',
        },
      ]),
    );
  });

  it('flags explicitly non-installable manifests', async () => {
    const target = await makeTarget('wpmoo-module-quality-noninstallable-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'] }).replace("'installable': True", "'installable': False"),
    );
    await writeStandardQualityFiles(modulePath, 'demo_module');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.installable).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'installable is false in __manifest__.py',
        },
      ]),
    );
  });

  it('treats omitted installable as installable because Odoo defaults it to true', async () => {
    const target = await makeTarget('wpmoo-module-quality-default-installable-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'] }).replace("  'installable': True,\n", ''),
    );
    await writeStandardQualityFiles(modulePath, 'demo_module');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.installable).toBe(true);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'installable is false in __manifest__.py',
        },
      ]),
    );
  });

  it('flags missing depends in __manifest__.py', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-depends-');
    const modulePath = join(target, 'demo_module');
    await writeText(join(modulePath, '__manifest__.py'), buildManifest({ includeDepends: false }));
    await writeStandardQualityFiles(modulePath, 'demo_module');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing depends in __manifest__.py',
        },
      ]),
    );
  });

  it('flags model modules missing base dependency', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-base-dep-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['mail'], data: ['security/ir.model.access.csv', 'views/demo_views.xml'] }),
    );
    await writeStandardQualityFiles(modulePath, 'demo_module');
    await writeModelScaffold(modulePath, 'demo_model');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing base dependency for model-based module',
        },
      ]),
    );
  });

  it('flags __init__.py without models import', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-root-init-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'], data: ['security/ir.model.access.csv', 'views/demo_views.xml'] }),
    );
    await writeStandardQualityFiles(modulePath, 'demo_module');
    await writeText(join(modulePath, '__init__.py'), '# Intentionally empty\n');
    await writeModelScaffold(modulePath, 'demo_model');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing __init__.py models import',
        },
      ]),
    );
  });

  it('flags models/__init__.py without model imports', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-model-init-import-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'], data: ['security/ir.model.access.csv', 'views/demo_views.xml'] }),
    );
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeText(join(modulePath, 'models', '__init__.py'), '# Intentionally empty\n');
    await writeText(join(modulePath, 'models', 'demo_model.py'), 'from odoo import models\n');
    await writeMenuXml(modulePath, 'demo_module');
    await writeText(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
    await writeText(join(modulePath, 'views', 'demo_views.xml'), '<odoo></odoo>\n');
    await mkdir(join(modulePath, 'tests'), { recursive: true });

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing models/__init__.py model import',
        },
      ]),
    );
  });

  it('flags module data missing access rights csv', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-access-csv-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'], data: ['views/demo_views.xml'] }),
    );
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeMenuXml(modulePath, 'demo_module');
    await writeText(join(modulePath, 'views', 'demo_views.xml'), '<odoo></odoo>\n');
    await mkdir(join(modulePath, 'tests'), { recursive: true });

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing security/ir.model.access.csv in manifest data',
        },
      ]),
    );
  });

  it('flags missing views XML files', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-views-xml-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'], data: ['security/ir.model.access.csv'] }),
    );
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await mkdir(join(modulePath, 'security'), { recursive: true });
    await writeText(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
    await mkdir(join(modulePath, 'tests'), { recursive: true });

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing views XML under views/',
        },
      ]),
    );
  });

  it('flags missing manifest data and demo file references', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-manifest-files-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      [
        '{',
        "  'name': 'Demo',",
        "  'installable': True,",
        "  'license': 'LGPL-3',",
        "  'depends': ['base'],",
        "  'data': ['security/ir.model.access.csv', 'views/missing_views.xml'],",
        "  'demo': ['demo/missing_demo.xml'],",
        '}',
      ].join('\n'),
    );
    await writeStandardQualityFiles(modulePath, 'demo_module');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing manifest data file: views/missing_views.xml',
          severity: 'error',
        }),
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing manifest demo file: demo/missing_demo.xml',
          severity: 'warning',
        }),
      ]),
    );
  });

  it('flags access CSV model IDs that do not match declared models', async () => {
    const target = await makeTarget('wpmoo-module-quality-access-model-id-');
    const modulePath = join(target, 'demo_module');
    await writeText(join(modulePath, '__manifest__.py'), buildManifest({ depends: ['base'] }));
    await writeStandardQualityFiles(modulePath, 'demo_module');
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeText(join(modulePath, 'models', '__init__.py'), 'from . import demo_model\n');
    await writeText(
      join(modulePath, 'models', 'demo_model.py'),
      "from odoo import models\n\nclass DemoModel(models.Model):\n    _name = 'demo.model'\n",
    );
    await writeText(
      join(modulePath, 'security', 'ir.model.access.csv'),
      [
        'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
        'access_demo_wrong,demo wrong,model_wrong_model,base.group_user,1,0,0,0',
        '',
      ].join('\n'),
    );

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'access CSV references unknown model id: model_wrong_model',
          severity: 'error',
        }),
      ]),
    );
  });

  it('flags view and action model references that do not match declared Python models', async () => {
    const target = await makeTarget('wpmoo-module-quality-xml-model-ref-');
    const modulePath = join(target, 'demo_module');
    await writeText(join(modulePath, '__manifest__.py'), buildManifest({ depends: ['base'] }));
    await writeStandardQualityFiles(modulePath, 'demo_module');
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeText(join(modulePath, 'models', '__init__.py'), 'from . import demo_model\n');
    await writeText(
      join(modulePath, 'models', 'demo_model.py'),
      "from odoo import models\n\nclass DemoModel(models.Model):\n    _name = 'demo.model'\n",
    );
    await writeText(
      join(modulePath, 'views', 'demo_views.xml'),
      [
        '<odoo>',
        '  <record id="view_demo_model_form" model="ir.ui.view">',
        '    <field name="name">demo.model.form</field>',
        '    <field name="model">wrong.model</field>',
        '    <field name="arch" type="xml"><form/></field>',
        '  </record>',
        '</odoo>',
        '',
      ].join('\n'),
    );
    await writeText(
      join(modulePath, 'views', 'demo_module_menus.xml'),
      [
        '<odoo>',
        '  <record id="action_demo_module" model="ir.actions.act_window">',
        '    <field name="name">Demo</field>',
        '    <field name="res_model">wrong.model</field>',
        '  </record>',
        '  <menuitem id="menu_demo_module" action="action_demo_module"/>',
        '</odoo>',
        '',
      ].join('\n'),
    );

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'view XML references unknown model name: wrong.model',
          severity: 'error',
        }),
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'action XML references unknown res_model: wrong.model',
          severity: 'error',
        }),
      ]),
    );
  });

  it('flags menu items whose action points to a missing action record', async () => {
    const target = await makeTarget('wpmoo-module-quality-menu-action-ref-');
    const modulePath = join(target, 'demo_module');
    await writeText(join(modulePath, '__manifest__.py'), buildManifest({ depends: ['base'] }));
    await writeStandardQualityFiles(modulePath, 'demo_module');
    await writeText(
      join(modulePath, 'views', 'demo_module_menus.xml'),
      [
        '<odoo>',
        '  <record id="action_demo_module" model="ir.actions.act_window"/>',
        '  <menuitem id="menu_demo_module" action="action_missing"/>',
        '</odoo>',
        '',
      ].join('\n'),
    );

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'menu XML references missing action id: action_missing',
          severity: 'error',
        }),
      ]),
    );
  });

  it('accepts bucket navigation when actions and menus use non-module XML ids in any views XML file', async () => {
    const target = await makeTarget('wpmoo-module-quality-bucket-menu-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'], data: ['security/ir.model.access.csv', 'views/menu.xml'] }),
    );
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeText(join(modulePath, 'models', '__init__.py'), 'from . import demo_model\n');
    await writeText(
      join(modulePath, 'models', 'demo_model.py'),
      "from odoo import models\n\nclass DemoModel(models.Model):\n    _name = 'demo.model'\n",
    );
    await writeText(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
    await mkdir(join(modulePath, 'tests'), { recursive: true });
    await writeText(
      join(modulePath, 'views', 'menu.xml'),
      [
        '<odoo>',
        '  <record id="action_demo_projects" model="ir.actions.act_window">',
        '    <field name="name">Projects</field>',
        '    <field name="res_model">demo.model</field>',
        '  </record>',
        '  <menuitem id="menu_projects_bucket" name="Projects"/>',
        '  <menuitem id="menu_demo_projects" parent="menu_projects_bucket" action="action_demo_projects"/>',
        '</odoo>',
        '',
      ].join('\n'),
    );

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.hasMenuAction).toBe(true);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing actionable menu XML',
        }),
      ]),
    );
  });

  it('detects actionable menus from XML data files outside views', async () => {
    const target = await makeTarget('wpmoo-module-quality-data-menu-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'], data: ['security/ir.model.access.csv', 'data/navigation.xml'] }),
    );
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeText(join(modulePath, 'models', '__init__.py'), 'from . import demo_model\n');
    await writeText(
      join(modulePath, 'models', 'demo_model.py'),
      "from odoo import models\n\nclass DemoModel(models.Model):\n    _name = 'demo.model'\n",
    );
    await writeText(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
    await writeText(
      join(modulePath, 'data', 'navigation.xml'),
      [
        '<odoo>',
        '  <record id="action_demo_records" model="ir.actions.act_window">',
        '    <field name="name">Records</field>',
        '    <field name="res_model">demo.model</field>',
        '  </record>',
        '  <menuitem id="menu_demo_records" action="demo_module.action_demo_records"/>',
        '</odoo>',
        '',
      ].join('\n'),
    );
    await mkdir(join(modulePath, 'tests'), { recursive: true });

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.hasMenuAction).toBe(true);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing actionable menu XML',
        }),
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing views XML under views/',
        }),
      ]),
    );
  });

  it('flags missing tests directory', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-tests-dir-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, '__manifest__.py'),
      buildManifest({ depends: ['base'] }),
    );
    await writeText(join(modulePath, '__init__.py'), 'from . import models\n');
    await writeText(join(modulePath, 'security', 'ir.model.access.csv'), 'id,name\n');
    await writeText(join(modulePath, 'views', 'demo_views.xml'), '<odoo></odoo>\n');
    await writeMenuXml(modulePath, 'demo_module');

    const result = await analyzeModuleDirectory(modulePath, 'demo_module', 'repo/demo_module');

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'demo_module',
          path: 'repo/demo_module',
          issue: 'missing tests directory',
        },
      ]),
    );
  });
});

describe('scanModuleQuality dependency graph checks', () => {
  it('reports duplicate addon technical names across nested source roots', async () => {
    const target = await makeTarget('wpmoo-module-quality-duplicate-addon-');
    const modulesRoot = join(target, 'odoo/custom/src/private');
    const communityPath = join(modulesRoot, 'community/addons/demo_duplicate');
    const proPath = join(modulesRoot, 'pro/addons/demo_duplicate');
    await writeText(join(communityPath, '__manifest__.py'), buildManifest({ depends: ['base'] }));
    await writeStandardQualityFiles(communityPath, 'demo_duplicate');
    await writeText(join(proPath, '__manifest__.py'), buildManifest({ depends: ['base'] }));
    await writeStandardQualityFiles(proPath, 'demo_duplicate');

    const result = await scanModuleQuality(modulesRoot, target);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_duplicate',
          issue: expect.stringContaining('duplicate addon technical name: demo_duplicate'),
          severity: 'error',
        }),
      ]),
    );
    expect(result.issues.find((issue) => issue.issue.includes('duplicate addon technical name'))?.issue).toContain(
      'odoo/custom/src/private/community/addons/demo_duplicate',
    );
    expect(result.issues.find((issue) => issue.issue.includes('duplicate addon technical name'))?.issue).toContain(
      'odoo/custom/src/private/pro/addons/demo_duplicate',
    );
  });

  it('does not report duplicate addon names when community and pro addon names differ', async () => {
    const target = await makeTarget('wpmoo-module-quality-distinct-addon-');
    const modulesRoot = join(target, 'odoo/custom/src/private');
    const communityPath = join(modulesRoot, 'community/addons/demo_community');
    const proPath = join(modulesRoot, 'pro/addons/demo_pro');
    await writeText(join(communityPath, '__manifest__.py'), buildManifest({ depends: ['base'] }));
    await writeStandardQualityFiles(communityPath, 'demo_community');
    await writeText(join(proPath, '__manifest__.py'), buildManifest({ depends: ['base'] }));
    await writeStandardQualityFiles(proPath, 'demo_pro');

    const result = await scanModuleQuality(modulesRoot, target);

    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: expect.stringContaining('duplicate addon technical name'),
        }),
      ]),
    );
  });

  it('reports missing local dependencies', async () => {
    const target = await makeTarget('wpmoo-module-quality-missing-local-dependency-');
    const modulesRoot = join(target, 'modules');
    const modules = [
      {
        name: 'module_one',
        manifest: buildManifest({
          depends: ['base', 'module_two'],
          data: ['security/ir.model.access.csv', 'views/demo_views.xml'],
        }),
      },
    ];

    for (const item of modules) {
      const modulePath = join(modulesRoot, item.name);
      await writeText(join(modulePath, '__manifest__.py'), item.manifest);
      await writeStandardQualityFiles(modulePath, item.name);
    }

    const result = (await scanModuleQuality(modulesRoot, target)) as ScanResultWithDependencyGraph;

    expect(result.dependencyGraph?.dependencies).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'module_one',
          dependency: 'base',
          kind: 'external',
        },
        {
          moduleName: 'module_one',
          dependency: 'module_two',
          kind: 'unresolved',
        },
      ]),
    );
    expect(result.dependencyGraph?.missingDependencies).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'module_one',
          dependency: 'module_two',
        },
      ]),
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'module_one',
          issue: 'missing local dependency module_two',
        }),
      ]),
    );
  });

  it('reports obvious local dependency cycles', async () => {
    const target = await makeTarget('wpmoo-module-quality-cycle-');
    const modulesRoot = join(target, 'modules');

    const moduleAPath = join(modulesRoot, 'module_a');
    const moduleBPath = join(modulesRoot, 'module_b');

    await writeText(
      join(moduleAPath, '__manifest__.py'),
      buildManifest({ depends: ['base', 'module_b'], data: ['security/ir.model.access.csv', 'views/demo_views.xml'] }),
    );
    await writeText(
      join(moduleBPath, '__manifest__.py'),
      buildManifest({ depends: ['base', 'module_a'], data: ['security/ir.model.access.csv', 'views/demo_views.xml'] }),
    );

    await writeStandardQualityFiles(moduleAPath, 'module_a');
    await writeStandardQualityFiles(moduleBPath, 'module_b');

    const result = (await scanModuleQuality(modulesRoot, target)) as ScanResultWithDependencyGraph;

    expect(result.dependencyGraph?.dependencies).toEqual(
      expect.arrayContaining([
        {
          moduleName: 'module_a',
          dependency: 'module_b',
          kind: 'local',
        },
        {
          moduleName: 'module_b',
          dependency: 'module_a',
          kind: 'local',
        },
      ]),
    );
    expect(result.dependencyGraph?.cycles).toEqual(
      expect.arrayContaining([expect.arrayContaining(['module_a', 'module_b'])]),
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'module_a',
          issue: 'dependency cycle detected: module_a -> module_b -> module_a',
        }),
        expect.objectContaining({
          moduleName: 'module_b',
          issue: 'dependency cycle detected: module_b -> module_a -> module_b',
        }),
      ]),
    );
  });
});
