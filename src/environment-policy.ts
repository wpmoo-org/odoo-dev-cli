export type EnvironmentKind = 'dev' | 'stage' | 'prod';

export type DailyActionPolicyCommand =
  | 'start'
  | 'stop'
  | 'logs'
  | 'restart'
  | 'shell'
  | 'psql'
  | 'install'
  | 'update'
  | 'test'
  | 'resetdb'
  | 'snapshot'
  | 'restore-snapshot'
  | 'lint'
  | 'pot';

export const dailyActionPolicyCommands: readonly DailyActionPolicyCommand[] = [
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
];

export type EnvironmentPolicyFlags = {
  envName?: string;
  allowDestructive?: string;
  allowStageLifecycle?: string;
  allowProdLifecycle?: string;
};

export type AllowedValue = '1';

function normalizeFlag(value: string | undefined): string {
  return value?.trim() ?? '';
}

function parseFlag(value: string | undefined): boolean {
  return normalizeFlag(value) === '1';
}

export type DailyActionPolicy = {
  isDestructive: (args: readonly string[]) => boolean;
  isDryRunAllowed: boolean;
  requiresStageLifecycleApproval: boolean;
  requiresProdLifecycleApproval: boolean;
  isAuditWorthy: (args: readonly string[]) => boolean;
};

export const dailyActionPolicyTable: Record<DailyActionPolicyCommand, DailyActionPolicy> = {
  start: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => false,
  },
  stop: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: true,
    requiresProdLifecycleApproval: true,
    isAuditWorthy: () => true,
  },
  logs: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => false,
  },
  restart: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: true,
    requiresProdLifecycleApproval: true,
    isAuditWorthy: () => true,
  },
  shell: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => false,
  },
  psql: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => false,
  },
  install: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: true,
    requiresProdLifecycleApproval: true,
    isAuditWorthy: () => true,
  },
  update: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: true,
    requiresProdLifecycleApproval: true,
    isAuditWorthy: () => true,
  },
  test: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: true,
    isAuditWorthy: () => true,
  },
  resetdb: {
    isDestructive: () => true,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => true,
  },
  snapshot: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => false,
  },
  'restore-snapshot': {
    isDestructive: (args) => args[0] !== '--dry-run',
    isDryRunAllowed: true,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: (args) => args[0] !== '--dry-run',
  },
  lint: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => false,
  },
  pot: {
    isDestructive: () => false,
    isDryRunAllowed: false,
    requiresStageLifecycleApproval: false,
    requiresProdLifecycleApproval: false,
    isAuditWorthy: () => false,
  },
};

export type PolicyDenyKind = 'destructive' | 'stage-lifecycle' | 'prod-lifecycle';

export type PolicyDeny = {
  kind: PolicyDenyKind;
  command: DailyActionPolicyCommand;
  env: EnvironmentKind;
  requiredFlag: 'WPMOO_ALLOW_DESTRUCTIVE' | 'WPMOO_ALLOW_STAGE_LIFECYCLE' | 'WPMOO_ALLOW_PROD_LIFECYCLE';
  requiredValue: AllowedValue;
};

export type PolicyDecision =
  | {
      allowed: false;
      command: DailyActionPolicyCommand;
      env: EnvironmentKind;
      isDestructive: boolean;
      isDryRunPreview: boolean;
      isAuditWorthy: boolean;
      deny: PolicyDeny;
      message: string;
    }
  | {
      allowed: true;
      command: DailyActionPolicyCommand;
      env: EnvironmentKind;
      isDestructive: boolean;
      isDryRunPreview: boolean;
      isAuditWorthy: boolean;
    };

export function parseEnvironmentKind(rawEnvName: string | undefined): EnvironmentKind {
  const normalized = rawEnvName?.trim().toLowerCase();
  if (normalized === 'stage' || normalized === 'prod') {
    return normalized;
  }

  return 'dev';
}

export function isDailyActionPolicyCommand(value: string): value is DailyActionPolicyCommand {
  return (dailyActionPolicyCommands as readonly string[]).includes(value);
}

export function isRestoreSnapshotDryRun(args: readonly string[]): boolean {
  return args[0] === '--dry-run';
}

function denyMessage(kind: PolicyDenyKind, command: DailyActionPolicyCommand, env: EnvironmentKind): string {
  if (kind === 'destructive') {
    return `Refusing destructive command '${command}' in WPMOO_ENV=${env}. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.`;
  }
  if (kind === 'stage-lifecycle') {
    return `Refusing stage lifecycle command '${command}' in WPMOO_ENV=stage. Set WPMOO_ALLOW_STAGE_LIFECYCLE=1 to run it intentionally.`;
  }
  return `Refusing production lifecycle command '${command}' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally.`;
}

export function renderPolicyDenyMessage(deny: PolicyDeny): string {
  return denyMessage(deny.kind, deny.command, deny.env);
}

export function evaluateDailyActionPolicy(
  command: DailyActionPolicyCommand,
  args: readonly string[],
  flags: EnvironmentPolicyFlags,
): PolicyDecision {
  const env = parseEnvironmentKind(flags.envName);
  const policy = dailyActionPolicyTable[command];

  const isDestructive = policy.isDestructive(args);
  const isDryRunPreview = command === 'restore-snapshot' && isRestoreSnapshotDryRun(args);
  const isAuditWorthy = policy.isAuditWorthy(args);

  if (policy.requiresStageLifecycleApproval && env === 'stage' && !parseFlag(flags.allowStageLifecycle)) {
    const deny: PolicyDeny = {
      kind: 'stage-lifecycle',
      command,
      env,
      requiredFlag: 'WPMOO_ALLOW_STAGE_LIFECYCLE',
      requiredValue: '1',
    };

    return {
      allowed: false,
      command,
      env,
      isDestructive,
      isDryRunPreview,
      isAuditWorthy,
      deny,
      message: renderPolicyDenyMessage(deny),
    };
  }

  if (policy.requiresProdLifecycleApproval && env === 'prod' && !parseFlag(flags.allowProdLifecycle)) {
    const deny: PolicyDeny = {
      kind: 'prod-lifecycle',
      command,
      env,
      requiredFlag: 'WPMOO_ALLOW_PROD_LIFECYCLE',
      requiredValue: '1',
    };

    return {
      allowed: false,
      command,
      env,
      isDestructive,
      isDryRunPreview,
      isAuditWorthy,
      deny,
      message: renderPolicyDenyMessage(deny),
    };
  }

  if (isDestructive && (env === 'stage' || env === 'prod') && !parseFlag(flags.allowDestructive)) {
    const deny: PolicyDeny = {
      kind: 'destructive',
      command,
      env,
      requiredFlag: 'WPMOO_ALLOW_DESTRUCTIVE',
      requiredValue: '1',
    };

    return {
      allowed: false,
      command,
      env,
      isDestructive,
      isDryRunPreview,
      isAuditWorthy,
      deny,
      message: renderPolicyDenyMessage(deny),
    };
  }

  return {
    allowed: true,
    command,
    env,
    isDestructive,
    isDryRunPreview,
    isAuditWorthy,
  };
}
