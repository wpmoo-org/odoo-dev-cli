import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type AliasPackageJson = {
  name: string;
  version: string;
  description: string;
  type: string;
  bin: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
};

const rootPackageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function readAliasPackage(relativePath: string): AliasPackageJson {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as AliasPackageJson;
}

describe('alias package metadata', () => {
  it('publishes wpmoo as the short npx alias for @wpmoo/toolkit', () => {
    const packageJson = readAliasPackage('../packages/wpmoo/package.json');
    const bin = readFileSync(new URL('../packages/wpmoo/bin/wpmoo.js', import.meta.url), 'utf8');

    expect(packageJson.name).toBe('wpmoo');
    expect(packageJson.version).toBe(rootPackageJson.version);
    expect(packageJson.description).toBe('Short npx alias for the WPMoo Toolkit CLI.');
    expect(packageJson.type).toBe('module');
    expect(packageJson.bin).toEqual({ wpmoo: 'bin/wpmoo.js' });
    expect(packageJson.files).toEqual(['bin']);
    expect(packageJson.dependencies).toEqual({ '@wpmoo/toolkit': rootPackageJson.version });
    expect(bin).toContain("import { runCli } from '@wpmoo/toolkit';");
    expect(bin).not.toContain('Package renamed');
  });

  it('keeps @wpmoo/odoo as a legacy redirect to @wpmoo/toolkit', () => {
    const packageJson = readAliasPackage('../packages/odoo-compat/package.json');
    const bin = readFileSync(new URL('../packages/odoo-compat/bin/wpmoo.js', import.meta.url), 'utf8');

    expect(packageJson.name).toBe('@wpmoo/odoo');
    expect(packageJson.version).toBe(rootPackageJson.version);
    expect(packageJson.description).toBe('Legacy compatibility package for the WPMoo Toolkit CLI.');
    expect(packageJson.dependencies).toEqual({ '@wpmoo/toolkit': rootPackageJson.version });
    expect(bin).toContain("Package renamed: @wpmoo/odoo is now @wpmoo/toolkit.");
    expect(bin).toContain("Use: npx @wpmoo/toolkit");
    expect(bin).toContain("import { runCli } from '@wpmoo/toolkit';");
  });

  it('keeps @wpmoo/odoo-dev as a legacy redirect to @wpmoo/toolkit', () => {
    const packageJson = readAliasPackage('../packages/odoo-dev-compat/package.json');
    const bin = readFileSync(new URL('../packages/odoo-dev-compat/bin/wpmoo.js', import.meta.url), 'utf8');

    expect(packageJson.name).toBe('@wpmoo/odoo-dev');
    expect(packageJson.version).toBe(rootPackageJson.version);
    expect(packageJson.description).toBe('Legacy compatibility package for the WPMoo Toolkit CLI.');
    expect(packageJson.dependencies).toEqual({ '@wpmoo/toolkit': rootPackageJson.version });
    expect(bin).toContain("Package renamed: @wpmoo/odoo-dev is now @wpmoo/toolkit.");
    expect(bin).toContain("Use: npx @wpmoo/toolkit");
    expect(bin).toContain("import { runCli } from '@wpmoo/toolkit';");
  });
});
