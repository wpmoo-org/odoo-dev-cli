import { describe, expect, it } from 'vitest';

import {
  renderCockpitDoctorResult,
  renderCockpitEnvironmentStatusResult,
} from '../src/cockpit/result-view.js';
import type { DoctorReport } from '../src/doctor.js';
import type { EnvironmentStatus } from '../src/status.js';

describe('cockpit result views', () => {
  it('renders environment status as plain result text for cockpit result pages', () => {
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

    expect(output).toContain('Environment status');
    expect(output).toContain('------------------');
    expect(output).toContain('Summary: Environment ready.');
    expect(output).toContain('Odoo: 19.0');
    expect(output).toContain('Module quality: 2 installable, 0 non-installable, 0 missing menus');
    expect(output).not.toContain('|');
    expect(output).not.toContain('+---');
  });

  it('renders doctor reports as plain result text with aligned details and status markers', () => {
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

    expect(output).not.toContain('Run doctor');
    expect(output).not.toContain('----------');
    expect(output).toContain('Result:    ✓ OK');
    expect(output).toContain('Target:    /tmp/environment');
    expect(output).toContain('Sections');
    expect(output).toContain('- Generated files:  1 ✓ OK, 0 warnings, 0 errors');
    expect(output).toContain('- Host tools:       1 ✓ OK, 1 warning, 0 errors');
    expect(output).toContain('Warnings');
    expect(output).toContain('- WARN GitHub CLI auth: not logged in');
    expect(output).toContain('- ✓ OK metadata .wpmoo/odoo.json');
    expect(output).toContain('- ✓ OK docker CLI');
    expect(output).not.toContain('|');
    expect(output).not.toContain('+---');
  });

  it('colors doctor OK markers green in interactive terminals', () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;
    const report: DoctorReport = {
      schemaVersion: 1,
      command: 'doctor',
      ok: true,
      target: '/tmp/environment',
      checks: ['OK metadata .wpmoo/odoo.json'],
      warnings: [],
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
      ],
    };

    try {
      const output = renderCockpitDoctorResult(report);

      expect(output).toContain('\u001B[32m✓ OK\u001B[39m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    }
  });

  it('colors doctor warning and error markers in interactive terminals', () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;
    const report: DoctorReport = {
      schemaVersion: 1,
      command: 'doctor',
      ok: false,
      target: '/tmp/environment',
      checks: ['OK metadata .wpmoo/odoo.json'],
      warnings: ['GitHub CLI auth: not logged in'],
      errors: ['Docker CLI check failed: docker unavailable'],
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
          checks: ['OK metadata .wpmoo/odoo.json'],
          warnings: ['GitHub CLI auth: not logged in'],
          errors: ['Docker CLI check failed: docker unavailable'],
        },
      ],
    };

    try {
      const output = renderCockpitDoctorResult(report);

      expect(output).toContain('Warnings:  \u001B[38;2;245;166;35m1\u001B[39m');
      expect(output).toContain('Errors:    \u001B[31m1\u001B[39m');
      expect(output).toContain('\u001B[38;2;245;166;35m1 warning\u001B[39m');
      expect(output).toContain('\u001B[31m1 error\u001B[39m');
      expect(output).toContain('\u001B[2m0 warnings\u001B[22m');
      expect(output).toContain('\u001B[2m0 errors\u001B[22m');
      expect(output).toContain('- \u001B[38;2;245;166;35mWARN\u001B[39m GitHub CLI auth: not logged in');
      expect(output).toContain('- \u001B[31mERROR\u001B[39m Docker CLI check failed: docker unavailable');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    }
  });
});
