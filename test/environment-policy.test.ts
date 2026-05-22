import { describe, expect, it } from 'vitest';

import {
  dailyActionPolicyTable,
  evaluateDailyActionPolicy,
  isDailyActionPolicyCommand,
  parseEnvironmentKind,
} from '../src/environment-policy.js';

describe('environment policy environment parsing', () => {
  it('parses missing and unknown values to dev', () => {
    expect(parseEnvironmentKind(undefined)).toBe('dev');
    expect(parseEnvironmentKind('')).toBe('dev');
    expect(parseEnvironmentKind('  \t')).toBe('dev');
    expect(parseEnvironmentKind('local')).toBe('dev');
  });

  it('parses case-insensitive stage/prod values', () => {
    expect(parseEnvironmentKind('STAGE')).toBe('stage');
    expect(parseEnvironmentKind('Prod')).toBe('prod');
    expect(parseEnvironmentKind('dev')).toBe('dev');
  });
});

describe('environment policy command table', () => {
  it('marks daily actions with destructive and lifecycle policy expectations', () => {
    expect(dailyActionPolicyTable.resetdb).toMatchObject({
      isDestructive: expect.any(Function),
      isDryRunAllowed: false,
      requiresStageLifecycleApproval: false,
      requiresProdLifecycleApproval: false,
      isAuditWorthy: expect.any(Function),
    });

    expect(dailyActionPolicyTable['restore-snapshot']).toMatchObject({
      isDryRunAllowed: true,
      requiresStageLifecycleApproval: false,
      requiresProdLifecycleApproval: false,
    });

    expect(dailyActionPolicyTable.install).toMatchObject({
      requiresStageLifecycleApproval: true,
      requiresProdLifecycleApproval: true,
    });

    expect(dailyActionPolicyTable.test).toMatchObject({
      requiresStageLifecycleApproval: false,
      requiresProdLifecycleApproval: true,
    });

    expect(dailyActionPolicyTable.start).toMatchObject({
      requiresStageLifecycleApproval: false,
      requiresProdLifecycleApproval: false,
    });
    expect(dailyActionPolicyTable.stop).toMatchObject({
      requiresStageLifecycleApproval: true,
      requiresProdLifecycleApproval: true,
    });
    expect(dailyActionPolicyTable.restart).toMatchObject({
      requiresStageLifecycleApproval: true,
      requiresProdLifecycleApproval: true,
    });
  });

  it('recognizes known command strings', () => {
    expect(isDailyActionPolicyCommand('test')).toBe(true);
    expect(isDailyActionPolicyCommand('doctor')).toBe(false);
  });
});

