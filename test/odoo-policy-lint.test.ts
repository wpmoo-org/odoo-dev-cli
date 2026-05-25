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

  it('accepts root backend menus that match the configured top-level bucket names', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-menu-pass-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'views', 'menu.xml'),
      [
        '<odoo>',
        '  <menuitem id="menu_events" name="Events"/>',
        '  <menuitem id="menu_event_projects" name="Projects" parent="menu_events"/>',
        '</odoo>',
        '',
      ].join('\n'),
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base'],
      policy: parseOdooAddonPolicy(
        ['backendMenu:', '  allowedTopLevel:', '    - Events', '    - Projects', ''].join('\n'),
      ),
    });

    expect(issues.filter((issue) => issue.issue.includes('top-level backend menu'))).toEqual([]);
  });

  it('warns about uncontrolled root backend menus by default', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-menu-warning-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'views', 'menu.xml'),
      '<odoo><menuitem id="menu_surprise" name="Surprise"/></odoo>\n',
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base'],
      policy: parseOdooAddonPolicy(['backendMenu:', '  allowedTopLevel:', '    - Events', ''].join('\n')),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'addons/demo_module/views/menu.xml',
          severity: 'warning',
          issue: 'Odoo policy warning: uncontrolled top-level backend menu Surprise; use an allowed menu bucket',
        }),
      ]),
    );
  });

  it('can raise backend menu policy violations to errors', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-menu-error-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'views', 'menu.xml'),
      '<odoo><menuitem id="menu_surprise" name="Surprise"/></odoo>\n',
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base'],
      policy: parseOdooAddonPolicy(
        ['backendMenu:', '  severity: error', '  allowedTopLevel:', '    - Events', ''].join('\n'),
      ),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          issue: 'Odoo policy warning: uncontrolled top-level backend menu Surprise; use an allowed menu bucket',
        }),
      ]),
    );
  });

  it('passes notification XML dependency checks when the configured dependency is present', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-notification-pass-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'data', 'mail_template.xml'),
      '<odoo><record id="mail_template_demo" model="community.notification.rule"/></odoo>\n',
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base', 'community_mail'],
      policy: parseOdooAddonPolicy(
        [
          'notifications:',
          '  requiredAddon: community_mail',
          '  templateModels:',
          '    - mail.template',
          '  ruleModels:',
          '    - community.notification.rule',
          '',
        ].join('\n'),
      ),
    });

    expect(issues.filter((issue) => issue.issue.includes('notification XML requires'))).toEqual([]);
  });

  it('warns about hardcoded workflow email content when notification policy is configured', async () => {
    const target = await makeTarget('wpmoo-odoo-policy-lint-hardcoded-mail-');
    const modulePath = join(target, 'demo_module');
    await writeText(
      join(modulePath, 'models', 'demo_model.py'),
      [
        'class Demo:',
        '    def action_notify(self):',
        '        self.env["mail.mail"].create({"subject": "Approved", "body_html": "<p>Done</p>"})',
        '',
      ].join('\n'),
    );

    const issues = await lintOdooAddonPolicy({
      moduleName: 'demo_module',
      modulePath,
      moduleRelativePath: 'addons/demo_module',
      depends: ['base', 'community_mail'],
      policy: parseOdooAddonPolicy(['notifications:', '  requiredAddon: community_mail', ''].join('\n')),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'demo_module',
          path: 'addons/demo_module/models/demo_model.py',
          severity: 'warning',
          issue: 'Odoo policy warning: hardcoded workflow email content detected; use configured notification templates',
        }),
      ]),
    );
  });
});
