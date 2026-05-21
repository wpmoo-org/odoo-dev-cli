import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  listGitmoduleSources,
  readSourceManifest,
  renderSourceManifest,
  sourceManifestPath,
  sourceReposFromManifest,
  syncManifestFromMetadataAndGitmodules,
  writeSourceManifest,
} from '../src/source-manifest.js';

describe('source manifest', () => {
  it('renders and reads deterministic source manifest entries', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-source-manifest-'));

    await writeSourceManifest(target, [
      {
        type: 'oca',
        path: 'server-tools',
        url: 'https://github.com/OCA/server-tools.git',
        branch: '19.0',
        addons: ['queue_job', 'base_exception'],
      },
      {
        type: 'private',
        path: 'product',
        url: 'https://github.com/example/product.git',
        branch: '19.0',
        addons: ['product'],
      },
    ]);

    await expect(readFile(join(target, sourceManifestPath), 'utf8')).resolves.toBe(
      [
        'sources:',
        '  - type: "oca"',
        '    path: "server-tools"',
        '    url: "https://github.com/OCA/server-tools.git"',
        '    branch: "19.0"',
        '    addons:',
        '      - "base_exception"',
        '      - "queue_job"',
        '  - type: "private"',
        '    path: "product"',
        '    url: "https://github.com/example/product.git"',
        '    branch: "19.0"',
        '    addons:',
        '      - "product"',
        '',
      ].join('\n'),
    );

    await expect(readSourceManifest(target)).resolves.toEqual({
      sources: [
        {
          type: 'oca',
          path: 'server-tools',
          url: 'https://github.com/OCA/server-tools.git',
          branch: '19.0',
          addons: ['base_exception', 'queue_job'],
        },
        {
          type: 'private',
          path: 'product',
          url: 'https://github.com/example/product.git',
          branch: '19.0',
          addons: ['product'],
        },
      ],
    });
  });

  it('converts manifest entries back to source repo metadata with sourceType', () => {
    expect(
      sourceReposFromManifest([
        {
          type: 'external',
          path: 'vendor_tools',
          url: 'https://github.com/vendor/tools.git',
          branch: '18.0',
          addons: ['vendor_tools'],
        },
      ]),
    ).toEqual([
      {
        sourceType: 'external',
        path: 'vendor_tools',
        url: 'https://github.com/vendor/tools.git',
        addons: ['vendor_tools'],
      },
    ]);
  });

  it('uses gitmodule URLs when metadata has an empty URL during sync', () => {
    expect(
      syncManifestFromMetadataAndGitmodules(
        [
          {
            sourceType: 'oca',
            path: 'server-tools',
            url: '',
            addons: ['queue_job'],
          },
        ],
        '19.0',
        [
          {
            type: 'oca',
            path: 'server-tools',
            url: 'https://github.com/OCA/server-tools.git',
          },
        ],
      ),
    ).toEqual([
      {
        type: 'oca',
        path: 'server-tools',
        url: 'https://github.com/OCA/server-tools.git',
        branch: '19.0',
        addons: ['queue_job'],
      },
    ]);
  });

  it('lists source submodules from .gitmodules', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-gitmodule-sources-'));
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/private/product"]',
        '\tpath = odoo/custom/src/private/product',
        '\turl = https://github.com/example/product.git',
        '[submodule "odoo/custom/src/oca/server-tools"]',
        '\tpath = odoo/custom/src/oca/server-tools',
        '\turl = https://github.com/OCA/server-tools.git',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(listGitmoduleSources(target)).resolves.toEqual([
      {
        type: 'private',
        path: 'product',
        url: 'https://github.com/example/product.git',
      },
      {
        type: 'oca',
        path: 'server-tools',
        url: 'https://github.com/OCA/server-tools.git',
      },
    ]);
  });

  it('treats pre-category .gitmodules source paths as private sources', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-gitmodule-legacy-sources-'));
    await writeFile(
      join(target, '.gitmodules'),
      [
        '[submodule "odoo/custom/src/legacy_repo"]',
        '\tpath = odoo/custom/src/legacy_repo',
        '\turl = https://github.com/example/legacy_repo.git',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(listGitmoduleSources(target)).resolves.toEqual([
      {
        type: 'private',
        path: 'legacy_repo',
        url: 'https://github.com/example/legacy_repo.git',
      },
    ]);
  });

  it('renders an empty source manifest', () => {
    expect(renderSourceManifest([])).toBe('sources: []\n');
  });

  it('preserves explicit empty addon lists', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-source-manifest-empty-addons-'));

    await writeSourceManifest(target, [
      {
        type: 'private',
        path: 'product',
        url: 'https://github.com/example/product.git',
        branch: '19.0',
        addons: [],
      },
    ]);

    await expect(readFile(join(target, sourceManifestPath), 'utf8')).resolves.toBe(
      [
        'sources:',
        '  - type: "private"',
        '    path: "product"',
        '    url: "https://github.com/example/product.git"',
        '    branch: "19.0"',
        '    addons: []',
        '',
      ].join('\n'),
    );
    await expect(readSourceManifest(target)).resolves.toEqual({
      sources: [
        {
          type: 'private',
          path: 'product',
          url: 'https://github.com/example/product.git',
          branch: '19.0',
          addons: [],
        },
      ],
    });
    expect(
      sourceReposFromManifest([
        {
          type: 'private',
          path: 'product',
          url: 'https://github.com/example/product.git',
          branch: '19.0',
          addons: [],
        },
      ]),
    ).toEqual([
      {
        sourceType: 'private',
        path: 'product',
        url: 'https://github.com/example/product.git',
        addons: [],
      },
    ]);
  });
});
