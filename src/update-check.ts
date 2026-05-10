import { spawn } from 'node:child_process';

import { execa } from 'execa';

export type UpdateCheckResult =
  | { status: 'current'; currentVersion: string; latestVersion: string }
  | { status: 'update-available'; currentVersion: string; latestVersion: string; tarball: string }
  | { status: 'unavailable'; currentVersion: string };

export type NpmRunner = {
  run(args: string[]): Promise<{ stdout: string; stderr: string }>;
};

export type UpdateCheckEnvironment = Partial<Record<string, string | undefined>>;

type NpmPackageInfo = {
  version: string;
  tarball: string;
};

export const realNpm: NpmRunner = {
  async run(args) {
    const result = await execa('npm', args, args[0] === 'view' ? { timeout: 5000 } : {});
    return { stdout: result.stdout, stderr: result.stderr };
  },
};

function truthyEnv(value: string | undefined): boolean {
  return value !== undefined && ['1', 'true', 'yes', 'y'].includes(value.toLowerCase().trim());
}

export function isUpdateCheckSkipped(argv: string[], env: UpdateCheckEnvironment = process.env): boolean {
  if (argv.includes('--no-update-check')) return true;
  if (truthyEnv(env.WPMOO_SKIP_UPDATE_CHECK)) return true;
  return false;
}

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

function parseNpmPackageInfo(stdout: string): NpmPackageInfo {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('npm did not return package metadata');
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const version = typeof record.version === 'string' ? record.version.trim() : '';
      const dist = record.dist;
      const nestedTarball =
        typeof dist === 'object' && dist !== null && typeof (dist as Record<string, unknown>).tarball === 'string'
          ? String((dist as Record<string, unknown>).tarball).trim()
          : '';
      const dottedTarball = typeof record['dist.tarball'] === 'string' ? record['dist.tarball'].trim() : '';
      const tarball = nestedTarball || dottedTarball;

      if (version && tarball) {
        return { version, tarball };
      }
    }
  } catch {
    // Fall through to the validation error below.
  }

  throw new Error('npm did not return a package version and tarball');
}

async function viewPackageInfo(packageSpecValue: string, runner: NpmRunner): Promise<NpmPackageInfo> {
  const result = await runner.run(['view', packageSpecValue, 'version', 'dist.tarball', '--json']);
  return parseNpmPackageInfo(result.stdout);
}

export async function checkForUpdate(
  packageName: string,
  currentVersion: string,
  runner: NpmRunner = realNpm,
): Promise<UpdateCheckResult> {
  try {
    const latest = await viewPackageInfo(packageSpec(packageName, 'latest'), runner);

    if (compareVersions(currentVersion, latest.version) < 0) {
      const exact = await viewPackageInfo(packageSpec(packageName, latest.version), runner);
      if (exact.version !== latest.version || !exact.tarball) {
        throw new Error(`npm metadata for ${packageSpec(packageName, latest.version)} did not validate`);
      }

      return { status: 'update-available', currentVersion, latestVersion: exact.version, tarball: exact.tarball };
    }

    return { status: 'current', currentVersion, latestVersion: latest.version };
  } catch {
    return { status: 'unavailable', currentVersion };
  }
}

export function packageSpec(packageName: string, version: string): string {
  return `${packageName}@${version}`;
}

export async function installLatestPackage(
  packageName: string,
  version: string,
  runner: NpmRunner = realNpm,
): Promise<void> {
  await runner.run(['install', '-g', packageSpec(packageName, version)]);
}

export function restartArgs(packageName: string, version: string, argv: string[]): string[] {
  return ['exec', '--yes', '--package', packageSpec(packageName, version), '--', 'wpmoo', ...argv];
}

export function restartEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...env, WPMOO_SKIP_UPDATE_CHECK: '1' };
}

export async function restartCli(packageName: string, version: string, argv: string[]): Promise<number | null> {
  const child = spawn('npm', restartArgs(packageName, version, argv), {
    env: restartEnvironment(),
    stdio: 'inherit',
  });

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
}
