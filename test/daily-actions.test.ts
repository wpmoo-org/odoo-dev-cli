import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dailyActionPlan, isDailyActionCommand, runDailyAction } from '../src/daily-actions.js';
import { markerPath } from '../src/environment.js';

async function makeEnvironment(options: { scripts?: string[] } = {}): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), 'wpmoo-daily-actions-'));
  await mkdir(join(target, '.wpmoo'), { recursive: true });
  await writeFile(
    join(target, markerPath),
    JSON.stringify({
      tool: '@wpmoo/odoo',
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
    await expect(dailyActionPlan('lint', [], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/lint.sh'),
      args: [],
    });
    await expect(dailyActionPlan('pot', ['sale,stock', 'devel', 'i18n/sale.pot'], target)).resolves.toMatchObject({
      scriptPath: join(target, 'scripts/pot.sh'),
      args: ['sale,stock', 'devel', 'i18n/sale.pot'],
    });
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
      'Usage: wpmoo test <module[,module]> [--db <db>] [--mode init|update] [--tags <tags>]',
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
      'Usage: wpmoo snapshot [db] [snapshot-name]',
    );
    await expect(dailyActionPlan('restore-snapshot', [], target)).rejects.toThrow(
      'Usage: wpmoo restore-snapshot <snapshot-name> [db]',
    );
    await expect(dailyActionPlan('lint', ['sale'], target)).rejects.toThrow('Usage: wpmoo lint');
    await expect(dailyActionPlan('pot', [], target)).rejects.toThrow(
      'Usage: wpmoo pot <module[,module]> [db] [output]',
    );

    await expect(dailyActionPlan('start', ['--verbose'], target)).rejects.toThrow('Usage: wpmoo start');
    await expect(dailyActionPlan('logs', ['web', 'db'], target)).rejects.toThrow('Usage: wpmoo logs [service]');
  });

  it('requires daily actions to run from an environment root', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-daily-actions-no-env-'));
    await mkdir(join(target, 'scripts'), { recursive: true });
    await writeFile(join(target, 'scripts/logs.sh'), '#!/usr/bin/env bash\n');

    await expect(dailyActionPlan('logs', [], target)).rejects.toThrow(
      'Daily actions must be run from a WPMoo Odoo environment root containing .wpmoo/odoo.json.',
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
    await runDailyAction(
      'test',
      ['module_a', '--db', 'custom', '--mode', 'update', '--tags', 'tag'],
      target,
      async (plan) => {
        calls.push(plan);
      },
    );
    await runDailyAction('restore-snapshot', ['snapshot-name', 'customdb'], target, async (plan) => {
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
        scriptPath: join(target, 'scripts/test.sh'),
        args: ['module_a', '--db', 'custom', '--mode', 'update', '--tags', 'tag'],
      },
      {
        cwd: target,
        scriptPath: join(target, 'scripts/restore-snapshot.sh'),
        args: ['snapshot-name', 'customdb'],
      },
    ]);
  });

  it('rejects invalid test arguments with existing error wording', async () => {
    const target = await makeEnvironment({ scripts: ['test.sh'] });

    await expect(dailyActionPlan('test', ['module_a', '--mode', 'broken'], target)).rejects.toThrow(
      'Invalid value for --mode: expected init or update',
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
