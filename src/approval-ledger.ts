import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DailyActionPolicyCommand, EnvironmentKind } from './environment-policy.js';

export type ApprovalScope =
  | 'destructive'
  | 'stage-lifecycle'
  | 'prod-lifecycle'
  | 'no-recent-snapshot'
  | 'migration-risk';

export type ActiveApproval = {
  scope: ApprovalScope;
  environment: EnvironmentKind;
  command?: DailyActionPolicyCommand;
  expiresAt: string;
  reason?: string;
  label: string;
};

export type ReadActiveApprovalsOptions = {
  command: DailyActionPolicyCommand;
  environment: EnvironmentKind;
  now?: Date;
};

const approvalScopes: readonly ApprovalScope[] = [
  'destructive',
  'stage-lifecycle',
  'prod-lifecycle',
  'no-recent-snapshot',
  'migration-risk',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApprovalScope(value: unknown): value is ApprovalScope {
  return typeof value === 'string' && (approvalScopes as readonly string[]).includes(value);
}

function isEnvironmentKind(value: unknown): value is EnvironmentKind {
  return value === 'stage' || value === 'prod';
}

function isFutureIsoDate(value: unknown, now: Date): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function activeApprovalFromLine(
  line: string,
  options: Required<ReadActiveApprovalsOptions>,
): ActiveApproval | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  if (!isApprovalScope(parsed.scope) || !isEnvironmentKind(parsed.environment)) {
    return undefined;
  }
  if (parsed.environment !== options.environment) {
    return undefined;
  }

  const command = typeof parsed.command === 'string' ? parsed.command : undefined;
  if (command && command !== options.command) {
    return undefined;
  }
  if (!isFutureIsoDate(parsed.expiresAt, options.now)) {
    return undefined;
  }

  return {
    scope: parsed.scope,
    environment: parsed.environment,
    ...(command ? { command: command as DailyActionPolicyCommand } : {}),
    expiresAt: parsed.expiresAt,
    ...(typeof parsed.reason === 'string' && parsed.reason.trim() ? { reason: parsed.reason.trim() } : {}),
    label: `approval:${parsed.scope}`,
  };
}

export async function readActiveApprovals(
  target: string,
  options: ReadActiveApprovalsOptions,
): Promise<ActiveApproval[]> {
  let content: string;
  try {
    content = await readFile(join(target, '.wpmoo/approvals.jsonl'), 'utf8');
  } catch {
    return [];
  }

  const resolvedOptions = { ...options, now: options.now ?? new Date() };
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => activeApprovalFromLine(line, resolvedOptions))
    .filter((approval): approval is ActiveApproval => Boolean(approval));
}
