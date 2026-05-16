import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { markerPath } from './environment.js';

export const dailyActionCommands = [
  'start',
  'stop',
  'logs',
  'restart',
  'shell',
  'psql',
  'install',
  'update',
  'test',
  'resetdb',
  'snapshot',
  'restore-snapshot',
  'lint',
  'pot',
] as const;

export type DailyActionCommand = (typeof dailyActionCommands)[number];

export type DailyActionPlan = {
  cwd: string;
  scriptPath: string;
  args: string[];
};

export type DailyActionRunner = (plan: DailyActionPlan) => Promise<void>;

const dailyActionCommandSet = new Set<string>(dailyActionCommands);

export const dailyActionScripts: Record<DailyActionCommand, string> = {
  start: 'up.sh',
  stop: 'down.sh',
  logs: 'logs.sh',
  restart: 'restart.sh',
  shell: 'shell.sh',
  psql: 'psql.sh',
  install: 'install.sh',
  update: 'update.sh',
  test: 'test.sh',
  resetdb: 'resetdb.sh',
  snapshot: 'snapshot.sh',
  'restore-snapshot': 'restore-snapshot.sh',
  lint: 'lint.sh',
  pot: 'pot.sh',
};

export function isDailyActionCommand(command: string): command is DailyActionCommand {
  return dailyActionCommandSet.has(command);
}

function usage(command: DailyActionCommand): string {
  if (command === 'start') return 'Usage: wpmoo start';
  if (command === 'stop') return 'Usage: wpmoo stop';
  if (command === 'logs') return 'Usage: wpmoo logs [service]';
  if (command === 'restart') return 'Usage: wpmoo restart';
  if (command === 'shell') return 'Usage: wpmoo shell';
  if (command === 'psql') return 'Usage: wpmoo psql [db]';
  if (command === 'install') return 'Usage: wpmoo install <module[,module]> [db]';
  if (command === 'update') return 'Usage: wpmoo update <module[,module]> [db]';
  if (command === 'test') return 'Usage: wpmoo test <module[,module]> [--db <db>] [--mode init|update] [--tags <tags>]';
  if (command === 'resetdb') return 'Usage: wpmoo resetdb [db] [module[,module]]';
  if (command === 'snapshot') return 'Usage: wpmoo snapshot [db] [snapshot-name]';
  if (command === 'restore-snapshot') return 'Usage: wpmoo restore-snapshot [--dry-run] <snapshot-name> [db]';
  if (command === 'lint') return 'Usage: wpmoo lint';
  return 'Usage: wpmoo pot <module[,module]> [db] [output]';
}

function ensureNoArgs(command: DailyActionCommand, argv: string[]): string[] {
  if (argv.length > 0) throw new Error(usage(command));
  return [];
}

function optionalSingleArg(command: DailyActionCommand, argv: string[], fallback: string): string[] {
  if (argv.length > 1) throw new Error(usage(command));
  return [argv[0] ?? fallback];
}

function moduleArgs(command: 'install' | 'update', argv: string[]): string[] {
  const [modules, db, ...rest] = argv;
  if (!modules || modules.startsWith('-') || rest.length > 0) throw new Error(usage(command));
  return db ? [modules, db] : [modules];
}

function positionalArgs(command: DailyActionCommand, argv: string[], min: number, max: number): string[] {
  if (argv.length < min || argv.length > max || argv.some((arg) => arg.startsWith('-'))) {
    throw new Error(usage(command));
  }

  return argv;
}

function restoreSnapshotArgs(argv: string[]): string[] {
  const args = [...argv];
  const dryRun = args[0] === '--dry-run';
  if (dryRun) {
    args.shift();
  }

  if (args.length < 1 || args.length > 2 || args.some((arg) => arg.startsWith('-'))) {
    throw new Error(usage('restore-snapshot'));
  }

  return dryRun ? ['--dry-run', ...args] : args;
}

function testArgs(argv: string[]): string[] {
  const [modules, ...rest] = argv;
  if (!modules || modules.startsWith('-')) throw new Error(usage('test'));

  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (!['--db', '--mode', '--tags'].includes(option)) throw new Error(`Unknown option for wpmoo test: ${option}`);

    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    if (option === '--mode' && value !== 'init' && value !== 'update') {
      throw new Error('Invalid value for --mode: expected init or update');
    }
    index += 1;
  }

  return argv;
}

function scriptArgs(command: DailyActionCommand, argv: string[]): string[] {
  if (command === 'start') return ensureNoArgs(command, argv);
  if (command === 'stop') return ensureNoArgs(command, argv);
  if (command === 'logs') return optionalSingleArg(command, argv, 'odoo');
  if (command === 'restart') return ensureNoArgs(command, argv);
  if (command === 'shell') return ensureNoArgs(command, argv);
  if (command === 'psql') return optionalSingleArg(command, argv, 'postgres');
  if (command === 'install' || command === 'update') return moduleArgs(command, argv);
  if (command === 'test') return testArgs(argv);
  if (command === 'resetdb') return positionalArgs(command, argv, 0, 2);
  if (command === 'snapshot') return positionalArgs(command, argv, 0, 2);
  if (command === 'restore-snapshot') return restoreSnapshotArgs(argv);
  if (command === 'lint') return ensureNoArgs(command, argv);
  return positionalArgs(command, argv, 1, 3);
}

async function assertEnvironmentRoot(cwd: string): Promise<void> {
  try {
    await access(join(cwd, markerPath));
  } catch {
    throw new Error('Daily actions must be run from a WPMoo Odoo environment root containing .wpmoo/odoo.json.');
  }
}

async function assertScriptExists(cwd: string, script: string): Promise<string> {
  const scriptPath = join(cwd, 'scripts', script);
  try {
    await access(scriptPath);
  } catch {
    throw new Error(`Missing daily action script: scripts/${script}`);
  }
  return scriptPath;
}

export async function dailyActionPlan(
  command: DailyActionCommand,
  argv: string[],
  cwd = process.cwd(),
): Promise<DailyActionPlan> {
  await assertEnvironmentRoot(cwd);
  const scriptPath = await assertScriptExists(cwd, dailyActionScripts[command]);

  return {
    cwd,
    scriptPath,
    args: scriptArgs(command, argv),
  };
}

async function spawnDailyAction(plan: DailyActionPlan): Promise<void> {
  const child = spawn(plan.scriptPath, plan.args, {
    cwd: plan.cwd,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Daily action script exited with code ${exitCode ?? 'unknown'}: ${plan.scriptPath}`);
  }
}

export async function runDailyAction(
  command: DailyActionCommand,
  argv: string[],
  cwd = process.cwd(),
  runner: DailyActionRunner = spawnDailyAction,
): Promise<void> {
  await runner(await dailyActionPlan(command, argv, cwd));
}
