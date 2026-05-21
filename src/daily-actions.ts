import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { readActiveApprovals, type ActiveApproval, type ApprovalScope } from './approval-ledger.js';
import { appendAuditLog } from './audit-log.js';
import { readEnvFile, selectedComposeEnvironment } from './compose-layout.js';
import {
  defaultDatabaseSnapshotMaxAgeMs,
  findDatabaseSnapshots,
  normalizeDatabaseName,
  restoreSnapshotPreflight,
  type RestoreSnapshotPreflight,
} from './databases.js';
import {
  evaluateDailyActionPolicy,
  parseEnvironmentKind,
  type EnvironmentKind,
  type PolicyDeny,
} from './environment-policy.js';
import { markerPath } from './environment.js';
import { scanMigrationRisks, type MigrationRiskResult } from './migrations.js';

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

export type DailyActionSafetyWarningKind =
  | 'no-recent-snapshot'
  | 'migration-risk'
  | 'restore-snapshot-missing-dump'
  | 'restore-snapshot-missing-filestore'
  | 'restore-snapshot-db-name-mismatch';

export type DailyActionSafetyWarning = {
  kind: DailyActionSafetyWarningKind;
  message: string;
  requiredFlag?: 'WPMOO_ALLOW_NO_RECENT_SNAPSHOT' | 'WPMOO_ALLOW_MIGRATIONS';
  blocking: boolean;
};

export type DailyActionSafetyPreview = DailyActionPlan & {
  command: DailyActionCommand;
  environment: EnvironmentKind;
  dryRun: boolean;
  destructive: boolean;
  auditWorthy: boolean;
  allowed: boolean;
  deny?: PolicyDeny & { message: string };
  refusalMessage?: string;
  requiredFlag?: string;
  warnings: DailyActionSafetyWarning[];
  snapshot?: {
    requiredRecent: boolean;
    newestSnapshotAgeMs: number | null;
    snapshotPaths: string[];
  };
  restoreSnapshot?: RestoreSnapshotPreflight;
  migrations?: MigrationRiskResult;
  approvals: ActiveApproval[];
  approvedFlags: string[];
};

export type DailyActionRunner = (plan: DailyActionPlan) => Promise<void>;
export type DailyActionOutputWriter = (chunk: string) => void;

const ANSI_DIM_INFO = '\u001B[2m\u001B[38;2;120;157;181m';
const ANSI_WARNING = '\u001B[33m';
const ANSI_DEFAULT_FOREGROUND = '\u001B[39m';
const ANSI_RESET = '\u001B[0m';

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
  if (command === 'logs') return 'Usage: wpmoo logs [service] [tail-lines]';
  if (command === 'restart') return 'Usage: wpmoo restart';
  if (command === 'shell') return 'Usage: wpmoo shell';
  if (command === 'psql') return 'Usage: wpmoo psql [db]';
  if (command === 'install') return 'Usage: wpmoo install <module[,module]> [db]';
  if (command === 'update') return 'Usage: wpmoo update <module[,module]> [db]';
  if (command === 'test') return 'Usage: wpmoo test <module[,module]> [--db <db>] [--mode auto|init|update] [--tags <tags>]';
  if (command === 'resetdb') return 'Usage: wpmoo resetdb [db] [module[,module]]';
  if (command === 'snapshot') return 'Usage: wpmoo snapshot [--list] [db] [snapshot-name]';
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
  return db ? [modules, normalizeDatabaseName(db)] : [modules];
}

function positionalArgs(command: DailyActionCommand, argv: string[], min: number, max: number): string[] {
  if (argv.length < min || argv.length > max || argv.some((arg) => arg.startsWith('-'))) {
    throw new Error(usage(command));
  }

  return argv;
}

function logsArgs(argv: string[]): string[] {
  if (argv.length > 2 || argv.some((arg) => arg.startsWith('-'))) {
    throw new Error(usage('logs'));
  }

  const [service = 'odoo', tail] = argv;
  if (tail === undefined) {
    return [service];
  }
  if (!/^[1-9][0-9]*$/u.test(tail)) {
    throw new Error('Invalid logs tail count: expected a positive integer.');
  }
  return [service, tail];
}

