import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { markerPath, type EnvironmentMetadata } from '../src/environment.js';
import {
  backupTargetPath,
  expectedTargetConfirmation,
  inspectEnvironmentTarget,
  renderExistingEnvironmentSummary,
  renderForeignEnvironmentTargetWarning,
} from '../src/environment-target-preflight.js';

function uniqueTmpPrefix(): string {
  return join(tmpdir(), `wpmoo-target-preflight-${crypto.randomUUID()}`);
}

async function writeEnvironmentMarker(target: string, metadata: EnvironmentMetadata): Promise<void> {
  await mkdir(join(target, '.wpmoo'), { recursive: true });
  await writeFile(join(target, markerPath), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

describe('environment target preflight', () => {
  it('reports missing target paths', async () => {
    const root = await mkdtemp(uniqueTmpPrefix());
    const target = join(root, 'missing-target');

    await rm(target, { force: true, recursive: true });

    await expect(inspectEnvironmentTarget(target)).resolves.toEqual({
      kind: 'missing_target',
      target,
    });
  });

  it('classifies a marker-backed directory as existing WPMoo environment', async () => {
    const target = await mkdtemp(uniqueTmpPrefix());
    const metadata: EnvironmentMetadata = {
      tool: '@wpmoo/toolkit',
      version: '0.9.0',
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      sourceRepos: [
        {
          path: 'odoo_sample_module',
          url: 'https://github.com/example-org/odoo_sample_module.git',
          addons: ['odoo_sample_module'],
          sourceType: 'private',
        },
      ],
    };

    await writeEnvironmentMarker(target, metadata);

    const state = await inspectEnvironmentTarget(target);
    expect(state).toMatchObject({
      kind: 'existing_environment',
      target,
      metadata: expect.objectContaining({
        product: metadata.product,
        odooVersion: metadata.odooVersion,
        sourceRepos: metadata.sourceRepos,
      }),
    });
    if (state.kind !== 'existing_environment') {
      throw new Error(`Expected existing environment state, got ${state.kind}`);
    }
    expect(renderExistingEnvironmentSummary(state)).toBe(`Existing WPMoo environment detected at ${target}
- Product: odoo_sample_module
- Odoo version: 19.0
- Source repos: 1`);
  });

  it('classifies missing-marker directories as foreign targets', async () => {
    const target = await mkdtemp(uniqueTmpPrefix());

    await mkdir(join(target, 'odoo/custom/src/private'), { recursive: true });

    const state = await inspectEnvironmentTarget(target);
    expect(state).toMatchObject({
      kind: 'foreign_target',
      target,
    });
    if (state.kind !== 'foreign_target') {
      throw new Error(`Expected foreign target state, got ${state.kind}`);
    }
    expect(renderForeignEnvironmentTargetWarning(state)).toBe(
      `Target already exists: ${target}\nIt does not contain a WPMoo environment marker at ${markerPath}.`,
    );
  });

  it('requires exact basename confirmation input', async () => {
    const target = await mkdtemp(uniqueTmpPrefix());
    const expected = basename(target);

    expect(expectedTargetConfirmation(target, expected)).toBe(true);
    expect(expectedTargetConfirmation(target, `${expected}-extra`)).toBe(false);
    expect(expectedTargetConfirmation(target, expected.toUpperCase())).toBe(false);
    expect(expectedTargetConfirmation(target, ` ${expected}`)).toBe(false);
  });

  it('builds deterministic backup path from fixed date', () => {
    const target = join(tmpdir(), 'wpmoo-existing');
    const date = new Date('2026-05-16T14:22:33.000Z');

    expect(backupTargetPath(target, date)).toBe(`${target}.backup-20260516-142233`);
  });
});
