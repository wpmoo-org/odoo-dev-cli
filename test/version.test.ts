import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { packageVersion, renderVersion } from '../src/version.js';

describe('version', () => {
  it('renders the package name and current package version', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
      version: string;
    };

    expect(packageVersion()).toBe(packageJson.version);
    expect(renderVersion()).toBe(`${packageJson.name} ${packageJson.version}`);
  });
});
