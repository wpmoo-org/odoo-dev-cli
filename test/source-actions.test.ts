import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { markerPath, renderEnvironmentMetadata } from '../src/environment.js';
import {
  listSources,
  renderSourceList,
  renderSourceSyncPlan,
  sourceListJson,
  sourceSyncPlan,
  sourceSyncPlanJson,
  sourceSyncJson,
  syncSources,
} from '../src/source-actions.js';
import { sourceManifestPath } from '../src/source-manifest.js';
import type { ScaffoldOptions } from '../src/types.js';

function options(target: string): ScaffoldOptions {
  return {
    product: 'product',
    odooVersion: '19.0',
    devRepo: 'product_dev',
    devRepoUrl: 'https://github.com/example/product_dev.git',
    sourceRepos: [
      {
        sourceType: 'oca',
        path: 'server-tools',
        url: '',
        addons: ['queue_job'],
      },
    ],
    engine: 'compose',
    target,
    dryRun: false,
    initEmptyRepos: false,
    stage: false,
  };
}

describe('source actions', () => {
  it('syncs source manifest from metadata and gitmodules, then writes metadata with source types', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-source-actions-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(join(target, markerPath), renderEnvironmentMetadata(options(target)), 'utf8');
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/oca/server-tools"]',
        '\tpath = odoo/custom/src/oca/server-tools',
        '\turl = https://github.com/OCA/server-tools.git',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(syncSources({ target, stage: false })).resolves.toEqual([
      {
        type: 'oca',
        path: 'server-tools',
        url: 'https://github.com/OCA/server-tools.git',
        branch: '19.0',
        addons: ['queue_job'],
      },
    ]);

    await expect(readFile(join(target, sourceManifestPath), 'utf8')).resolves.toContain(
      '    url: "https://github.com/OCA/server-tools.git"',
    );
    await expect(readFile(join(target, markerPath), 'utf8')).resolves.toContain('"sourceType": "oca"');
  });

  it('previews source sync drift without writing manifest or metadata files', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-source-actions-preview-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(join(target, markerPath), renderEnvironmentMetadata(options(target)), 'utf8');
    await writeFile(
      join(target, sourceManifestPath),
      [
        'sources:',
        '  - type: "oca"',
        '    path: "server-tools"',
        '    url: "https://github.com/example/server-tools.git"',
        '    branch: "18.0"',
        '    addons:',
        '      - "queue_job"',
        '  - type: "external"',
        '    path: "stale-tools"',
        '    url: "https://github.com/example/stale-tools.git"',
        '    branch: "18.0"',
        '    addons: []',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/oca/server-tools"]',
        '\tpath = odoo/custom/src/oca/server-tools',
        '\turl = https://github.com/OCA/server-tools.git',
        '',
      ].join('\n'),
      'utf8',
    );

    const plan = await sourceSyncPlan(target);

    expect(plan.sources).toEqual([
      {
        type: 'oca',
        path: 'server-tools',
        url: 'https://github.com/OCA/server-tools.git',
        branch: '19.0',
        addons: ['queue_job'],
      },
    ]);
    expect(plan.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: sourceManifestPath,
          kind: 'update',
          source: 'oca/server-tools',
          field: 'url',
          before: 'https://github.com/example/server-tools.git',
          after: 'https://github.com/OCA/server-tools.git',
        }),
        expect.objectContaining({
          file: sourceManifestPath,
          kind: 'update',
          source: 'oca/server-tools',
          field: 'branch',
          before: '18.0',
          after: '19.0',
        }),
        expect.objectContaining({
          file: sourceManifestPath,
          kind: 'remove',
          source: 'external/stale-tools',
        }),
      ]),
    );
    expect(renderSourceSyncPlan(plan)).toContain(
      'source manifest update oca/server-tools url: "https://github.com/example/server-tools.git" -> "https://github.com/OCA/server-tools.git"',
    );
    expect(sourceSyncPlanJson(plan)).toMatchObject({
      schemaVersion: 1,
      command: 'source sync preview',
      ok: true,
      target,
      dryRun: true,
    });
    await expect(readFile(join(target, sourceManifestPath), 'utf8')).resolves.toContain('stale-tools');
  });

  it('lists manifest sources before falling back to metadata', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-source-actions-list-'));
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(
      join(target, sourceManifestPath),
      [
        'sources:',
        '  - type: "external"',
        '    path: "vendor_tools"',
        '    url: "https://github.com/vendor/tools.git"',
        '    branch: "18.0"',
        '    addons:',
        '      - "vendor_tools"',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(listSources(target)).resolves.toEqual([
      {
        type: 'external',
        path: 'vendor_tools',
        url: 'https://github.com/vendor/tools.git',
        branch: '18.0',
        addons: ['vendor_tools'],
      },
    ]);
  });

  it('renders source list output for operators', () => {
    expect(
      renderSourceList([
        {
          type: 'private',
          path: 'product',
          url: 'https://github.com/example/product.git',
          branch: '19.0',
          addons: ['product', 'product_sale'],
        },
      ]),
    ).toBe('private/product @ 19.0 -> https://github.com/example/product.git addons: product, product_sale');
  });

  it('serializes empty source list output as machine-readable payload', () => {
    expect(sourceListJson([])).toEqual({
      schemaVersion: 1,
      command: 'source list',
      ok: true,
      sources: [],
    });
  });

  it('serializes source list output with source type and addons intact', () => {
    expect(
      sourceListJson([
        {
          type: 'oca',
          path: 'server-tools',
          url: 'https://github.com/OCA/server-tools.git',
          branch: '19.0',
          addons: ['queue_job', 'base_action_rule'],
        },
      ]),
    ).toEqual({
      schemaVersion: 1,
      command: 'source list',
      ok: true,
      sources: [
        {
          type: 'oca',
          path: 'server-tools',
          url: 'https://github.com/OCA/server-tools.git',
          branch: '19.0',
          addons: ['queue_job', 'base_action_rule'],
        },
      ],
    });
  });

  it('serializes empty source sync output as machine-readable payload', () => {
    expect(sourceSyncJson([], '/tmp/source-sync-target')).toEqual({
      schemaVersion: 1,
      command: 'source sync',
      ok: true,
      target: '/tmp/source-sync-target',
      sources: [],
    });
  });

  it('serializes source sync output with source type and addons intact', () => {
    expect(
      sourceSyncJson(
        [
          {
            type: 'private',
            path: 'odoo_module_repo',
            url: 'https://github.com/example/odoo-module-repo.git',
            branch: '18.0',
            addons: ['custom_module', 'stock'],
          },
        ],
        '/tmp/source-sync-target',
      ),
    ).toEqual({
      schemaVersion: 1,
      command: 'source sync',
      ok: true,
      target: '/tmp/source-sync-target',
      sources: [
        {
          type: 'private',
          path: 'odoo_module_repo',
          url: 'https://github.com/example/odoo-module-repo.git',
          branch: '18.0',
          addons: ['custom_module', 'stock'],
        },
      ],
    });
  });
});
