import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { doctorOptionsFromArgs } from '../src/cli-routes/doctor.js';
import { resetCommandOptionsFromArgs } from '../src/cli-routes/reset.js';
import {
  renderedSourceRepoPath,
  removeRepoOptionsFromArgs,
  sourceListOptionsFromArgs,
  sourceSyncOptionsFromArgs,
  sourceUsage,
} from '../src/cli-routes/source.js';

describe('cli route boundary helpers', () => {
  it('keeps source command usage and option parsing outside the main cli router', () => {
    const target = resolve('/tmp/wpmoo-source-route-boundary');

    expect(sourceUsage()).toBe('Usage: wpmoo source <list|sync|add|remove> [options]');
    expect(sourceListOptionsFromArgs(['--target', target, '--json'])).toEqual({
      target,
      json: true,
    });
    expect(sourceSyncOptionsFromArgs(['--target', target, '--stage=false', '--json'])).toEqual({
      target,
      stage: false,
      json: true,
    });
    expect(removeRepoOptionsFromArgs(['--repo', 'server-tools', '--source-type', 'oca', '--target', target])).toEqual({
      target,
      repoPath: 'server-tools',
      sourceType: 'oca',
      stage: true,
    });
    expect(renderedSourceRepoPath(target, 'external', 'vendor-addons')).toBe(
      `${target}/odoo/custom/src/external/vendor-addons`,
    );
  });

  it('keeps doctor and reset command option parsing outside the main cli router', () => {
    const target = resolve('/tmp/wpmoo-maintenance-route-boundary');

    expect(doctorOptionsFromArgs(['--json', '--postgres', '--fix=false'])).toEqual({
      json: true,
      postgres: true,
      fix: false,
    });
    expect(() => doctorOptionsFromArgs(['--target', target])).toThrow('Usage: wpmoo doctor');
    expect(resetCommandOptionsFromArgs(['--target', target, '--stage=false', '--dry-run'])).toEqual({
      target,
      stage: false,
      dryRun: true,
    });
  });
});
