import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as dailyActions from '../src/daily-actions.js';
import { markerPath } from '../src/environment.js';

type SafetyPreview = Record<string, unknown>;
type DailyActionSafetyPreview = (command: string, argv: string[], cwd?: string) => Promise<SafetyPreview>;

async function makeEnvironment(options: { scripts?: string[]; env?: string } = {}): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), 'wpmoo-daily-actions-preview-'));
  await mkdir(join(target, '.wpmoo'), { recursive: true });
  await writeFile(
    join(target, markerPath),
    JSON.stringify(
      {
        tool: '@wpmoo/toolkit',
        version: '0.8.33',
        product: 'odoo_sample_module',
        odooVersion: '19.0',
        devRepo: 'odoo_sample_module_dev',
        devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
        sourceRepos: [],
        engine: 'compose',
      },
      null,
      2,
    ),
  );

  await mkdir(join(target, 'scripts'), { recursive: true });
  for (const script of options.scripts ?? []) {
    await writeFile(join(target, 'scripts', script), '#!/usr/bin/env bash\n', 'utf8');
  }

  if (options.env !== undefined) {
    await writeFile(join(target, '.env'), options.env, 'utf8');
  }

  return target;
}

function getPreviewer(): DailyActionSafetyPreview {
  const previewer = (dailyActions as { dailyActionSafetyPreview?: DailyActionSafetyPreview }).dailyActionSafetyPreview;

  expect(previewer).toBeDefined();
  return previewer!;
}

function pick<T>(preview: SafetyPreview, keys: string[]): T | undefined {
  const record = preview as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) {
      return value as T;
    }
  }
  return undefined;
}

function previewText(preview: SafetyPreview): string {
  return JSON.stringify(preview, null, 2);
}

function previewEnvironment(preview: SafetyPreview): string | undefined {
  return pick<string>(preview, ['environment', 'env']);
}

function previewDryRun(preview: SafetyPreview): boolean | undefined {
  return pick<boolean>(preview, ['dryRun', 'isDryRun']);
}

function previewDestructive(preview: SafetyPreview): boolean | undefined {
  return pick<boolean>(preview, ['destructive', 'isDestructive']);
}

function previewScriptArgs(preview: SafetyPreview): string[] | undefined {
  return pick<string[]>(preview, ['scriptArgs', 'args', 'argv']);
}

function previewRequiredFlag(preview: SafetyPreview): string | undefined {
  return (
    pick<string>(preview, ['requiredFlag']) ??
    (() => {
      const deny = pick<Record<string, unknown>>(preview, ['deny']);
      return deny && typeof deny === 'object' ? (deny.requiredFlag as string | undefined) : undefined;
    })()
  );
}

function previewRefusal(preview: SafetyPreview): string | undefined {
  const deny = pick<Record<string, unknown>>(preview, ['deny']);
  if (deny && typeof deny === 'object' && typeof deny.message === 'string') {
    return deny.message;
  }

  return (
    pick<string>(preview, ['refusal', 'refusalMessage', 'message']) ??
    (pick<boolean>(preview, ['allowed']) === false ? 'Refused' : undefined)
  );
}

describe('daily action safety preview contract', () => {
  it('returns a dry-run preview for restore-snapshot in prod without refusal', async () => {
    const preview = getPreviewer();
    const target = await makeEnvironment({
      scripts: ['restore-snapshot.sh'],
      env: 'WPMOO_ENV=prod\n',
    });

    const result = await preview('restore-snapshot', ['--dry-run', 'before-update', 'devel'], target);

    expect(result.command).toBe('restore-snapshot');
    expect(previewEnvironment(result)).toBe('prod');
    expect(previewDryRun(result)).toBe(true);
    expect(previewDestructive(result)).toBe(false);
    expect(previewScriptArgs(result)).toEqual(['--dry-run', 'before-update', 'devel']);
    expect(result).toMatchObject({
      scriptPath: join(target, 'scripts/restore-snapshot.sh'),
    });
    expect(pick<boolean>(result, ['allowed'])).not.toBe(false);
    expect(previewRefusal(result)).toBeUndefined();
  });

  it('includes restore-snapshot preflight issues in dry-run preview without refusing', async () => {
    const preview = getPreviewer();
    const target = await makeEnvironment({
      scripts: ['restore-snapshot.sh'],
      env: 'WPMOO_ENV=prod\n',
    });
    await mkdir(join(target, 'backups', 'snapshots'), { recursive: true });
    await writeFile(
      join(target, 'backups', 'snapshots', 'before-update.json'),
      JSON.stringify({
        name: 'before-update',
        database: 'staging',
        dump: 'before-update.dump',
        filestore: 'before-update.filestore.tar.gz',
      }),
    );

    const result = await preview('restore-snapshot', ['--dry-run', 'before-update', 'devel'], target);

    expect(result.command).toBe('restore-snapshot');
    expect(previewDryRun(result)).toBe(true);
    expect(pick<boolean>(result, ['allowed'])).not.toBe(false);
    expect(previewRefusal(result)).toBeUndefined();
    expect(result).toMatchObject({
      restoreSnapshot: {
        name: 'before-update',
        requestedDatabase: 'devel',
        manifestDatabase: 'staging',
        dumpStatus: 'missing',
        filestoreStatus: 'missing',
        databaseMatches: false,
        issues: expect.arrayContaining([
          'missing snapshot dump',
          'missing snapshot filestore',
          'snapshot database mismatch: manifest has staging, requested devel',
        ]),
      },
    });
  });

  it('refuses real restore-snapshot in prod without allow flag and reports destructive/required flag', async () => {
    const preview = getPreviewer();
    const target = await makeEnvironment({
      scripts: ['restore-snapshot.sh'],
      env: 'WPMOO_ENV=prod\n',
    });

    const result = await preview('restore-snapshot', ['before-update', 'devel'], target);

    expect(result.command).toBe('restore-snapshot');
    expect(previewEnvironment(result)).toBe('prod');
    expect(previewDryRun(result)).toBe(false);
    expect(previewDestructive(result)).toBe(true);
    expect(previewRequiredFlag(result)).toBe('WPMOO_ALLOW_DESTRUCTIVE');
    expect(previewRefusal(result)).toContain(
      "Refusing destructive command 'restore-snapshot' in WPMOO_ENV=prod. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.",
    );
  });

  it('warns about snapshot/backup posture for resetdb in stage when no recent snapshot is found', async () => {
    const preview = getPreviewer();
    const target = await makeEnvironment({
      scripts: ['resetdb.sh'],
      env: 'WPMOO_ENV=stage\nWPMOO_ALLOW_DESTRUCTIVE=1\n',
    });
    await mkdir(join(target, 'backups'), { recursive: true });

    const result = await preview('resetdb', ['devel'], target);

    expect(result.command).toBe('resetdb');
    expect(previewEnvironment(result)).toBe('stage');
    expect(previewDestructive(result)).toBe(true);
    expect(previewScriptArgs(result)).toEqual(['devel']);
    expect(previewRefusal(result)).toBeUndefined();
    expect(previewText(result)).toMatch(/snapshot|backup|WPMOO_REQUIRE|recent/i);
  });
});
