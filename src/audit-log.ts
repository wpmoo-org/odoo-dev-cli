import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const secretFlagNames = new Set([
  'password',
  'api-key',
  'token',
  'secret',
  'api_key',
]);

type AuditLogEntry = {
  timestamp: string;
  command: string;
  environment: string;
  dryRun: boolean;
  approvedFlags: string[];
  args: string[];
};

export type AppendAuditLogOptions = {
  environmentPath: string;
  command: string;
  environment: string;
  dryRun: boolean;
  args: readonly string[];
  approvedFlagNames: readonly string[];
  approvedFlags?: readonly string[];
  timestamp?: Date;
};

function isSecretFlagToken(token: string): string | undefined {
  return token === '--password'
    ? '--password'
    : token === '--api-key'
      ? '--api-key'
      : token === '--token'
        ? '--token'
        : token === '--secret'
          ? '--secret'
          : undefined;
}

function isSecretKVToken(token: string): string | undefined {
  const firstEquals = token.indexOf('=');
  if (firstEquals < 0) {
    return undefined;
  }

  const [name] = [token.slice(0, firstEquals), token.slice(firstEquals + 1)] as const;
  return secretFlagNames.has(name.replace(/^--+/, '').toLowerCase()) ? name : undefined;
}

function normalizeFlag(flag: string): string {
  return flag.startsWith('--') ? flag : `--${flag}`;
}

/**
 * Redacts values for common secret-like arguments.
 */
export function sanitizeCommandArgs(args: readonly string[]): string[] {
  const sanitized: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    const secretKV = isSecretKVToken(arg);
    if (secretKV) {
      sanitized.push(`${secretKV}=***`);
      continue;
    }

    const secretFlag = isSecretFlagToken(arg);
    if (secretFlag && index + 1 < args.length && !args[index + 1].startsWith('--')) {
      sanitized.push(arg);
      sanitized.push('***');
      index += 1;
      continue;
    }

    sanitized.push(arg);
  }

  return sanitized;
}

export function extractApprovedFlags(
  args: readonly string[],
  approvedFlagNames: readonly string[],
): string[] {
  const present: string[] = [];
  const argsByIndex = args.map((arg) => arg.toLowerCase());

  approvedFlagNames.forEach((name) => {
    const normalized = normalizeFlag(name).toLowerCase();
    if (argsByIndex.some((arg) => arg === normalized || arg.startsWith(`${normalized}=`))) {
      present.push(name);
    }
  });

  return present;
}

export async function appendAuditLog(options: AppendAuditLogOptions): Promise<void> {
  const logPath = join(options.environmentPath, '.wpmoo', 'audit.log');
  const event: AuditLogEntry = {
    timestamp: (options.timestamp ?? new Date()).toISOString(),
    command: options.command,
    environment: options.environment,
    dryRun: options.dryRun,
    approvedFlags: [...(options.approvedFlags ?? extractApprovedFlags(options.args, options.approvedFlagNames))],
    args: sanitizeCommandArgs(options.args),
  };

  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
}
