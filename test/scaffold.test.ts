import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scaffold } from '../src/scaffold.js';

describe('scaffold', () => {
  it('dry-run reports planned files without writing them', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-dry-run-'));

    const result = await scaffold({
      product: 'moo_olympiad',
      org: 'wpmoo-org',
      odooVersion: '19.0',
      devRepo: 'moo_olympiad_dev',
      communityRepo: 'moo_olympiad',
      proRepo: 'moo_olympiad_pro',
      communityRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad.git',
      proRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad_pro.git',
      communityAddons: ['moo_olympiad', 'moo_olympiad_portal'],
      proAddons: ['moo_olympiad_payment'],
      target,
      dryRun: true,
      initEmptyRepos: false,
      stage: false,
    });

    expect(result.plannedFiles).toContain('.gitignore');
    await expect(stat(join(target, '.gitignore'))).rejects.toThrow();
  });

  it('writes WPMoo overlay files when dry-run is disabled', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-scaffold-'));

    await scaffold({
      product: 'moo_olympiad',
      org: 'wpmoo-org',
      odooVersion: '19.0',
      devRepo: 'moo_olympiad_dev',
      communityRepo: 'moo_olympiad',
      proRepo: 'moo_olympiad_pro',
      communityRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad.git',
      proRepoUrl: 'https://github.com/wpmoo-org/moo_olympiad_pro.git',
      communityAddons: ['moo_olympiad', 'moo_olympiad_portal'],
      proAddons: ['moo_olympiad_payment'],
      target,
      dryRun: false,
      initEmptyRepos: false,
      stage: false,
      skipSubmodules: true,
    });

    await expect(readFile(join(target, 'README.md'), 'utf8')).resolves.toContain(
      'Moo Olympiad Development Environment',
    );
    await expect(readFile(join(target, 'odoo/custom/src/addons.yaml'), 'utf8')).resolves.toContain(
      'private/moo_olympiad_pro:',
    );
  });
});

