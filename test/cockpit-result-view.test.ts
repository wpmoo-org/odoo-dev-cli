import { describe, expect, it } from 'vitest';

import {
  cockpitResultActionOptions,
  renderCockpitDoctorResult,
  renderCockpitEnvironmentStatusResult,
} from '../src/cockpit/result-view.js';
import type { DoctorReport } from '../src/doctor.js';
import type { EnvironmentStatus } from '../src/status.js';

describe('cockpit result views', () => {
  it('places rerun actions above back navigation when a result can be repeated', () => {
    expect(cockpitResultActionOptions('Run doctor again')).toEqual([
      { value: 'rerun', label: 'Run doctor again' },
      { value: 'back', label: 'Back to menu' },
    ]);
  });

  it('keeps back navigation as the only result action by default', () => {
    expect(cockpitResultActionOptions()).toEqual([{ value: 'back', label: 'Back to menu' }]);
  });

  it('renders environment status as aligned result text with status markers', () => {
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
        addons: [],
        issues: [],
      },
      composeFiles: ['compose.yaml'],
      composeErrors: [],
      missingCoreFiles: [],
    };

    const output = renderCockpitEnvironmentStatusResult(status);

    expect(output).not.toContain('Environment status');
    expect(output).not.toContain('------------------');
    expect(output).toContain('Summary:         ✓ Environment ready.');
    expect(output).toContain('Odoo:            19.0');
    expect(output).toContain('Module quality:  2 installable, 0 non-installable, 0 missing menus');
    expect(output).not.toContain('|');
    expect(output).not.toContain('+---');
  });

  it('dims environment status detail values in interactive terminals', () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;
    const status: EnvironmentStatus = {
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '.wpmoo/odoo.json',
      recommendedNextAction: 'Run npx @wpmoo/toolkit add-repo ...',
      odooVersion: '19.0',
      sourceRepoCount: 0,
      sourceRepoPaths: [],
      invalidSourceRepoPaths: [],
      moduleCandidateCount: 0,
      moduleQuality: {
        totalModules: 0,
        installableModules: 0,
        nonInstallableModules: 0,
        modulesWithMenuActions: 0,
        modulesMissingMenuActions: 0,
        addons: [],
        issues: [],
      },
      composeFiles: ['compose.yaml', 'compose/dev.yaml'],
      composeErrors: [],
      missingCoreFiles: [],
    };

    try {
      const output = renderCockpitEnvironmentStatusResult(status);

      expect(output).toContain('Summary:         \u001B[32m✓ Environment ready.\u001B[39m');
      expect(output).toContain('Metadata:        \u001B[2m.wpmoo/odoo.json\u001B[22m');
      expect(output).toContain('Odoo:            \u001B[2m19.0\u001B[22m');
      expect(output).toContain('Compose:         \u001B[2mcompose.yaml, compose/dev.yaml\u001B[22m');
      expect(output).toContain('Source repos:    \u001B[2m0\u001B[22m');
      expect(output).toContain('Next:            \u001B[2mRun npx @wpmoo/toolkit add-repo ...\u001B[22m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    }
  });

  it('colors environment status issues in interactive terminals', () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;
    const status: EnvironmentStatus = {
      kind: 'environment',
      target: '/tmp/environment',
      metadataPath: '/tmp/environment/.wpmoo/odoo.json',
      recommendedNextAction: 'Fix compose layout errors, then run npx @wpmoo/toolkit doctor.',
      odooVersion: '19.0',
      sourceRepoCount: 1,
      sourceRepoPaths: ['odoo/custom/src/private/moo_test'],
      invalidSourceRepoPaths: ['../bad'],
      moduleCandidateCount: 2,
      moduleQuality: {
        totalModules: 2,
        installableModules: 1,
        nonInstallableModules: 1,
        modulesWithMenuActions: 1,
        modulesMissingMenuActions: 1,
        addons: [],
        issues: [
          {
            moduleName: 'broken_module',
            path: 'broken_module/__manifest__.py',
            issue: 'invalid manifest syntax',
            severity: 'error',
          },
        ],
      },
      composeFiles: [],
      composeErrors: ['Invalid WPMOO_ENV in .env'],
      missingCoreFiles: ['moo'],
    };

    try {
      const output = renderCockpitEnvironmentStatusResult(status);

      expect(output).toContain('Summary:         \u001B[38;2;245;166;35mEnvironment needs attention.\u001B[39m');
      expect(output).toContain('Compose:         \u001B[2m(missing)\u001B[22m');
      expect(output).toContain('Compose errors:  \u001B[31mInvalid WPMOO_ENV in .env\u001B[39m');
      expect(output).toContain('Invalid paths:   \u001B[38;2;245;166;35m../bad\u001B[39m');
      expect(output).toContain(
        'Module quality:  \u001B[2m1 installable\u001B[22m, \u001B[38;2;245;166;35m1 non-installable\u001B[39m, \u001B[38;2;245;166;35m1 missing menu\u001B[39m',
      );
      expect(output).toContain('Module issues:   \u001B[31mbroken_module/__manifest__.py: invalid manifest syntax\u001B[39m');
      expect(output).toContain('Core files:      \u001B[31mmissing moo\u001B[39m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    }
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