describe('environment policy decisions for stage and prod safety', () => {
  it('requires destructive approval for resetdb in stage/prod', () => {
    expect(
      evaluateDailyActionPolicy('resetdb', ['devel'], {
        envName: 'stage',
      }),
    ).toMatchObject({
      allowed: false,
      deny: {
        kind: 'destructive',
        requiredFlag: 'WPMOO_ALLOW_DESTRUCTIVE',
      },
      message:
        "Refusing destructive command 'resetdb' in WPMOO_ENV=stage. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.",
    });

    expect(
      evaluateDailyActionPolicy('resetdb', ['devel'], {
        envName: 'prod',
      }),
    ).toMatchObject({
      allowed: false,
      deny: {
        kind: 'destructive',
        requiredFlag: 'WPMOO_ALLOW_DESTRUCTIVE',
      },
      message:
        "Refusing destructive command 'resetdb' in WPMOO_ENV=prod. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.",
    });

    expect(
      evaluateDailyActionPolicy('resetdb', ['devel'], {
        envName: 'stage',
        allowDestructive: '1',
      }),
    ).toMatchObject({
      allowed: true,
      isDestructive: true,
      isAuditWorthy: true,
      isDryRunPreview: false,
    });
  });

  it('allows restore-snapshot dry-run in stage/prod without destructive approval', () => {
    expect(
      evaluateDailyActionPolicy('restore-snapshot', ['--dry-run', 'before-update', 'devel'], {
        envName: 'stage',
      }),
    ).toMatchObject({
      allowed: true,
      isDestructive: false,
      isAuditWorthy: false,
      isDryRunPreview: true,
    });

    expect(
      evaluateDailyActionPolicy('restore-snapshot', ['--dry-run', 'before-update'], {
        envName: 'prod',
      }),
    ).toMatchObject({
      allowed: true,
      isDestructive: false,
      isAuditWorthy: false,
      isDryRunPreview: true,
    });

    expect(
      evaluateDailyActionPolicy('restore-snapshot', ['before-update', 'devel'], {
        envName: 'prod',
      }),
    ).toMatchObject({
      allowed: false,
      isDestructive: true,
      isAuditWorthy: true,
      deny: {
        kind: 'destructive',
        requiredFlag: 'WPMOO_ALLOW_DESTRUCTIVE',
      },
    });
  });

  it('requires stage lifecycle approvals for install and update', () => {
    expect(
      evaluateDailyActionPolicy('install', ['sale'], {
        envName: 'stage',
      }),
    ).toMatchObject({
      allowed: false,
      isDestructive: false,
      isAuditWorthy: true,
      deny: {
        kind: 'stage-lifecycle',
        requiredFlag: 'WPMOO_ALLOW_STAGE_LIFECYCLE',
      },
    });

    expect(
      evaluateDailyActionPolicy('update', ['sale', 'devel'], {
        envName: 'stage',
      }),
    ).toMatchObject({
      allowed: false,
      deny: {
        kind: 'stage-lifecycle',
        requiredFlag: 'WPMOO_ALLOW_STAGE_LIFECYCLE',
      },
    });

    expect(
      evaluateDailyActionPolicy('install', ['sale'], {
        envName: 'stage',
        allowStageLifecycle: '1',
      }),
    ).toMatchObject({
      allowed: true,
      isDestructive: false,
      isAuditWorthy: true,
      isDryRunPreview: false,
    });
  });

  it('requires prod lifecycle approvals for install, update, and test', () => {
    expect(
      evaluateDailyActionPolicy('install', ['sale'], {
        envName: 'prod',
      }),
    ).toMatchObject({
      allowed: false,
      deny: {
        kind: 'prod-lifecycle',
        requiredFlag: 'WPMOO_ALLOW_PROD_LIFECYCLE',
      },
    });

    expect(
      evaluateDailyActionPolicy('update', ['sale'], {
        envName: 'prod',
      }),
    ).toMatchObject({
      allowed: false,
      deny: {
        kind: 'prod-lifecycle',
        requiredFlag: 'WPMOO_ALLOW_PROD_LIFECYCLE',
      },
    });

    expect(
      evaluateDailyActionPolicy('test', ['sale'], {
        envName: 'prod',
      }),
    ).toMatchObject({
      allowed: false,
      deny: {
        kind: 'prod-lifecycle',
        requiredFlag: 'WPMOO_ALLOW_PROD_LIFECYCLE',
      },
    });

    expect(
      evaluateDailyActionPolicy('test', ['sale'], {
        envName: 'stage',
      }),
    ).toMatchObject({
      allowed: true,
      isDestructive: false,
      isAuditWorthy: true,
      isDryRunPreview: false,
    });

    expect(
      evaluateDailyActionPolicy('update', ['sale'], {
        envName: 'prod',
        allowProdLifecycle: '1',
      }),
    ).toMatchObject({
      allowed: true,
      isDestructive: false,
      isAuditWorthy: true,
    });
  });

  it('requires lifecycle approval for stop and restart in stage/prod while leaving start simple', () => {
    for (const command of ['stop', 'restart'] as const) {
      expect(
        evaluateDailyActionPolicy(command, [], {
          envName: 'stage',
        }),
      ).toMatchObject({
        allowed: false,
        isDestructive: false,
        isAuditWorthy: true,
        deny: {
          kind: 'stage-lifecycle',
          requiredFlag: 'WPMOO_ALLOW_STAGE_LIFECYCLE',
        },
      });

      expect(
        evaluateDailyActionPolicy(command, [], {
          envName: 'prod',
        }),
      ).toMatchObject({
        allowed: false,
        isDestructive: false,
        isAuditWorthy: true,
        deny: {
          kind: 'prod-lifecycle',
          requiredFlag: 'WPMOO_ALLOW_PROD_LIFECYCLE',
        },
      });

      expect(
        evaluateDailyActionPolicy(command, [], {
          envName: 'dev',
        }),
      ).toMatchObject({
        allowed: true,
        isDestructive: false,
        isAuditWorthy: true,
      });
    }

    expect(
      evaluateDailyActionPolicy('start', [], {
        envName: 'prod',
      }),
    ).toMatchObject({
      allowed: true,
      isDestructive: false,
      isAuditWorthy: false,
    });
  });

  it('does not require lifecycle or destructive approvals for snapshot and helpers in stage/prod', () => {
    const common = ['snapshot', 'lint', 'pot', 'psql', 'logs', 'start', 'shell'] as const;

    for (const command of common) {
      const decision = evaluateDailyActionPolicy(command, ['odoo'], {
        envName: 'stage',
        allowStageLifecycle: '0',
        allowProdLifecycle: '0',
        allowDestructive: '0',
      });
      expect(decision).toMatchObject({
        allowed: true,
        isDestructive: false,
        isDryRunPreview: false,
        isAuditWorthy: false,
      });
      
      const prodDecision = evaluateDailyActionPolicy(command, ['odoo'], {
        envName: 'prod',
        allowStageLifecycle: '0',
        allowProdLifecycle: '0',
        allowDestructive: '0',
      });
      expect(prodDecision).toMatchObject({
        allowed: true,
        isDestructive: false,
        isDryRunPreview: false,
        isAuditWorthy: false,
      });
    }
  });
});
