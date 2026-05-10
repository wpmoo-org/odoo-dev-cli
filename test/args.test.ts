import { describe, expect, it } from 'vitest';

import { optionsFromArgs } from '../src/args.js';

describe('args', () => {
  it('parses false boolean values explicitly', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_olympiad',
      '--init-empty-repos=false',
      '--stage=false',
    ]);

    expect(options?.initEmptyRepos).toBe(false);
    expect(options?.stage).toBe(false);
  });

  it('parses comma-separated addon lists', () => {
    const options = optionsFromArgs([
      '--product',
      'moo_olympiad',
      '--community-addons',
      'moo_olympiad,moo_olympiad_portal',
      '--pro-addons',
      'moo_olympiad_payment',
    ]);

    expect(options?.communityAddons).toEqual(['moo_olympiad', 'moo_olympiad_portal']);
    expect(options?.proAddons).toEqual(['moo_olympiad_payment']);
  });
});

