import { describe, expect, it } from 'vitest';

import type { ListedModule } from '../src/module-actions.js';
import {
  resolveModuleTarget,
  type ModuleTargetResolution,
} from '../src/module-target-resolver.js';

const moduleInventory: ListedModule[] = [
  {
    moduleName: 'partner_portal',
    repoPath: 'private/partner_portal',
    sourceType: 'private',
    repoUrl: 'https://github.com/example-org/private-partner-portal.git',
    repoSlug: 'example-org/private-partner-portal',
  },
  {
    moduleName: 'partner_invoicing',
    repoPath: 'oca/partner_invoicing',
    sourceType: 'oca',
    repoUrl: 'https://github.com/OCA/partner-invoicing.git',
    repoSlug: 'OCA/partner-invoicing',
  },
  {
    moduleName: 'sales_management',
    repoPath: 'private/sales_management',
    sourceType: 'private',
    repoUrl: 'https://github.com/example-org/sales-management.git',
    repoSlug: 'example-org/sales-management',
  },
  {
    moduleName: 'sales_order',
    repoPath: 'external/sales_order',
    sourceType: 'external',
    repoSlug: 'external-org/sales-order',
  },
  {
    moduleName: 'sales',
    repoPath: 'private/sales_core',
    sourceType: 'private',
  },
  {
    moduleName: 'sale',
    repoPath: 'private/sale_core',
    sourceType: 'private',
  },
  {
    moduleName: 'sale',
    repoPath: 'oca/sale_core',
    sourceType: 'oca',
  },
];

describe('module target resolver', () => {
  const lookup = (query: string): ModuleTargetResolution => resolveModuleTarget(query, moduleInventory);

  it('prefers exact moduleName matches over partial matches', () => {
    const resolution = lookup('sales');
    expect(resolution).toEqual({
      kind: 'exact',
      query: 'sales',
      module: {
        moduleName: 'sales',
        repoPath: 'private/sales_core',
        sourceType: 'private',
      },
    });
  });

  it('returns all exact candidates when exact match is ambiguous', () => {
    const resolution = lookup('sale');
    expect(resolution).toEqual({
      kind: 'ambiguous',
      query: 'sale',
      candidates: [
        {
          moduleName: 'sale',
          repoPath: 'private/sale_core',
          sourceType: 'private',
        },
        {
          moduleName: 'sale',
          repoPath: 'oca/sale_core',
          sourceType: 'oca',
        },
      ],
    });
  });

  it('supports unique case-insensitive partial matching when safe', () => {
    const resolution = lookup('Portal');
    expect(resolution).toEqual({
      kind: 'exact',
      query: 'Portal',
      module: {
        moduleName: 'partner_portal',
        repoPath: 'private/partner_portal',
        sourceType: 'private',
        repoUrl: 'https://github.com/example-org/private-partner-portal.git',
        repoSlug: 'example-org/private-partner-portal',
      },
    });
  });

  it('returns ambiguous candidates when partial match is not unique', () => {
    const resolution = lookup('sales_');
    expect(resolution).toEqual({
      kind: 'ambiguous',
      query: 'sales_',
      candidates: [
        {
          moduleName: 'sales_management',
          repoPath: 'private/sales_management',
          sourceType: 'private',
          repoUrl: 'https://github.com/example-org/sales-management.git',
          repoSlug: 'example-org/sales-management',
        },
        {
          moduleName: 'sales_order',
          repoPath: 'external/sales_order',
          sourceType: 'external',
          repoSlug: 'external-org/sales-order',
        },
      ],
    });
  });

  it('returns nearest candidates for misspelling with actionable source metadata', () => {
    const resolution = lookup('partnre');
    expect(resolution).toEqual({
      kind: 'no-match',
      query: 'partnre',
      candidates: [
        {
          moduleName: 'partner_portal',
          repoPath: 'private/partner_portal',
          sourceType: 'private',
          repoUrl: 'https://github.com/example-org/private-partner-portal.git',
          repoSlug: 'example-org/private-partner-portal',
        },
        {
          moduleName: 'partner_invoicing',
          repoPath: 'oca/partner_invoicing',
          sourceType: 'oca',
          repoUrl: 'https://github.com/OCA/partner-invoicing.git',
          repoSlug: 'OCA/partner-invoicing',
        },
      ],
    });
  });

  it('returns a no-match result without candidates when no close matches are available', () => {
    const resolution = lookup('xyzzy_plausible');
    expect(resolution).toEqual({
      kind: 'no-match',
      query: 'xyzzy_plausible',
      candidates: [],
    });
  });
});
