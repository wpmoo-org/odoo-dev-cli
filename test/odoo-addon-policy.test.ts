import { describe, expect, it } from 'vitest';

import { parseOdooAddonPolicy } from '../src/odoo-addon-policy.js';

describe('Odoo addon policy parser', () => {
  it('parses configurable addon groups and dependency rules from YAML', () => {
    const policy = parseOdooAddonPolicy(
      [
        'odoo:',
        '  version: "19.0"',
        'enterpriseOnlyDependencies:',
        '  - documents',
        'lint:',
        '  directStateWrite: true',
        '  notificationDependency:',
        '    requiredDependency: moo_mail',
        '  controllerWrites: true',
        'backendMenu:',
        '  severity: error',
        '  allowedTopLevel:',
        '    - Events',
        '    - Projects',
        'notifications:',
        '  requiredAddon: community_mail',
        '  templateModels:',
        '    - mail.template',
        '  ruleModels:',
        '    - community.notification.rule',
        'addonGroups:',
        '  community:',
        '    - community_core',
        '  pro:',
        '    - pro_account',
        'rules:',
        '  - from: community',
        '    mustNotDependOn: pro',
        '    mustNotDependOnEnterpriseOnly: true',
        '  - from: pro',
        '    mayDependOn: community',
        '',
      ].join('\n'),
    );

    expect(policy).toEqual({
      odooVersion: '19.0',
      addonGroups: {
        community: ['community_core'],
        pro: ['pro_account'],
      },
      enterpriseOnlyDependencies: ['documents'],
      lint: {
        directStateWrite: true,
        controllerWrites: true,
        notificationDependency: {
          requiredDependency: 'moo_mail',
        },
      },
      backendMenu: {
        allowedTopLevel: ['Events', 'Projects'],
        severity: 'error',
      },
      notifications: {
        requiredAddon: 'community_mail',
        templateModels: ['mail.template'],
        ruleModels: ['community.notification.rule'],
      },
      rules: [
        {
          from: 'community',
          mustNotDependOn: ['pro'],
          mustNotDependOnEnterpriseOnly: true,
        },
        {
          from: 'pro',
          mayDependOn: ['community'],
        },
      ],
    });
  });
});
