import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  pathUnderBase,
  validateModuleName,
  validateRepoPath,
} from '../src/path-validation.js';

describe('path validation', () => {
  it('rejects traversal, absolute paths, and shell-like path separators for repo paths', () => {
    for (const value of ['../repo', '/tmp/repo', 'repo/name', 'repo\\name', 'C:\\repo', 'repo:name', 'repo\0name']) {
      expect(() => validateRepoPath(value)).toThrow('Invalid repo path: use a single path segment without traversal.');
    }
  });

  it('keeps generated module names lower snake case and path-safe', () => {
    expect(validateModuleName('moo_test')).toBe('moo_test');
    for (const value of ['Moo_Test', 'moo-test', '1_moo', 'moo test']) {
      expect(() => validateModuleName(value)).toThrow(
        'Invalid module name: use lower snake_case letters, numbers, and underscores, and start with a letter.',
      );
    }
    expect(() => validateModuleName('../moo')).toThrow(
      'Invalid module name: use a single path segment without traversal.',
    );
  });

  it('resolves a validated child segment under the intended base directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'wpmoo-path-base-'));

    expect(pathUnderBase(base, 'safe_repo', 'repo path')).toBe(join(base, 'safe_repo'));
    expect(() => pathUnderBase(base, '../escape', 'repo path')).toThrow(
      'Invalid repo path: use a single path segment without traversal.',
    );
  });
});
