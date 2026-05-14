import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dailyActionPlan, runDailyAction } from '../src/daily-actions.js';
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
      scripts: ['restart.sh', 'shell.sh', 'install.sh', 'update.sh', 'test.sh'],
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
});
