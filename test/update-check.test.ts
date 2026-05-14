import { describe, expect, it } from 'vitest';

import {
  checkForUpdate,
  compareVersions,
  installLatestPackage,
  isUpdateCheckSkipped,
  packageSpec,
  restartEnvironment,
  restartArgs,
  type NpmRunner,
} from '../src/update-check.js';

function npmRunner(stdout: string, shouldFail = false): NpmRunner & { calls: string[][] } {
  const calls: string[][] = [];

  return {
    calls,
    async run(args) {
      calls.push(args);
      if (shouldFail) {
        throw new Error('registry unavailable');
      }
      return { stdout, stderr: '' };
    },
  };
}

describe('update check', () => {
  it('compares semantic versions numerically', () => {
    expect(compareVersions('0.4.9', '0.4.10')).toBeLessThan(0);
    expect(compareVersions('0.5.0', '0.4.10')).toBeGreaterThan(0);
    expect(compareVersions('0.4.1', '0.4.1')).toBe(0);
    expect(compareVersions('v1.2.3-beta.1', '1.2.3')).toBe(0);
  });

  it('detects an available npm update', async () => {
    const runner = npmRunner('{"version":"0.5.0","dist":{"tarball":"https://registry.npmjs.org/@wpmoo/odoo/-/odoo-0.5.0.tgz"}}\n');

    await expect(checkForUpdate('@wpmoo/odoo', '0.4.1', runner)).resolves.toEqual({
      status: 'update-available',
      currentVersion: '0.4.1',
      latestVersion: '0.5.0',
      tarball: 'https://registry.npmjs.org/@wpmoo/odoo/-/odoo-0.5.0.tgz',
    });
    expect(runner.calls).toEqual([
      ['view', '@wpmoo/odoo@latest', 'version', 'dist.tarball', '--json'],
      ['view', '@wpmoo/odoo@0.5.0', 'version', 'dist.tarball', '--json'],
    ]);
  });

  it('continues quietly when the npm registry cannot be checked', async () => {
    await expect(checkForUpdate('@wpmoo/odoo', '0.4.1', npmRunner('', true))).resolves.toEqual({
      status: 'unavailable',
      currentVersion: '0.4.1',
    });
  });

  it('treats dotted tarball metadata as valid and current when versions match', async () => {
    const runner = npmRunner(
      '{"version":"0.5.0","dist.tarball":"https://registry.npmjs.org/@wpmoo/odoo/-/odoo-0.5.0.tgz"}\n',
    );

    await expect(checkForUpdate('@wpmoo/odoo', '0.5.0', runner)).resolves.toEqual({
      status: 'current',
      currentVersion: '0.5.0',
      latestVersion: '0.5.0',
    });
    expect(runner.calls).toEqual([['view', '@wpmoo/odoo@latest', 'version', 'dist.tarball', '--json']]);
  });

  it('treats empty npm metadata output as unavailable', async () => {
    await expect(checkForUpdate('@wpmoo/odoo', '0.4.1', npmRunner('\n'))).resolves.toEqual({
      status: 'unavailable',
      currentVersion: '0.4.1',
    });
  });

  it('ignores update candidates without a validated exact tarball', async () => {
    const calls: string[][] = [];
    const runner: NpmRunner = {
      async run(args) {
        calls.push(args);
        if (args[0] === 'view' && args[1] === '@wpmoo/odoo@latest') {
          return {
            stdout:
              '{"version":"0.5.0","dist":{"tarball":"https://registry.npmjs.org/@wpmoo/odoo/-/odoo-0.5.0.tgz"}}',
            stderr: '',
          };
        }
        return { stdout: '{"version":"0.5.0"}', stderr: '' };
      },
    };

    await expect(checkForUpdate('@wpmoo/odoo', '0.4.1', runner)).resolves.toEqual({
      status: 'unavailable',
      currentVersion: '0.4.1',
    });
    expect(calls).toEqual([
      ['view', '@wpmoo/odoo@latest', 'version', 'dist.tarball', '--json'],
      ['view', '@wpmoo/odoo@0.5.0', 'version', 'dist.tarball', '--json'],
    ]);
  });

  it('treats malformed npm metadata as unavailable', async () => {
    await expect(checkForUpdate('@wpmoo/odoo', '0.4.1', npmRunner('{not-json'))).resolves.toEqual({
      status: 'unavailable',
      currentVersion: '0.4.1',
    });
  });

  it('treats latest metadata without version or tarball as unavailable', async () => {
    await expect(checkForUpdate('@wpmoo/odoo', '0.4.1', npmRunner('{"dist":{}}\n'))).resolves.toEqual({
      status: 'unavailable',
      currentVersion: '0.4.1',
    });
  });

  it('ignores update candidates when exact-version metadata does not match latest', async () => {
    const calls: string[][] = [];
    const runner: NpmRunner = {
      async run(args) {
        calls.push(args);
        if (args[1] === '@wpmoo/odoo@latest') {
          return {
            stdout:
              '{"version":"0.5.0","dist":{"tarball":"https://registry.npmjs.org/@wpmoo/odoo/-/odoo-0.5.0.tgz"}}',
            stderr: '',
          };
        }
        return {
          stdout:
            '{"version":"0.5.1","dist":{"tarball":"https://registry.npmjs.org/@wpmoo/odoo/-/odoo-0.5.1.tgz"}}',
          stderr: '',
        };
      },
    };

    await expect(checkForUpdate('@wpmoo/odoo', '0.4.1', runner)).resolves.toEqual({
      status: 'unavailable',
      currentVersion: '0.4.1',
    });
    expect(calls).toEqual([
      ['view', '@wpmoo/odoo@latest', 'version', 'dist.tarball', '--json'],
      ['view', '@wpmoo/odoo@0.5.0', 'version', 'dist.tarball', '--json'],
    ]);
  });

  it('builds an exact package spec and restart args', () => {
    expect(packageSpec('@wpmoo/odoo', '0.5.0')).toBe('@wpmoo/odoo@0.5.0');
    expect(restartArgs('@wpmoo/odoo', '0.5.0', ['--foo'])).toEqual([
      'exec',
      '--yes',
      '--package',
      '@wpmoo/odoo@0.5.0',
      '--',
      'wpmoo',
      '--foo',
    ]);
  });

  it('installs a specific package version globally', async () => {
    const runner = npmRunner('');

    await installLatestPackage('@wpmoo/odoo', '0.8.44', runner);

    expect(runner.calls).toEqual([['install', '-g', '@wpmoo/odoo@0.8.44']]);
  });

  it('skips update checks only for explicit opt outs and updater restarts', () => {
    expect(isUpdateCheckSkipped(['--no-update-check'], {})).toBe(true);
    expect(isUpdateCheckSkipped([], { WPMOO_SKIP_UPDATE_CHECK: '1' })).toBe(true);
    expect(isUpdateCheckSkipped([], { WPMOO_SKIP_UPDATE_CHECK: ' true ' })).toBe(true);
    expect(isUpdateCheckSkipped([], { WPMOO_SKIP_UPDATE_CHECK: 'YeS' })).toBe(true);
    expect(isUpdateCheckSkipped([], { WPMOO_SKIP_UPDATE_CHECK: 'y' })).toBe(true);
    expect(isUpdateCheckSkipped([], { npm_command: 'exec' })).toBe(false);
    expect(isUpdateCheckSkipped([], { npm_execpath: '/usr/local/bin/npx' })).toBe(false);
    expect(isUpdateCheckSkipped([], { npm_command: 'run-script' })).toBe(false);
  });

  it('marks auto-restarted processes to skip the nested update check', () => {
    expect(restartEnvironment({ PATH: '/usr/bin' })).toEqual({
      PATH: '/usr/bin',
      WPMOO_SKIP_UPDATE_CHECK: '1',
    });
  });
});
