import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lintOdooAddonPolicy } from '../src/odoo-policy-lint.js';
import { parseOdooAddonPolicy } from '../src/odoo-addon-policy.js';

async function makeTarget(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

describe('Odoo addon policy lint', () => {
  it('warns about Odoo 17+ XML attrs usage when configured by policy', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-attrs-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'views', 'demo_views.xml'),
      '<odoo><field name="x_name" attrs="{\'invisible\': True}"/></odoo>\n',
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base'],
      policy: parseOdooAddonPolicy(['odoo:', '  version: "19.0"', ''].join('\n')),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'addons/demo_module/views/demo_views.xml',
          severity: 'warning',
          issue: 'Odoo policy warning: XML attrs attribute is deprecated for configured Odoo 17+ policy',
        }),
      ]),
    );
  });

  it('warns about direct state writes unless the line has an explicit reasoned ignore', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-state-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'models', 'demo_model.py'),
      [
        'class Demo:',
        '    def action_bad(self):',
        '        self.write({"state": "done"})',
        '',
        '    def migration_compat(self):',
        '        # wpmoo-lint: disable=direct-state-write reason="legacy migration adapter"',
        '        self.write({"state": "legacy"})',
        '',
      ].join('\n'),
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base'],
      policy: parseOdooAddonPolicy(['lint:', '  directStateWrite: true', ''].join('\n')),
    });

    expect(issues.filter((issue) => issue.issue.includes('direct state write'))).toEqual([
      expect.objectContaining({
        moduleName: 'demo_module',
        path: 'addons/demo_module/models/demo_model.py',
        severity: 'warning',
        issue: 'Odoo policy warning: direct state write detected; use an action method or service hook',
      }),
    ]);
  });

  it('warns about controller ORM writes when configured by policy', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-controller-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'controllers', 'main.py'),
      [
        'class DemoController:',
        '    def submit(self, record):',
        '        record.sudo().write({"name": "Changed"})',
        '',
      ].join('\n'),
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base'],
      policy: parseOdooAddonPolicy(['lint:', '  controllerWrites: true', ''].join('\n')),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'addons/demo_module/controllers/main.py',
          severity: 'warning',
          issue: 'Odoo policy warning: controller performs ORM write; move business logic to model or service layer',
        }),
      ]),
    );
  });

  it('warns when notification XML is loaded without the configured mail dependency', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-notification-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'data', 'mail_template.xml'),
      '<odoo><record id="mail_template_demo" model="mail.template"/></odoo>\n',
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base'],
      policy: parseOdooAddonPolicy(
        ['lint:', '  notificationDependency:', '    requiredDependency: moo_mail', ''].join('\n'),
      ),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'addons/demo_module/__manifest__.py',
          severity: 'warning',
          issue: 'Odoo policy warning: notification XML requires manifest dependency moo_mail',
        }),
      ]),
    );
  });
});
