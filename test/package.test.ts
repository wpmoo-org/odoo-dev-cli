import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('package metadata', () => {
  it('exposes direct npx and compatibility bin commands', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
      version: string;
      readmeFilename: string;
      repository: { type: string; url: string };
      files: string[];
      bin: Record<string, string>;
    };

    expect(packageJson.name).toBe('@wpmoo/odoo-dev');
    expect(packageJson.version).toBe('0.8.29');
    expect(packageJson.readmeFilename).toBe('README.md');
    expect(packageJson.repository).toMatchObject({
      type: 'git',
      url: 'git+https://github.com/wpmoo-org/odoo-dev-cli.git',
    });
    expect(packageJson.files).toContain('docs/assets');
    expect(packageJson.bin).toMatchObject({
      'odoo-dev': 'dist/cli.js',
      wpmoo: 'dist/cli.js',
      'wpmoo-odoo-dev': 'dist/cli.js',
      'create-odoo-dev': 'dist/cli.js',
    });
  });
});