function validateDatabaseArg(args: string[], index: number): string[] {
  if (args[index] === undefined) {
    return args;
  }
  const nextArgs = [...args];
  nextArgs[index] = normalizeDatabaseName(nextArgs[index]);
  return nextArgs;
}

function rejectLeadingHyphenDatabaseArg(args: readonly string[]): void {
  if (args[0]?.startsWith('-')) {
    normalizeDatabaseName(args[0]);
  }
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

  const validatedArgs = args.length === 2 ? validateDatabaseArg(args, 1) : args;
  return dryRun ? ['--dry-run', ...validatedArgs] : validatedArgs;
}

function testArgs(argv: string[]): string[] {
  const [modules, ...rest] = argv;
  if (!modules || modules.startsWith('-')) throw new Error(usage('test'));

  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (!['--db', '--mode', '--tags'].includes(option)) throw new Error(`Unknown option for wpmoo test: ${option}`);

    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    if (option === '--mode' && value !== 'auto' && value !== 'init' && value !== 'update') {
      throw new Error('Invalid value for --mode: expected auto, init, or update');
    }
    if (option === '--db') {
      normalizeDatabaseName(value);
    }
    index += 1;
  }

  return argv;
}

function scriptArgs(command: DailyActionCommand, argv: string[]): string[] {
  if (command === 'start') return ensureNoArgs(command, argv);
  if (command === 'stop') return ensureNoArgs(command, argv);
  if (command === 'logs') return logsArgs(argv);
  if (command === 'restart') return ensureNoArgs(command, argv);
  if (command === 'shell') return ensureNoArgs(command, argv);
  if (command === 'psql') return optionalSingleArg(command, argv, 'postgres').map(normalizeDatabaseName);
  if (command === 'install' || command === 'update') return moduleArgs(command, argv);
  if (command === 'test') return testArgs(argv);
  if (command === 'resetdb') {
    rejectLeadingHyphenDatabaseArg(argv);
    return validateDatabaseArg(positionalArgs(command, argv, 0, 2), 0);
  }
  if (command === 'snapshot') {
    rejectLeadingHyphenDatabaseArg(argv);
    return validateDatabaseArg(positionalArgs(command, argv, 0, 2), 0);
  }
  if (command === 'restore-snapshot') return restoreSnapshotArgs(argv);
  if (command === 'lint') return ensureNoArgs(command, argv);
  return validateDatabaseArg(positionalArgs(command, argv, 1, 3), 1);
}

