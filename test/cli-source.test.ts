import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('CLI environment maintenance prompts', () => {
  it('does not ask for Odoo version inside environment actions', () => {
    const source = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');

    expect(source).not.toContain("message: 'Odoo version'");
  });
});
