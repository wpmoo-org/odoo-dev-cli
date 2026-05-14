import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('package metadata', () => {
  it('exposes the canonical wpmoo bin command', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
      version: string;
      readmeFilename: string;
      repository: { type: string; url: string };
      files: string[];
      bin: Record<string, string>;
      exports: string;
      main: string;
      scripts: Record<string, string>;
    };

    expect(packageJson.name).toBe('@wpmoo/odoo');
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.readmeFilename).toBe('README.md');
    expect(packageJson.repository).toMatchObject({
      type: 'git',
      url: 'git+https://github.com/wpmoo-org/wpmoo-odoo.git',
    });
    expect(packageJson.files).toContain('docs/assets');
    expect(packageJson.bin).toMatchObject({
      wpmoo: 'dist/cli.js',
    });
    expect(Object.keys(packageJson.bin)).toEqual(['wpmoo']);
    expect(packageJson.main).toBe('./dist/cli.js');
    expect(packageJson.exports).toBe('./dist/cli.js');
    expect(packageJson.scripts['release:check']).toBe('bash scripts/release-check.sh');
  });
});
