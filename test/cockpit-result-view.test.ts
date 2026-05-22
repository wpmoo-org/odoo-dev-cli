import { describe, expect, it } from 'vitest';

import {
  renderCockpitDoctorResult,
  renderCockpitEnvironmentStatusResult,
} from '../src/cockpit/result-view.js';
import type { DoctorReport } from '../src/doctor.js';
import type { EnvironmentStatus } from '../src/status.js';

describe('cockpit result views', () => {
  it('renders environment status as compact tables for cockpit result pages', () => {
    const status: EnvironmentStatus = {
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Run ./moo doctor.',
      odooVersion: '19.0',
      sourceRepoCount: 1,
      sourceRepoPaths: ['odoo/custom/src/private/moo_test'],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 2,
      moduleQuality: {
        totalModules: 2,
        installableModules: 2,
        nonInstallableModules: 0,
        modulesWithMenuActions: 2,
        modulesMissingMenuActions: 0,
        issues: [],
      },
      composeFiles: ['compose.yaml'],
      composeErrors: [],
      missingCoreFiles: [],
    };

    const output = renderCockpitEnvironmentStatusResult(status);

    expect(output).toContain('Environment summary');
    expect(output).toContain('| Field');
    expect(output).toContain('| Summary');
    expect(output).toContain('| Odoo');
    expect(output).toContain('| Module quality');
  });

  it('renders doctor reports as section count tables with details', () => {
    const report: DoctorReport = {
      schemaVersion: 1,
      command: 'doctor',
      ok: true,
      target: '/tmp/environment',
      checks: ['OK metadata .wpmoo/odoo.json', 'OK docker CLI'],
      warnings: ['GitHub CLI auth: not logged in'],
      errors: [],
      appliedFixes: [],
      sections: [
        {
          id: 'generated-files',
          title: 'Generated files',
          checks: ['OK metadata .wpmoo/odoo.json'],
          warnings: [],
          errors: [],
        },
        {
          id: 'host-tools',
          title: 'Host tools',
          checks: ['OK docker CLI'],
          warnings: ['GitHub CLI auth: not logged in'],
          errors: [],
        },
      ],
    };

    const output = renderCockpitDoctorResult(report);

    expect(output).toContain('Doctor summary');
    expect(output).toContain('| Section');
    expect(output).toContain('| Generated files');
    expect(output).toContain('| Host tools');
    expect(output).toContain('Warnings');
    expect(output).toContain('- GitHub CLI auth: not logged in');
  });
});
