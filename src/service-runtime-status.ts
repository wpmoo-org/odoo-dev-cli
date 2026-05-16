import { execFile } from 'node:child_process';

import type { EnvironmentStatus } from './status.js';

export type ServiceRuntimeStatus =
  | { kind: 'running' }
  | { kind: 'stopped' }
  | { kind: 'docker-not-running' };

export type ServiceRuntimeRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string }>;

function run(command: string, args: string[], options: { cwd: string }): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: options.cwd }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout });
    });
  });
}

export function renderServiceRuntimeStatusLine(status: ServiceRuntimeStatus): string {
  if (status.kind === 'running') return 'Status: ● Services running';
  if (status.kind === 'docker-not-running') return 'Status: ● Docker not running';
  return 'Status: ● Services stopped';
}

export async function getServiceRuntimeStatus(
  target: string,
  environmentStatus: EnvironmentStatus,
  runner: ServiceRuntimeRunner = run,
): Promise<ServiceRuntimeStatus> {
  try {
    await runner('docker', ['info', '--format', '{{.ServerVersion}}'], { cwd: target });
  } catch {
    return { kind: 'docker-not-running' };
  }

  if (
    environmentStatus.kind !== 'environment' ||
    environmentStatus.composeFiles.length === 0 ||
    environmentStatus.composeErrors.length > 0
  ) {
    return { kind: 'stopped' };
  }

  const args = [
    'compose',
    ...environmentStatus.composeFiles.flatMap((file) => ['-f', file]),
    'ps',
    '--services',
    '--filter',
    'status=running',
  ];
  let result: { stdout: string };
  try {
    result = await runner('docker', args, { cwd: target });
  } catch {
    return { kind: 'stopped' };
  }
  return result.stdout.trim() ? { kind: 'running' } : { kind: 'stopped' };
}
