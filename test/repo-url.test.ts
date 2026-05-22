import { describe, expect, it } from 'vitest';

import { inferGitHubOwner, inferRepoPath, normalizeRepositoryUrl } from '../src/repo-url.js';

describe('repo url helpers', () => {
  it('normalizes GitHub org page repository URLs to clone URLs', () => {
    expect(normalizeRepositoryUrl('https://github.com/orgs/wpmoo-org/odoo_sample_module')).toBe(
      'https://github.com/wpmoo-org/odoo_sample_module.git',
    );
  });

  it('infers repository names from HTTPS and SSH URLs', () => {
    expect(inferRepoPath('https://github.com/wpmoo-org/odoo_sample_module.git')).toBe('odoo_sample_module');
    expect(inferRepoPath('git@github.com:wpmoo-org/odoo_sample_module_dev.git')).toBe('odoo_sample_module_dev');
  });

  it('rejects URLs that cannot produce a repository segment', () => {
    expect(() => inferRepoPath('')).toThrow('Cannot infer repository path from URL: ');
  });

  it('rejects inferred repository paths that are not safe path segments', () => {
    expect(() => inferRepoPath('https://github.com/wpmoo-org/bad:name.git')).toThrow(
      'Invalid repo path: use a single path segment without traversal.',
    );
  });

  it('infers GitHub owner from HTTPS and SSH URLs only', () => {
    expect(inferGitHubOwner('https://github.com/wpmoo-org/odoo_sample_module')).toBe('wpmoo-org');
    expect(inferGitHubOwner('git@github.com:wpmoo-org/odoo_sample_module')).toBe('wpmoo-org');
    expect(inferGitHubOwner('https://gitlab.com/wpmoo-org/odoo_sample_module')).toBeUndefined();
  });
});
