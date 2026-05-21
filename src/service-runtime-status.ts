import { execFile } from 'node:child_process';

import type { EnvironmentStatus } from './status.js';

export type ServiceRuntimeStatus =
  | { kind: 'running' }
  | { kind: 'services-running' }
  | { kind: 'db-ready' }
  | { kind: 'odoo-not-ready' }
  | { kind: 'fully-ready' }
  | { kind: 'stopped' }
  | { kind: 'docker-not-running' };

export type ServiceRuntimeRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string }>;

const odooHttpReadyUrl = 'http://127.0.0.1:8069';
const odooHttpProbeTimeoutMs = 1_000;

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

async function fetchOdooHttpReady(): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), odooHttpProbeTimeoutMs);
  try {
    return await fetch(odooHttpReadyUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function renderServiceRuntimeStatusLine(status: ServiceRuntimeStatus): string {
  if (
    status.kind === 'running' ||
    status.kind === 'services-running' ||
    status.kind === 'odoo-not-ready' ||
    status.kind === 'fully-ready' ||
    status.kind === 'db-ready'
  ) {
    if (status.kind === 'db-ready') {
      return 'Status: ● DB ready';
    }
    if (status.kind === 'odoo-not-ready') {
      return 'Status: ● Odoo not ready';
    }
    if (status.kind === 'fully-ready') {
      return 'Status: ● Fully ready';
    }
    return 'Status: ● Services running';
  }

  if (status.kind === 'docker-not-running') {
    return 'Status: ● Docker not running';
  }
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
  if (!result.stdout.trim()) {
    return { kind: 'stopped' };
  }

  const runningServices = result.stdout
    .trim()
    .split('\n')
    .map((service) => service.trim())
    .filter(Boolean);

  if (!runningServices.includes('db')) {
    return { kind: 'services-running' };
  }

  const dbProbeArgs = [
    'compose',
    ...environmentStatus.composeFiles.flatMap((file) => ['-f', file]),
    'exec',
    '-T',
    'db',
    'pg_isready',
    '-U',
    'odoo',
    '-d',
    'postgres',
  ];
  try {
    await runner('docker', dbProbeArgs, { cwd: target });
  } catch {
    return { kind: 'services-running' };
  }

  try {
    const response = await fetchOdooHttpReady();
    return response.ok ? { kind: 'fully-ready' } : { kind: 'odoo-not-ready' };
  } catch {
    return { kind: 'db-ready' };
  }
}
