import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  renderTrainGateSummary,
  resolveTrainGateModules,
  runTrainGate,
  trainGateOptionsFromArgs,
} from '../src/train-gate.js';
import type { DoctorReport } from '../src/doctor.js';
import type { EnvironmentStatus } from '../src/status.js';

async function makeTarget(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeModule(target: string, moduleName: string, depends: string[] = ['base']): Promise<void> {
  const modulePath = join(target, 'odoo/custom/src/private/demo_repo', moduleName);
  await mkdir(modulePath, { recursive: true });
  await writeFile(
    join(modulePath, '__manifest__.py'),
    [
      '{',
      `  'name': '${moduleName}',`,
      "  'installable': True,",
      `  'depends': [${depends.map((dependency) => `'${dependency}'`).join(', ')}],`,
      '}',
      '',
    ].join('\n'),
  );
}

function passingDoctorReport(warnings: string[] = []): DoctorReport {
  return {
    schemaVersion: 1,
    command: 'doctor',
    ok: true,
    target: '/tmp/example',
    checks: [],
    warnings,
    errors: [],
    appliedFixes: [],
  };
}

function passingEnvironmentStatus(): EnvironmentStatus {
  return {
    kind: 'environment',
    target: '/tmp/example',
    metadataPath: '.wpmoo/odoo.json',
    recommendedNextAction: 'Run ./moo doctor.',
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
    composeFiles: [],
    composeErrors: [],
    missingCoreFiles: [],
  };
}

describe('train gate', () => {
  it('parses explicit module, database, and strict options', () => {
    expect(
      trainGateOptionsFromArgs([
        '--modules',
        'module_a,module_b',
        '--db',
        'odoo_19',
        '--strict',
        '--json',
        '--skip-update',
      ]),
    ).toEqual({
      modules: ['module_a', 'module_b'],
      db: 'odoo_19',
      strict: true,
      failOnWarning: true,
      json: true,
      skipUpdate: true,
      changed: false,
      includeDependent: false,
    });
  });

  it('runs update, tests, lint, doctor, and status in order', async () => {
    const calls: string[] = [];
    const result = await runTrainGate(
      '/tmp/example',
      {
        modules: ['module_a', 'module_b'],
        db: 'odoo_19',
        strict: false,
        failOnWarning: false,
        json: false,
        skipUpdate: false,
        changed: false,
        includeDependent: false,
      },
      {
        runAction: vi.fn(async (command, args) => {
          calls.push(`${command} ${args.join(' ')}`.trim());
        }),
        getDoctor: vi.fn(async () => passingDoctorReport()),
        getStatus: vi.fn(async () => passingEnvironmentStatus()),
      },
    );

    expect(calls).toEqual(['update module_a,module_b odoo_19', 'test module_a,module_b --db odoo_19', 'lint']);
    expect(result.outcome).toBe('PASS');
    expect(renderTrainGateSummary(result)).toContain('Result: PASS');
  });

  it('returns pass with warnings when doctor reports non-strict warnings', async () => {
    const result = await runTrainGate(
      '/tmp/example',
      {
        modules: ['module_a'],
        strict: false,
        failOnWarning: false,
        json: false,
        skipUpdate: true,
        changed: false,
        includeDependent: false,
      },
      {
        runAction: vi.fn(async () => undefined),
        getDoctor: vi.fn(async () => passingDoctorReport(['Module quality advisory: module_a warning'])),
        getStatus: vi.fn(async () => passingEnvironmentStatus()),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('PASS_WITH_WARNINGS');
    expect(result.warnings).toEqual(['Module quality advisory: module_a warning']);
  });

  it('resolves changed modules and dependent modules', async () => {
    const target = await makeTarget('wpmoo-train-gate-dependents-');
    await writeModule(target, 'module_a');
    await writeModule(target, 'module_b', ['base', 'module_a']);

    const modules = await resolveTrainGateModules(
      target,
      { modules: [], changed: true, includeDependent: true },
      async () => ['odoo/custom/src/private/demo_repo/module_a/models/demo.py'],
    );

    expect(modules).toEqual(['module_a', 'module_b']);
  });
});
