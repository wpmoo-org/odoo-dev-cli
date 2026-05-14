import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getEnvironmentStatus,
  renderEnvironmentStatus,
  renderEnvironmentStatusForTarget,
  renderEnvironmentStatusSummary,
} from '../src/status.js';

const validMetadata = {
  tool: '@wpmoo/odoo',
  version: '0.8.45',
  product: 'sample',
  odooVersion: '19.0',
  devRepo: 'sample_dev',
  devRepoUrl: 'https://github.com/example/sample_dev.git',
  sourceRepos: [],
};

async function makeTarget(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeMetadata(target: string, metadataContent: string): Promise<void> {
  await mkdir(join(target, '.wpmoo'), { recursive: true });
  await writeFile(join(target, '.wpmoo/odoo.json'), metadataContent);
}

async function writeCoreFiles(target: string, version = '19.0'): Promise<void> {
  await writeFile(join(target, 'moo'), '#!/usr/bin/env bash\n');
  await writeFile(join(target, 'README.md'), '# Test\n');
  await writeFile(join(target, 'AGENTS.md'), '# Test\n');
  await writeFile(join(target, `docker-compose_${version}.yml`), 'services:\n  odoo:\n    image: odoo\n');
  await mkdir(join(target, 'scripts'), { recursive: true });
}

describe('status', () => {
  it('reports no environment when metadata file is missing', async () => {
    const target = await makeTarget('wpmoo-status-none-');
    const status = await getEnvironmentStatus(target);

    expect(status.kind).toBe('no_environment');
    expect(status.recommendedNextAction).toBe('Run npx @wpmoo/odoo create ...');
    expect(renderEnvironmentStatusSummary(status)).toBe('No WPMoo environment detected.');
    expect(renderEnvironmentStatus(status)).toContain('Metadata: missing .wpmoo/odoo.json');
  });

  it('reports invalid metadata without throwing', async () => {
    const target = await makeTarget('wpmoo-status-invalid-');
    await writeMetadata(target, '{bad json');

    await expect(getEnvironmentStatus(target)).resolves.toMatchObject({
      kind: 'invalid_metadata',
      recommendedNextAction:
        'Fix .wpmoo/odoo.json or run npx @wpmoo/odoo reset from a valid environment.',
    });
  });

  it('reports valid metadata with no source repos and add-repo recommendation', async () => {
    const target = await makeTarget('wpmoo-status-empty-repos-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCoreFiles(target, '19.0');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoCount).toBe(0);
    expect(status.sourceRepoPaths).toEqual([]);
    expect(status.invalidSourceRepoPaths).toEqual([]);
    expect(status.moduleCandidateCount).toBe(0);
    expect(status.missingCoreFiles).toEqual([]);
    expect(status.recommendedNextAction).toBe('Run npx @wpmoo/odoo add-repo ...');
  });

  it('counts module candidates from configured source repo paths', async () => {
    const target = await makeTarget('wpmoo-status-modules-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/a.git', path: 'repo_a', addons: [] },
        { url: 'https://github.com/example/b.git', path: 'repo_b', addons: [] },
      ],
    };

    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await mkdir(join(target, 'odoo/custom/src/private/repo_a/mod_one'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_a/mod_one/__manifest__.py'), '{}');
    await mkdir(join(target, 'odoo/custom/src/private/repo_b/mod_two'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_b/mod_two/__manifest__.py'), '{}');
    await mkdir(join(target, 'odoo/custom/src/private/repo_b/mod_three'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_b/mod_three/__manifest__.py'), '{}');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoCount).toBe(2);
    expect(status.sourceRepoPaths).toEqual(['repo_a', 'repo_b']);
    expect(status.invalidSourceRepoPaths).toEqual([]);
    expect(status.moduleCandidateCount).toBe(3);
    expect(status.recommendedNextAction).toBe(
      'Run npx @wpmoo/odoo doctor for deep checks or ./moo start.',
    );
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment ready');
  });

  it('reports invalid source repo paths without scanning outside private sources', async () => {
    const target = await makeTarget('wpmoo-status-invalid-source-path-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [
        { url: 'https://github.com/example/a.git', path: 'repo_a', addons: [] },
        { url: 'https://github.com/example/escape.git', path: '../escape', addons: [] },
      ],
    };
    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await writeCoreFiles(target, '19.0');
    await mkdir(join(target, 'odoo/custom/src/private/repo_a/mod_one'), { recursive: true });
    await writeFile(join(target, 'odoo/custom/src/private/repo_a/mod_one/__manifest__.py'), '{}');

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.sourceRepoPaths).toEqual(['repo_a']);
    expect(status.invalidSourceRepoPaths).toEqual(['../escape']);
    expect(status.moduleCandidateCount).toBe(1);
    expect(status.recommendedNextAction).toBe(
      'Fix invalid source repo paths in .wpmoo/odoo.json, then run npx @wpmoo/odoo doctor.',
    );
    expect(renderEnvironmentStatus(status)).toContain('Invalid source repo paths: ../escape');
    expect(renderEnvironmentStatusSummary(status)).toContain('Environment needs attention');
  });

  it('reports missing core files and reset recommendation', async () => {
    const target = await makeTarget('wpmoo-status-missing-core-');
    const metadata = {
      ...validMetadata,
      sourceRepos: [{ url: 'https://github.com/example/a.git', path: 'repo_a', addons: [] }],
    };
    await writeMetadata(target, JSON.stringify(metadata, null, 2));
    await mkdir(join(target, 'odoo/custom/src/private/repo_a'), { recursive: true });

    const status = await getEnvironmentStatus(target);
    expect(status.kind).toBe('environment');
    if (status.kind !== 'environment') return;

    expect(status.missingCoreFiles).toEqual(
      expect.arrayContaining(['moo', 'README.md', 'AGENTS.md', 'docker-compose_19.0.yml', 'scripts/']),
    );
    expect(status.recommendedNextAction).toBe(
      'Run npx @wpmoo/odoo reset, then npx @wpmoo/odoo doctor.',
    );
    expect(renderEnvironmentStatus(status)).toContain('Missing core files:');
  });

  it('renders status for target as an integrated offline output', async () => {
    const target = await makeTarget('wpmoo-status-render-');
    await writeMetadata(target, JSON.stringify(validMetadata, null, 2));
    await writeCoreFiles(target, '19.0');

    const output = await renderEnvironmentStatusForTarget(target);
    expect(output).toContain('Status: Environment ready: Odoo 19.0, source repos 0, module candidates 0.');
    expect(output).toContain('Next: Run npx @wpmoo/odoo add-repo ...');
  });
});
