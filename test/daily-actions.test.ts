import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  dailyActionPlan,
  dailyActionSafetyPreview,
  isDailyActionCommand,
  renderDailyActionOutput,
  runDailyAction,
  runDailyActionWithStyledOutput,
} from '../src/daily-actions.js';
import { markerPath } from '../src/environment.js';

async function makeEnvironment(options: { scripts?: string[]; env?: string } = {}): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), 'wpmoo-daily-actions-'));
  await mkdir(join(target, '.wpmoo'), { recursive: true });
  await writeFile(
    join(target, markerPath),
    JSON.stringify({
      tool: '@wpmoo/toolkit',
      version: '0.8.33',
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
      sourceRepos: [],
      engine: 'compose',
    }),
  );

  await mkdir(join(target, 'scripts'), { recursive: true });
  for (const script of options.scripts ?? []) {
    await writeFile(join(target, 'scripts', script), '#!/usr/bin/env bash\n');
  }
  if (options.env !== undefined) {
    await writeFile(join(target, '.env'), options.env);
  }

  return target;
}

describe('daily actions', () => {
  it('identifies known daily action commands', () => {
    expect(isDailyActionCommand('test')).toBe(true);
    expect(isDailyActionCommand('doctor')).toBe(false);
  });

  it('maps logs and psql commands to their default script arguments', async () => {
    const target = await makeEnvironment({ scripts: ['logs.sh', 'psql.sh'] });

    await expect(dailyActionPlan('logs', [], target)).resolves.toMatchObject({
      cwd: target,
      scriptPath: join(target, 'scripts/logs.sh'),
      args: ['odoo'],
    });
    await expect(dailyActionPlan('psql', [], target)).resolves.toMatchObject({
      cwd: target,
      scriptPath: join(target, 'scripts/psql.sh'),
      args: ['postgres'],
    });
  });

  it('supports optional logs tail counts while preserving the default service', async () => {
    const target = await makeEnvironment({ scripts: ['logs.sh'] });

    await expect(dailyActionPlan('logs', ['odoo', '200'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/logs.sh'),
      args: ['odoo', '200'],
    });
    await expect(dailyActionPlan('logs', ['db', '50'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/logs.sh'),
      args: ['db', '50'],
    });
  });

  it('maps core and module commands to fixed compose scripts', async () => {
    const target = await makeEnvironment({
      scripts: ['up.sh', 'down.sh', 'restart.sh', 'shell.sh', 'install.sh', 'update.sh', 'test.sh'],
    });

    await expect(dailyActionPlan('start', [], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/up.sh'),
      args: [],
    });
    await expect(dailyActionPlan('stop', [], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/down.sh'),
      args: [],
    });

    await expect(dailyActionPlan('restart', [], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/restart.sh'),
      args: [],
    });
    await expect(dailyActionPlan('shell', [], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/shell.sh'),
      args: [],
    });
    await expect(dailyActionPlan('install', ['sale', 'devel'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/install.sh'),
      args: ['sale', 'devel'],
    });
    await expect(dailyActionPlan('update', ['sale', 'devel'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/update.sh'),
      args: ['sale', 'devel'],
    });
    await expect(
      dailyActionPlan('test', ['sale', '--db', 'devel', '--mode', 'update', '--tags', '/sale'], target),
    ).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/test.sh'),
      args: ['sale', '--db', 'devel', '--mode', 'update', '--tags', '/sale'],
    });
    await expect(dailyActionPlan('test', ['sale', '--mode', 'auto'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/test.sh'),
      args: ['sale', '--mode', 'auto'],
    });
  });

  it('maps compose maintenance commands to fixed scripts with positional arguments', async () => {
    const target = await makeEnvironment({
      scripts: ['resetdb.sh', 'snapshot.sh', 'restore-snapshot.sh', 'lint.sh', 'pot.sh'],
    });

    await expect(dailyActionPlan('resetdb', ['devel', 'sale,stock'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/resetdb.sh'),
      args: ['devel', 'sale,stock'],
    });
    await expect(dailyActionPlan('snapshot', ['devel', 'before-update'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/snapshot.sh'),
      args: ['devel', 'before-update'],
    });
    await expect(dailyActionPlan('restore-snapshot', ['before-update', 'devel'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/restore-snapshot.sh'),
      args: ['before-update', 'devel'],
    });
    await expect(dailyActionPlan('restore-snapshot', ['--dry-run', 'before-update', 'devel'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/restore-snapshot.sh'),
      args: ['--dry-run', 'before-update', 'devel'],
    });
    await expect(dailyActionPlan('lint', [], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/lint.sh'),
      args: [],
    });
    await expect(dailyActionPlan('pot', ['sale,stock', 'devel', 'i18n/sale.pot'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/pot.sh'),
      args: ['sale,stock', 'devel', 'i18n/sale.pot'],
    });
  });

  it('blocks destructive maintenance commands in stage and prod unless explicitly allowed', async () => {
    const stageTarget = await makeEnvironment({
      scripts: ['resetdb.sh', 'restore-snapshot.sh'],
      env: 'WPMOO_ENV=stage\n',
    });
    const prodTarget = await makeEnvironment({
      scripts: ['restore-snapshot.sh'],
      env: 'WPMOO_ENV=prod\n',
    });
    const allowedTarget = await makeEnvironment({
      scripts: ['resetdb.sh'],
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_DESTRUCTIVE=1\nWPMOO_ALLOW_NO_RECENT_SNAPSHOT=1\n',
    });

    await expect(dailyActionPlan('resetdb', ['devel'], stageTarget)).rejects.toThrow(
      "Refusing destructive command 'resetdb' in WPMOO_ENV=stage. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.",
    );
    await expect(dailyActionPlan('restore-snapshot', ['before-update', 'devel'], prodTarget)).rejects.toThrow(
      "Refusing destructive command 'restore-snapshot' in WPMOO_ENV=prod. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.",
    );
    await expect(dailyActionPlan('restore-snapshot', ['--dry-run', 'before-update', 'devel'], prodTarget)).resolves.toMatchObject({
      scriptPath: join(prodTarget, 'scripts/restore-snapshot.sh'),
      args: ['--dry-run', 'before-update', 'devel'],
    });
    await expect(dailyActionPlan('resetdb', ['devel'], allowedTarget)).resolves.toMatchObject({
      scriptPath: join(allowedTarget, 'scripts/resetdb.sh'),
      args: ['devel'],
    });
  });

  it('requires a recent snapshot posture before approved destructive stage/prod commands', async () => {
    const blockedTarget = await makeEnvironment({
      scripts: ['resetdb.sh'],
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_DESTRUCTIVE=1\n',
    });
    const recentSnapshotTarget = await makeEnvironment({
      scripts: ['resetdb.sh'],
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_DESTRUCTIVE=1\n',
    });
    await mkdir(join(recentSnapshotTarget, 'backups'), { recursive: true });
    await writeFile(join(recentSnapshotTarget, 'backups', 'before-reset.dump'), 'snapshot');

    await expect(dailyActionPlan('resetdb', ['devel'], blockedTarget)).rejects.toThrow(
      "Refusing destructive command 'resetdb' in WPMOO_ENV=stage without a recent database snapshot. Create a snapshot first or set WPMOO_ALLOW_NO_RECENT_SNAPSHOT=1 to run it intentionally.",
    );
    await expect(dailyActionPlan('resetdb', ['devel'], recentSnapshotTarget)).resolves.toMatchObject({
      scriptPath: join(recentSnapshotTarget, 'scripts/resetdb.sh'),
      args: ['devel'],
    });
  });

  it('returns a safety preview with backup warnings without converting them into policy refusals', async () => {
    const target = await makeEnvironment({
      scripts: ['resetdb.sh'],
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_DESTRUCTIVE=1\n',
    });

    const preview = await dailyActionSafetyPreview('resetdb', ['devel'], target);

    expect(preview).toMatchObject({
      command: 'resetdb',
      environment: 'stage',
      destructive: true,
      allowed: true,
      args: ['devel'],
      snapshot: {
        requiredRecent: true,
        newestSnapshotAgeMs: null,
      },
    });
    expect(preview.refusalMessage).toBeUndefined();
    expect(preview.warnings).toEqual([
      expect.objectContaining({
        kind: 'no-recent-snapshot',
        requiredFlag: 'WPMOO_ALLOW_NO_RECENT_SNAPSHOT',
        blocking: true,
      }),
    ]);
  });

  it('blocks stage/prod module lifecycle changes without blocking stage tests or read-only maintenance', async () => {
    const scripts = ['install.sh', 'update.sh', 'test.sh', 'snapshot.sh', 'restore-snapshot.sh', 'lint.sh', 'pot.sh'];
    const stageTarget = await makeEnvironment({
      scripts,
      env: 'WPMOO_ENV=stage\n',
    });
    const allowedStageTarget = await makeEnvironment({
      scripts,
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_STAGE_LIFECYCLE=1\n',
    });
    const prodTarget = await makeEnvironment({
      scripts,
      env: 'WPMOO_ENV=prod\n',
    });
    const allowedProdTarget = await makeEnvironment({
      scripts,
      env: 'WPMOO_ENV=prod\nWPMOO_ALLOW_PROD_LIFECYCLE=1\n',
    });

    await expect(dailyActionPlan('install', ['sale'], stageTarget)).rejects.toThrow(
      "Refusing stage lifecycle command 'install' in WPMOO_ENV=stage. Set WPMOO_ALLOW_STAGE_LIFECYCLE=1 to run it intentionally.",
    );
    await expect(dailyActionPlan('update', ['sale', 'devel'], stageTarget)).rejects.toThrow(
      "Refusing stage lifecycle command 'update' in WPMOO_ENV=stage. Set WPMOO_ALLOW_STAGE_LIFECYCLE=1 to run it intentionally.",
    );
    await expect(
      dailyActionPlan('test', ['sale', '--db', 'devel', '--mode', 'update'], stageTarget),
    ).resolves.toMatchObject({
      scriptPath: join(stageTarget, 'scripts/test.sh'),
      args: ['sale', '--db', 'devel', '--mode', 'update'],
    });
    await expect(dailyActionPlan('install', ['sale'], allowedStageTarget)).resolves.toMatchObject({
      scriptPath: join(allowedStageTarget, 'scripts/install.sh'),
      args: ['sale'],
    });
    await expect(dailyActionPlan('update', ['sale', 'devel'], allowedStageTarget)).resolves.toMatchObject({
      scriptPath: join(allowedStageTarget, 'scripts/update.sh'),
      args: ['sale', 'devel'],
    });

    for (const command of ['install', 'update', 'test'] as const) {
      await expect(dailyActionPlan(command, command === 'test' ? ['sale'] : ['sale', 'devel'], prodTarget)).rejects.toThrow(
        `Refusing production lifecycle command '${command}' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally.`,
      );
    }

    await expect(dailyActionPlan('snapshot', ['devel', 'before-update'], prodTarget)).resolves.toMatchObject({
      scriptPath: join(prodTarget, 'scripts/snapshot.sh'),
      args: ['devel', 'before-update'],
    });
    await expect(dailyActionPlan('restore-snapshot', ['--dry-run', 'before-update', 'devel'], prodTarget)).resolves.toMatchObject({
      scriptPath: join(prodTarget, 'scripts/restore-snapshot.sh'),
      args: ['--dry-run', 'before-update', 'devel'],
    });
    await expect(dailyActionPlan('lint', [], prodTarget)).resolves.toMatchObject({
      scriptPath: join(prodTarget, 'scripts/lint.sh'),
      args: [],
    });
    await expect(dailyActionPlan('pot', ['sale', 'devel', 'i18n/sale.pot'], prodTarget)).resolves.toMatchObject({
      scriptPath: join(prodTarget, 'scripts/pot.sh'),
      args: ['sale', 'devel', 'i18n/sale.pot'],
    });

    await expect(dailyActionPlan('install', ['sale'], allowedProdTarget)).resolves.toMatchObject({
      scriptPath: join(allowedProdTarget, 'scripts/install.sh'),
      args: ['sale'],
    });
    await expect(dailyActionPlan('update', ['sale', 'devel'], allowedProdTarget)).resolves.toMatchObject({
      scriptPath: join(allowedProdTarget, 'scripts/update.sh'),
      args: ['sale', 'devel'],
    });
    await expect(dailyActionPlan('test', ['sale'], allowedProdTarget)).resolves.toMatchObject({
      scriptPath: join(allowedProdTarget, 'scripts/test.sh'),
      args: ['sale'],
    });
  });

  it('blocks stage/prod stop and restart unless lifecycle approval is explicit', async () => {
    const scripts = ['up.sh', 'down.sh', 'restart.sh'];
    const devTarget = await makeEnvironment({ scripts, env: 'WPMOO_ENV=dev\n' });
    const stageTarget = await makeEnvironment({ scripts, env: 'WPMOO_ENV=stage\n' });
    const allowedStageTarget = await makeEnvironment({
      scripts,
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_STAGE_LIFECYCLE=1\n',
    });
    const prodTarget = await makeEnvironment({ scripts, env: 'WPMOO_ENV=prod\n' });
    const allowedProdTarget = await makeEnvironment({
      scripts,
      env: 'WPMOO_ENV=prod\nWPMOO_ALLOW_PROD_LIFECYCLE=1\n',
    });

    await expect(dailyActionPlan('start', [], prodTarget)).resolves.toMatchObject({
      scriptPath: join(prodTarget, 'scripts/up.sh'),
      args: [],
    });

    for (const command of ['stop', 'restart'] as const) {
      await expect(dailyActionPlan(command, [], devTarget)).resolves.toMatchObject({
        scriptPath: join(devTarget, command === 'stop' ? 'scripts/down.sh' : 'scripts/restart.sh'),
        args: [],
      });
      await expect(dailyActionPlan(command, [], stageTarget)).rejects.toThrow(
        `Refusing stage lifecycle command '${command}' in WPMOO_ENV=stage. Set WPMOO_ALLOW_STAGE_LIFECYCLE=1 to run it intentionally.`,
      );
      await expect(dailyActionPlan(command, [], prodTarget)).rejects.toThrow(
        `Refusing production lifecycle command '${command}' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally.`,
      );
      await expect(dailyActionPlan(command, [], allowedStageTarget)).resolves.toMatchObject({
        scriptPath: join(allowedStageTarget, command === 'stop' ? 'scripts/down.sh' : 'scripts/restart.sh'),
        args: [],
      });
      await expect(dailyActionPlan(command, [], allowedProdTarget)).resolves.toMatchObject({
        scriptPath: join(allowedProdTarget, command === 'stop' ? 'scripts/down.sh' : 'scripts/restart.sh'),
        args: [],
      });
    }
  });

  it('requires explicit migration approval in stage/prod when module migration scripts are present', async () => {
    const blockedTarget = await makeEnvironment({
      scripts: ['install.sh'],
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_STAGE_LIFECYCLE=1\n',
    });
    await mkdir(join(blockedTarget, 'odoo/custom/src/private/acme/sale_extension/migrations/19.0.1.0'), {
      recursive: true,
    });
    await writeFile(
      join(blockedTarget, 'odoo/custom/src/private/acme/sale_extension/migrations/19.0.1.0/pre-migration.py'),
      '# migration',
    );

    await expect(dailyActionPlan('install', ['sale_extension'], blockedTarget)).rejects.toThrow(
      "Refusing migration-risk command 'install' in WPMOO_ENV=stage. Review detected migration scripts or set WPMOO_ALLOW_MIGRATIONS=1 to run it intentionally.",
    );

    await writeFile(
      join(blockedTarget, '.env'),
      'WPMOO_ENV=stage\nWPMOO_ALLOW_STAGE_LIFECYCLE=1\nWPMOO_ALLOW_MIGRATIONS=1\n',
    );
    await expect(dailyActionPlan('install', ['sale_extension'], blockedTarget)).resolves.toMatchObject({
      scriptPath: join(blockedTarget, 'scripts/install.sh'),
      args: ['sale_extension'],
    });
  });

  it('accepts time-bounded approval ledger entries for stage lifecycle commands', async () => {
    const target = await makeEnvironment({
      scripts: ['install.sh'],
      env: 'WPMOO_ENV=stage\n',
    });
    await writeFile(
      join(target, '.wpmoo', 'approvals.jsonl'),
      `${JSON.stringify({
        scope: 'stage-lifecycle',
        environment: 'stage',
        command: 'install',
        expiresAt: '2999-01-01T00:00:00.000Z',
        reason: 'planned stage install',
      })}\n`,
      'utf8',
    );

    await expect(dailyActionSafetyPreview('install', ['sale'], target)).resolves.toMatchObject({
      allowed: true,
      approvedFlags: ['approval:stage-lifecycle'],
      approvals: [
        {
          scope: 'stage-lifecycle',
          environment: 'stage',
          command: 'install',
          reason: 'planned stage install',
        },
      ],
    });
    await expect(dailyActionPlan('install', ['sale'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/install.sh'),
      args: ['sale'],
    });
  });

  it('accepts ledger approvals for destructive and migration-risk stage commands', async () => {
    const resetTarget = await makeEnvironment({
      scripts: ['resetdb.sh'],
      env: 'WPMOO_ENV=stage\n',
    });
    await writeFile(
      join(resetTarget, '.wpmoo', 'approvals.jsonl'),
      [
        JSON.stringify({ scope: 'destructive', environment: 'stage', command: 'resetdb', expiresAt: '2999-01-01T00:00:00.000Z' }),
        JSON.stringify({ scope: 'no-recent-snapshot', environment: 'stage', command: 'resetdb', expiresAt: '2999-01-01T00:00:00.000Z' }),
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(dailyActionPlan('resetdb', ['devel'], resetTarget)).resolves.toMatchObject({
      scriptPath: join(resetTarget, 'scripts/resetdb.sh'),
      args: ['devel'],
    });

    const migrationTarget = await makeEnvironment({
      scripts: ['install.sh'],
      env: 'WPMOO_ENV=stage\n',
    });
    await mkdir(join(migrationTarget, 'odoo/custom/src/private/acme/sale_extension/migrations/19.0.1.0'), {
      recursive: true,
    });
    await writeFile(
      join(migrationTarget, 'odoo/custom/src/private/acme/sale_extension/migrations/19.0.1.0/pre-migration.py'),
      '# migration',
      'utf8',
    );
    await writeFile(
      join(migrationTarget, '.wpmoo', 'approvals.jsonl'),
      [
        JSON.stringify({ scope: 'stage-lifecycle', environment: 'stage', command: 'install', expiresAt: '2999-01-01T00:00:00.000Z' }),
        JSON.stringify({ scope: 'migration-risk', environment: 'stage', command: 'install', expiresAt: '2999-01-01T00:00:00.000Z' }),
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(dailyActionPlan('install', ['sale_extension'], migrationTarget)).resolves.toMatchObject({
      scriptPath: join(migrationTarget, 'scripts/install.sh'),
      args: ['sale_extension'],
    });
  });

  it('writes an audit log for production-sensitive daily action attempts', async () => {
    const target = await makeEnvironment({
      scripts: ['install.sh'],
      env: 'WPMOO_ENV=prod\n',
    });

    await expect(dailyActionPlan('install', ['sale'], target)).rejects.toThrow(
      "Refusing production lifecycle command 'install' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally.",
    );

    const log = await readFile(join(target, '.wpmoo', 'audit.log'), 'utf8');
    const entry = JSON.parse(log.trim()) as Record<string, unknown>;
    expect(entry).toMatchObject({
      command: 'install',
      environment: 'prod',
      dryRun: false,
      approvedFlags: [],
      args: ['sale'],
    });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('includes approval ledger entries in production audit logs', async () => {
    const target = await makeEnvironment({
      scripts: ['install.sh'],
      env: 'WPMOO_ENV=prod\n',
    });
    await writeFile(
      join(target, '.wpmoo', 'approvals.jsonl'),
      `${JSON.stringify({
        scope: 'prod-lifecycle',
        environment: 'prod',
        command: 'install',
        expiresAt: '2999-01-01T00:00:00.000Z',
      })}\n`,
      'utf8',
    );

    await expect(dailyActionPlan('install', ['sale'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/install.sh'),
      args: ['sale'],
    });

    const log = await readFile(join(target, '.wpmoo', 'audit.log'), 'utf8');
    const entry = JSON.parse(log.trim()) as Record<string, unknown>;
    expect(entry).toMatchObject({
      command: 'install',
      environment: 'prod',
      approvedFlags: ['approval:prod-lifecycle'],
      args: ['sale'],
    });
  });

  it('prefers process environment production lifecycle flags over .env values', async () => {
    const originalEnv = {
      WPMOO_ENV: process.env.WPMOO_ENV,
      WPMOO_ALLOW_PROD_LIFECYCLE: process.env.WPMOO_ALLOW_PROD_LIFECYCLE,
    };
    const target = await makeEnvironment({
      scripts: ['install.sh'],
      env: 'WPMOO_ENV=stage\n',
    });

    try {
      process.env.WPMOO_ENV = 'prod';
      delete process.env.WPMOO_ALLOW_PROD_LIFECYCLE;
      await expect(dailyActionPlan('install', ['sale'], target)).rejects.toThrow(
        "Refusing production lifecycle command 'install' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally.",
      );

      process.env.WPMOO_ALLOW_PROD_LIFECYCLE = '1';
      await expect(dailyActionPlan('install', ['sale'], target)).resolves.toMatchObject({
        scriptPath: join(target, 'scripts/install.sh'),
        args: ['sale'],
      });
    } finally {
      if (originalEnv.WPMOO_ENV === undefined) {
        delete process.env.WPMOO_ENV;
      } else {
        process.env.WPMOO_ENV = originalEnv.WPMOO_ENV;
      }

      if (originalEnv.WPMOO_ALLOW_PROD_LIFECYCLE === undefined) {
        delete process.env.WPMOO_ALLOW_PROD_LIFECYCLE;
      } else {
        process.env.WPMOO_ALLOW_PROD_LIFECYCLE = originalEnv.WPMOO_ALLOW_PROD_LIFECYCLE;
      }
    }
  });

  it('requires module arguments for module lifecycle commands', async () => {
    const target = await makeEnvironment({ scripts: ['install.sh', 'update.sh', 'test.sh'] });

    await expect(dailyActionPlan('install', [], target)).rejects.toThrow(
      'Usage: wpmoo install <module[,module]> [db]',
    );
    await expect(dailyActionPlan('update', [], target)).rejects.toThrow(
      'Usage: wpmoo update <module[,module]> [db]',
    );
    await expect(dailyActionPlan('test', ['--db', 'devel'], target)).rejects.toThrow(
      'Usage: wpmoo test <module[,module]> [--db <db>] [--mode auto|init|update] [--tags <tags>]',
    );
  });

  it('validates compose maintenance command arguments conservatively', async () => {
    const target = await makeEnvironment({
      scripts: ['up.sh', 'logs.sh', 'resetdb.sh', 'snapshot.sh', 'restore-snapshot.sh', 'lint.sh', 'pot.sh'],
    });

    await expect(dailyActionPlan('resetdb', ['devel', 'sale', 'extra'], target)).rejects.toThrow(
      'Usage: wpmoo resetdb [db] [module[,module]]',
    );
    await expect(dailyActionPlan('snapshot', ['devel', 'before-update', 'extra'], target)).rejects.toThrow(
      'Usage: wpmoo snapshot [--list] [db] [snapshot-name]',
    );
    await expect(dailyActionPlan('restore-snapshot', [], target)).rejects.toThrow(
      'Usage: wpmoo restore-snapshot [--dry-run] <snapshot-name> [db]',
    );
    await expect(dailyActionPlan('lint', ['sale'], target)).rejects.toThrow('Usage: wpmoo lint');
    await expect(dailyActionPlan('pot', [], target)).rejects.toThrow(
      'Usage: wpmoo pot <module[,module]> [db] [output]',
    );

    await expect(dailyActionPlan('start', ['--verbose'], target)).rejects.toThrow('Usage: wpmoo start');
    await expect(dailyActionPlan('logs', ['web', 'db', 'extra'], target)).rejects.toThrow(
      'Usage: wpmoo logs [service] [tail-lines]',
    );
    await expect(dailyActionPlan('logs', ['odoo', '0'], target)).rejects.toThrow(
      'Invalid logs tail count: expected a positive integer.',
    );
    await expect(dailyActionPlan('logs', ['odoo', 'abc'], target)).rejects.toThrow(
      'Invalid logs tail count: expected a positive integer.',
    );
  });

  it('rejects unsafe database names before building daily action script plans', async () => {
    const target = await makeEnvironment({
      scripts: ['psql.sh', 'resetdb.sh', 'snapshot.sh', 'restore-snapshot.sh', 'install.sh', 'update.sh', 'test.sh', 'pot.sh'],
    });

    await expect(dailyActionPlan('psql', ['prod;drop'], target)).rejects.toThrow(
      'Invalid database name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
    await expect(dailyActionPlan('resetdb', ['-prod'], target)).rejects.toThrow(
      'Invalid database name: leading hyphens are not allowed.',
    );
    await expect(dailyActionPlan('snapshot', ['prod db'], target)).rejects.toThrow(
      'Invalid database name: whitespace is not allowed.',
    );
    await expect(dailyActionPlan('snapshot', ['devel', '../before-update'], target)).rejects.toThrow(
      'Invalid snapshot name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
    await expect(dailyActionPlan('restore-snapshot', ['before update', 'devel'], target)).rejects.toThrow(
      'Invalid snapshot name: whitespace is not allowed.',
    );
    await expect(dailyActionPlan('restore-snapshot', ['before-update', '../prod'], target)).rejects.toThrow(
      'Invalid database name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
    await expect(dailyActionPlan('install', ['sale', 'prod#1'], target)).rejects.toThrow(
      'Invalid database name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
    await expect(dailyActionPlan('update', ['sale', 'prod$1'], target)).rejects.toThrow(
      'Invalid database name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
    await expect(dailyActionPlan('test', ['sale', '--db', 'prod db'], target)).rejects.toThrow(
      'Invalid database name: whitespace is not allowed.',
    );
    await expect(dailyActionPlan('pot', ['sale', 'prod;drop'], target)).rejects.toThrow(
      'Invalid database name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
  });

  it('requires daily actions to run from an environment root', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-daily-actions-no-env-'));
    await mkdir(join(target, 'scripts'), { recursive: true });
    await writeFile(join(target, 'scripts/logs.sh'), '#!/usr/bin/env bash\n');

    await expect(dailyActionPlan('logs', [], target)).rejects.toThrow(
      'Daily actions must be run from a WPMoo Toolkit environment root containing .wpmoo/odoo.json.',
    );
  });

  it('fails when the expected script is missing', async () => {
    const target = await makeEnvironment();

    await expect(dailyActionPlan('logs', [], target)).rejects.toThrow('Missing daily action script: scripts/logs.sh');
  });

  it('runs the planned fixed script through an injected runner', async () => {
    const target = await makeEnvironment({ scripts: ['restart.sh'] });
    const calls: unknown[] = [];

    await runDailyAction('restart', [], target, async (plan) => {
      calls.push(plan);
    });

    expect(calls).toEqual([
      {
        cwd: target,
        scriptPath: join(target, 'scripts/restart.sh'),
        args: [],
      },
    ]);
  });

  it('delegates logs, test, and restore-snapshot arguments through runDailyAction', async () => {
    const target = await makeEnvironment({ scripts: ['logs.sh', 'test.sh', 'restore-snapshot.sh'] });
    const calls: unknown[] = [];

    await runDailyAction('logs', ['web'], target, async (plan) => {
      calls.push(plan);
    });
    await runDailyAction('logs', ['web', '100'], target, async (plan) => {
      calls.push(plan);
    });
    await runDailyAction(
      'test',
      ['module_a', '--db', 'custom', '--mode', 'update', '--tags', 'tag'],
      target,
      async (plan) => {
        calls.push(plan);
      },
    );
    await runDailyAction('restore-snapshot', ['--dry-run', 'snapshot-name', 'customdb'], target, async (plan) => {
      calls.push(plan);
    });

    expect(calls).toEqual([
      {
        cwd: target,
        scriptPath: join(target, 'scripts/logs.sh'),
        args: ['web'],
      },
      {
        cwd: target,
        scriptPath: join(target, 'scripts/logs.sh'),
        args: ['web', '100'],
      },
      {
        cwd: target,
        scriptPath: join(target, 'scripts/test.sh'),
        args: ['module_a', '--db', 'custom', '--mode', 'update', '--tags', 'tag'],
      },
      {
        cwd: target,
        scriptPath: join(target, 'scripts/restore-snapshot.sh'),
        args: ['--dry-run', 'snapshot-name', 'customdb'],
      },
    ]);
  });

  it('styles warning output while keeping regular output unchanged', () => {
    expect(
      renderDailyActionOutput(
        [
          '[+] Creating 1/1',
          "WARNING: Skipping /usr/lib/python3.12/dist-packages/charset_normalizer-3.3.2.dist-info due to invalid metadata entry 'name'",
          'psycopg2.OperationalError: could not connect to server',
          "Running as user 'root' is a security risk.",
          'Done',
          '',
        ].join('\n'),
      ),
    ).toBe(
      [
        '[+] Creating 1/1',
        "\u001B[33mWARNING:\u001B[39m\u001B[2m\u001B[38;2;120;157;181m Skipping /usr/lib/python3.12/dist-packages/charset_normalizer-3.3.2.dist-info due to invalid metadata entry 'name'\u001B[0m",
        'psycopg2.OperationalError: could not connect to server',
        '\u001B[2m\u001B[38;2;120;157;181mNOTE: PostgreSQL connection failed. Check ./moo status, database service readiness, and credentials before retrying.\u001B[0m',
        "\u001B[2m\u001B[38;2;120;157;181mRunning as user 'root' is a security risk.\u001B[0m",
        'Done',
        '',
      ].join('\n'),
    );
  });

  it('runs daily action scripts through a styled output writer', async () => {
    const target = await makeEnvironment({ scripts: ['update.sh'] });
    const scriptPath = join(target, 'scripts', 'update.sh');
    await writeFile(
      scriptPath,
      [
        '#!/usr/bin/env bash',
        'echo "regular output"',
        'echo "WARNING: streamed warning" >&2',
        '',
      ].join('\n'),
    );
    await chmod(scriptPath, 0o755);
    const chunks: string[] = [];

    await runDailyActionWithStyledOutput('update', ['sale'], target, (chunk) => chunks.push(chunk));

    expect(chunks.join('')).toContain('regular output');
    expect(chunks.join('')).toContain('\u001B[33mWARNING:\u001B[39m');
    expect(chunks.join('')).toContain('\u001B[2m\u001B[38;2;120;157;181m streamed warning\u001B[0m');
  });

  it('surfaces Odoo test log excerpts when styled test runs fail', async () => {
    const target = await makeEnvironment({ scripts: ['test.sh'] });
    const scriptPath = join(target, 'scripts', 'test.sh');
    await mkdir(join(target, 'logs'), { recursive: true });
    await writeFile(
      join(target, 'logs', 'odoo-test-module_a.log'),
      [
        'INFO setup',
        'Traceback (most recent call last):',
        '  File "/odoo/addons/module_a/tests/test_demo.py", line 12, in test_demo',
        'AssertionError: expected Category Rank 1, got 2',
        '',
      ].join('\n'),
    );
    await writeFile(scriptPath, '#!/usr/bin/env bash\nexit 7\n');
    await chmod(scriptPath, 0o755);
    const chunks: string[] = [];

    await expect(runDailyActionWithStyledOutput('test', ['module_a'], target, (chunk) => chunks.push(chunk))).rejects.toThrow(
      `Daily action script exited with code 7: ${scriptPath}`,
    );

    const output = chunks.join('');
    expect(output).toContain('Test failed: module_a');
    expect(output).toContain('Relevant log excerpt:');
    expect(output).toContain('AssertionError: expected Category Rank 1, got 2');
    expect(output).toContain('Full log: ./logs/odoo-test-module_a.log');
  });

  it('surfaces Odoo test log excerpts when inherited-output test runs fail', async () => {
    const target = await makeEnvironment({ scripts: ['test.sh'] });
    const scriptPath = join(target, 'scripts', 'test.sh');
    await mkdir(join(target, 'logs'), { recursive: true });
    await writeFile(join(target, 'logs', 'odoo-test-module_a.log'), 'FAIL: test_demo\nAssertionError: broken\n');
    await writeFile(scriptPath, '#!/usr/bin/env bash\nexit 7\n');
    await chmod(scriptPath, 0o755);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runDailyAction('test', ['module_a'], target)).rejects.toThrow(
      `Daily action script exited with code 7: ${scriptPath}`,
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Test failed: module_a'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AssertionError: broken'));
    errorSpy.mockRestore();
  });

  it('rejects invalid test arguments with existing error wording', async () => {
    const target = await makeEnvironment({ scripts: ['test.sh'] });

    await expect(dailyActionPlan('test', ['module_a', '--mode', 'broken'], target)).rejects.toThrow(
      'Invalid value for --mode: expected auto, init, or update',
    );
    await expect(dailyActionPlan('test', ['module_a', '--db'], target)).rejects.toThrow('Missing value for --db');
    await expect(dailyActionPlan('test', ['module_a', '--tags'], target)).rejects.toThrow('Missing value for --tags');
    await expect(dailyActionPlan('test', ['module_a', '--unknown', 'value'], target)).rejects.toThrow(
      'Unknown option for wpmoo test: --unknown',
    );
  });

  it('runs daily action scripts through the default child process runner', async () => {
    const target = await makeEnvironment({ scripts: ['restart.sh'] });
    const scriptPath = join(target, 'scripts', 'restart.sh');

    await writeFile(scriptPath, '#!/usr/bin/env bash\nexit 0\n');
    await chmod(scriptPath, 0o755);

    await expect(runDailyAction('restart', [], target)).resolves.toBeUndefined();
  });

  it('propagates non-zero script exits from the default runner', async () => {
    const target = await makeEnvironment({ scripts: ['restart.sh'] });
    const scriptPath = join(target, 'scripts', 'restart.sh');

    await writeFile(scriptPath, '#!/usr/bin/env bash\nexit 7\n');
    await chmod(scriptPath, 0o755);

    await expect(runDailyAction('restart', [], target)).rejects.toThrow(
      `Daily action script exited with code 7: ${scriptPath}`,
    );
  });
});
