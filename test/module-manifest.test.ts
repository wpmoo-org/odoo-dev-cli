import { describe, expect, it } from 'vitest';

import { parseOdooManifest } from '../src/module-manifest.js';

describe('Odoo module manifest parser', () => {
  it('parses a typical __manifest__.py dictionary', () => {
    const content = `{
  "name": "Demo Module",
  'version': "19.0.1.0.0",
  "depends": ["base", "mail",],
  'data': [
    "security/ir.model.access.csv",
    'views/demo_views.xml',
    'views/demo_menus.xml',
  ],
  "installable": True,
  'application': False,
  "license": "LGPL-3",
}`;

    const result = parseOdooManifest(content);

    expect(result).toEqual({
      ok: true,
      manifest: {
        name: 'Demo Module',
        version: '19.0.1.0.0',
        depends: ['base', 'mail'],
        data: ['security/ir.model.access.csv', 'views/demo_views.xml', 'views/demo_menus.xml'],
        installable: true,
        application: false,
        license: 'LGPL-3',
      },
    });
  });

  it('supports single-quoted keys and comments', () => {
    const content = `{
  'name': 'Simple',
  # comment
  'depends': [],
  'data': [],
  'demo': ['demo/simple_demo.xml'],
  'installable': False,
  'application': True,
}`;

    const result = parseOdooManifest(content);

    expect(result).toEqual({
      ok: true,
      manifest: {
        name: 'Simple',
        depends: [],
        data: [],
        demo: ['demo/simple_demo.xml'],
        installable: false,
        application: true,
      },
    });
  });

  it('preserves common numeric metadata and nested asset dictionaries', () => {
    const content = `{
  "name": "Rich Module",
  "sequence": 10,
  "price": 0.0,
  "assets": {
    "web.assets_backend": [
      "rich_module/static/src/js/rich_module.js",
    ],
  },
  "installable": True,
}`;

    const result = parseOdooManifest(content);

    expect(result).toEqual({
      ok: true,
      manifest: {
        name: 'Rich Module',
        sequence: 10,
        price: 0,
        assets: {
          'web.assets_backend': ['rich_module/static/src/js/rich_module.js'],
        },
        installable: true,
      },
    });
  });

  it('returns a parser error for invalid booleans', () => {
    const content = `{
  "name": "Bad Module",
  "installable": true,
}`;

    const result = parseOdooManifest(content);

    expect(result).toEqual({ ok: false, error: expect.stringContaining('unsupported identifier') });
  });

  it('returns a parser error for non-string list values', () => {
    const content = `{
  "name": "Bad Module",
  "depends": ["base", 2],
}`;

    const result = parseOdooManifest(content);

    expect(result).toEqual({ ok: false, error: expect.stringContaining('depends must be a list of strings') });
  });

  it('returns a parser error for non-string demo values', () => {
    const content = `{
  "name": "Bad Module",
  "demo": ["demo/data.xml", 2],
}`;

    const result = parseOdooManifest(content);

    expect(result).toEqual({ ok: false, error: expect.stringContaining('demo must be a list of strings') });
  });

  it('returns a parser error for syntax errors', () => {
    const content = `{
  "name": "Bad",
  "version": "19.0"
  "installable": True,
}`;

    const result = parseOdooManifest(content);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Parse error at') });
    if (result.ok === false) {
      expect(result.error).toContain("expected ',' or '}'");
    }
  });
});
