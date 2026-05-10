import { describe, expect, it } from 'vitest';

import {
  checkForUpdate,
  compareVersions,
  packageSpec,
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
  });

  it('detects an available npm update', async () => {
    const runner = npmRunner('"0.5.0"\n');

    await expect(checkForUpdate('@wpmoo/odoo-dev', '0.4.1', runner)).resolves.toEqual({
      status: 'update-available',
      currentVersion: '0.4.1',
      latestVersion: '0.5.0',
    });
    expect(runner.calls).toEqual([['view', '@wpmoo/odoo-dev', 'version', '--json']]);
  });

  it('continues quietly when the npm registry cannot be checked', async () => {
    await expect(checkForUpdate('@wpmoo/odoo-dev', '0.4.1', npmRunner('', true))).resolves.toEqual({
      status: 'unavailable',
      currentVersion: '0.4.1',
    });
  });

  it('builds a latest package spec and restart args', () => {
    expect(packageSpec('@wpmoo/odoo-dev')).toBe('@wpmoo/odoo-dev@latest');
    expect(restartArgs('@wpmoo/odoo-dev', ['--foo'])).toEqual([
      'exec',
      '--yes',
      '--package',
      '@wpmoo/odoo-dev@latest',
      '--',
      'wpmoo',
      '--foo',
    ]);
  });
});
