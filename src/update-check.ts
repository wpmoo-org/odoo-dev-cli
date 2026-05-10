import { spawn } from 'node:child_process';

import { execa } from 'execa';

export type UpdateCheckResult =
  | { status: 'current'; currentVersion: string; latestVersion: string }
  | { status: 'update-available'; currentVersion: string; latestVersion: string }
  | { status: 'unavailable'; currentVersion: string };

export type NpmRunner = {
  run(args: string[]): Promise<{ stdout: string; stderr: string }>;
};

export const realNpm: NpmRunner = {
  async run(args) {
    const result = await execa('npm', args, args[0] === 'view' ? { timeout: 5000 } : {});
    return { stdout: result.stdout, stderr: result.stderr };
  },
};

function numericParts(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('-', 1)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(currentVersion: string, latestVersion: string): number {
  const current = numericParts(currentVersion);
  const latest = numericParts(latestVersion);
  const length = Math.max(current.length, latest.length);

  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] ?? 0;
    const latestPart = latest[index] ?? 0;
    if (currentPart !== latestPart) {
      return currentPart - latestPart;
    }
  }

  return 0;
}

function parseNpmVersion(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('npm did not return a package version');
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string' && parsed.trim()) {
      return parsed.trim();
    }
  } catch {
    // npm view without --json can return a plain version string.
  }

  return trimmed.replace(/^"|"$/g, '');
}

export async function checkForUpdate(
  packageName: string,
  currentVersion: string,
  runner: NpmRunner = realNpm,
): Promise<UpdateCheckResult> {
  try {
    const result = await runner.run(['view', packageName, 'version', '--json']);
    const latestVersion = parseNpmVersion(result.stdout);

    if (compareVersions(currentVersion, latestVersion) < 0) {
      return { status: 'update-available', currentVersion, latestVersion };
    }

    return { status: 'current', currentVersion, latestVersion };
  } catch {
    return { status: 'unavailable', currentVersion };
  }
}

export function packageSpec(packageName: string): string {
  return `${packageName}@latest`;
}

export async function installLatestPackage(packageName: string, runner: NpmRunner = realNpm): Promise<void> {
  await runner.run(['install', '-g', packageSpec(packageName)]);
}

export function restartArgs(packageName: string, argv: string[]): string[] {
  return ['exec', '--yes', '--package', packageSpec(packageName), '--', 'wpmoo', ...argv];
}

export async function restartCli(packageName: string, argv: string[]): Promise<number | null> {
  const child = spawn('npm', restartArgs(packageName, argv), { stdio: 'inherit' });

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
}