async function assertEnvironmentRoot(cwd: string): Promise<void> {
  try {
    await access(join(cwd, markerPath));
  } catch {
    throw new Error('Daily actions must be run from a WPMoo Toolkit environment root containing .wpmoo/odoo.json.');
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

function envValue(env: Map<string, string> | undefined, key: string): string | undefined {
  return process.env[key]?.trim() || env?.get(key)?.trim();
}

function flagEnabled(env: Map<string, string> | undefined, key: string): boolean {
  return envValue(env, key) === '1';
}

function envApprovedFlags(env: Map<string, string> | undefined): string[] {
  return [
    'WPMOO_ALLOW_DESTRUCTIVE',
    'WPMOO_ALLOW_STAGE_LIFECYCLE',
    'WPMOO_ALLOW_PROD_LIFECYCLE',
    'WPMOO_ALLOW_NO_RECENT_SNAPSHOT',
    'WPMOO_ALLOW_MIGRATIONS',
  ].filter((key) => flagEnabled(env, key));
}

function hasApproval(approvals: readonly ActiveApproval[], scope: ApprovalScope): boolean {
  return approvals.some((approval) => approval.scope === scope);
}

function approvalFlagLabels(approvals: readonly ActiveApproval[]): string[] {
  return [...new Set(approvals.map((approval) => approval.label))];
}

function requiresMigrationApproval(command: DailyActionCommand): boolean {
  return command === 'install' || command === 'update' || command === 'test';
}

function noRecentSnapshotMessage(command: DailyActionCommand, environment: EnvironmentKind): string {
  return `Refusing destructive command '${command}' in WPMOO_ENV=${environment} without a recent database snapshot. Create a snapshot first or set WPMOO_ALLOW_NO_RECENT_SNAPSHOT=1 to run it intentionally.`;
}

function migrationRiskMessage(command: DailyActionCommand, environment: EnvironmentKind): string {
  return `Refusing migration-risk command '${command}' in WPMOO_ENV=${environment}. Review detected migration scripts or set WPMOO_ALLOW_MIGRATIONS=1 to run it intentionally.`;
}

function restoreSnapshotWarningKind(issue: string): DailyActionSafetyWarningKind | undefined {
  if (issue === 'missing snapshot dump') return 'restore-snapshot-missing-dump';
  if (issue === 'missing snapshot filestore') return 'restore-snapshot-missing-filestore';
  if (issue.startsWith('snapshot database mismatch:')) return 'restore-snapshot-db-name-mismatch';
  return undefined;
}

function restoreSnapshotDryRunPreflight(
  command: DailyActionCommand,
  args: readonly string[],
  cwd: string,
): RestoreSnapshotPreflight | undefined {
  if (command !== 'restore-snapshot' || args[0] !== '--dry-run') {
    return undefined;
  }

  const snapshotName = args[1];
  if (!snapshotName) {
    return undefined;
  }

  return restoreSnapshotPreflight(cwd, snapshotName, args[2] ?? 'devel');
}

async function auditDailyActionPreview(preview: DailyActionSafetyPreview): Promise<void> {
  if (preview.environment !== 'prod' || !preview.auditWorthy) {
    return;
  }

  await appendAuditLog({
    environmentPath: preview.cwd,
    command: preview.command,
    environment: preview.environment,
    dryRun: preview.dryRun,
    args: preview.args,
    approvedFlagNames: [],
    approvedFlags: preview.approvedFlags,
  });
}

export async function dailyActionSafetyPreview(
  command: DailyActionCommand,
  argv: string[],
  cwd = process.cwd(),
): Promise<DailyActionSafetyPreview> {
  await assertEnvironmentRoot(cwd);
  const scriptPath = await assertScriptExists(cwd, dailyActionScripts[command]);
  const args = scriptArgs(command, argv);
  const env = await readEnvFile(cwd);
  const envName = envValue(env, 'WPMOO_ENV') || selectedComposeEnvironment(env);
  const environment = parseEnvironmentKind(envName);
  const approvals = await readActiveApprovals(cwd, { command, environment });
  const policy = evaluateDailyActionPolicy(command, args, {
    envName,
    allowDestructive: envValue(env, 'WPMOO_ALLOW_DESTRUCTIVE') || (hasApproval(approvals, 'destructive') ? '1' : undefined),
    allowStageLifecycle:
      envValue(env, 'WPMOO_ALLOW_STAGE_LIFECYCLE') || (hasApproval(approvals, 'stage-lifecycle') ? '1' : undefined),
    allowProdLifecycle:
      envValue(env, 'WPMOO_ALLOW_PROD_LIFECYCLE') || (hasApproval(approvals, 'prod-lifecycle') ? '1' : undefined),
  });
  const warnings: DailyActionSafetyWarning[] = [];
  const restoreSnapshot = restoreSnapshotDryRunPreflight(command, args, cwd);
  if (restoreSnapshot) {
    for (const issue of restoreSnapshot.issues) {
      const kind = restoreSnapshotWarningKind(issue);
      if (!kind) {
        continue;
      }
      warnings.push({ kind, message: issue, blocking: false });
    }
  }

  const snapshotRequired = policy.isDestructive && (policy.env === 'stage' || policy.env === 'prod');
  const snapshot = snapshotRequired ? findDatabaseSnapshots(cwd) : undefined;
  const noRecentSnapshot =
    snapshotRequired &&
    snapshot &&
    (snapshot.newestSnapshotAgeMs === null || snapshot.newestSnapshotAgeMs > defaultDatabaseSnapshotMaxAgeMs) &&
    !flagEnabled(env, 'WPMOO_ALLOW_NO_RECENT_SNAPSHOT') &&
    !hasApproval(approvals, 'no-recent-snapshot');

  if (noRecentSnapshot) {
    warnings.push({
      kind: 'no-recent-snapshot',
      requiredFlag: 'WPMOO_ALLOW_NO_RECENT_SNAPSHOT',
      blocking: true,
      message: noRecentSnapshotMessage(command, policy.env),
    });
  }

  const migrations =
    requiresMigrationApproval(command) && (policy.env === 'stage' || policy.env === 'prod')
      ? await scanMigrationRisks(cwd)
      : undefined;
  if (migrations?.risk && !flagEnabled(env, 'WPMOO_ALLOW_MIGRATIONS') && !hasApproval(approvals, 'migration-risk')) {
    warnings.push({
      kind: 'migration-risk',
      requiredFlag: 'WPMOO_ALLOW_MIGRATIONS',
      blocking: true,
      message: migrationRiskMessage(command, policy.env),
    });
  }

  return {
    cwd,
    scriptPath,
    args,
    command,
    environment: policy.env,
    dryRun: policy.isDryRunPreview,
    destructive: policy.isDestructive,
    auditWorthy: policy.isAuditWorthy,
    allowed: policy.allowed,
    deny: policy.allowed ? undefined : { ...policy.deny, message: policy.message },
    refusalMessage: policy.allowed ? undefined : policy.message,
    requiredFlag: policy.allowed ? undefined : policy.deny.requiredFlag,
    warnings,
    snapshot: snapshot
      ? {
          requiredRecent: true,
          newestSnapshotAgeMs: snapshot.newestSnapshotAgeMs,
          snapshotPaths: snapshot.snapshotPaths,
        }
      : undefined,
    restoreSnapshot,
    migrations,
    approvals,
    approvedFlags: [...envApprovedFlags(env), ...approvalFlagLabels(approvals)],
  };
}

export async function dailyActionPlan(
  command: DailyActionCommand,
  argv: string[],
  cwd = process.cwd(),
): Promise<DailyActionPlan> {
  const preview = await dailyActionSafetyPreview(command, argv, cwd);
  await auditDailyActionPreview(preview);

  if (!preview.allowed) {
    throw new Error(preview.refusalMessage);
  }

  const blockingWarning = preview.warnings.find((warning) => warning.blocking);
  if (blockingWarning) {
    throw new Error(blockingWarning.message);
  }

  return {
    cwd: preview.cwd,
    scriptPath: preview.scriptPath,
    args: preview.args,
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

function renderDailyActionOutputLine(line: string): string {
  if (line.startsWith('WARNING:')) {
    return `${ANSI_WARNING}WARNING:${ANSI_DEFAULT_FOREGROUND}${ANSI_DIM_INFO}${line.slice('WARNING:'.length)}${ANSI_RESET}`;
  }

  if (line === "Running as user 'root' is a security risk.") {
    return `${ANSI_DIM_INFO}${line}${ANSI_RESET}`;
  }

  if (line.includes('psycopg2.OperationalError')) {
    return [
      line,
      `${ANSI_DIM_INFO}NOTE: PostgreSQL connection failed. Check ./moo status, database service readiness, and credentials before retrying.${ANSI_RESET}`,
    ].join('\n');
  }

  return line;
}

export function renderDailyActionOutput(output: string): string {
  return output
    .split(/(\r?\n)/u)
    .map((part) => (part === '\n' || part === '\r\n' ? part : renderDailyActionOutputLine(part)))
    .join('');
}

async function spawnDailyActionWithStyledOutput(
  plan: DailyActionPlan,
  writer: DailyActionOutputWriter,
): Promise<void> {
  const child = spawn(plan.scriptPath, plan.args, {
    cwd: plan.cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk: Buffer) => writer(renderDailyActionOutput(chunk.toString('utf8'))));
  child.stderr?.on('data', (chunk: Buffer) => writer(renderDailyActionOutput(chunk.toString('utf8'))));

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

export async function runDailyActionWithStyledOutput(
  command: DailyActionCommand,
  argv: string[],
  cwd = process.cwd(),
  writer: DailyActionOutputWriter = (chunk) => process.stdout.write(chunk),
): Promise<void> {
  await spawnDailyActionWithStyledOutput(await dailyActionPlan(command, argv, cwd), writer);
}
