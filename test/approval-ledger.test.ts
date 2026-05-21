import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readActiveApprovals } from '../src/approval-ledger.js';

describe('approval ledger', () => {
  it('returns active command approvals from .wpmoo/approvals.jsonl', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-approval-ledger-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/approvals.jsonl'),
      [
        JSON.stringify({
          scope: 'stage-lifecycle',
          environment: 'stage',
          command: 'install',
          expiresAt: '2026-05-21T12:30:00.000Z',
          reason: 'release candidate install',
        }),
        JSON.stringify({
          scope: 'stage-lifecycle',
          environment: 'stage',
          command: 'update',
          expiresAt: '2026-05-21T11:00:00.000Z',
        }),
        'not-json',
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(
      readActiveApprovals(target, {
        command: 'install',
        environment: 'stage',
        now: new Date('2026-05-21T12:00:00.000Z'),
      }),
    ).resolves.toEqual([
      {
        scope: 'stage-lifecycle',
        environment: 'stage',
        command: 'install',
        expiresAt: '2026-05-21T12:30:00.000Z',
        reason: 'release candidate install',
        label: 'approval:stage-lifecycle',
      },
    ]);
  });

  it('supports command-wide approvals and ignores mismatched environments', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-approval-ledger-wide-'));
    await mkdir(join(target, '.wpmoo'), { recursive: true });
    await writeFile(
      join(target, '.wpmoo/approvals.jsonl'),
      [
        JSON.stringify({
          scope: 'destructive',
          environment: 'stage',
          expiresAt: '2026-05-21T12:30:00.000Z',
        }),
        JSON.stringify({
          scope: 'destructive',
          environment: 'prod',
          expiresAt: '2026-05-21T12:30:00.000Z',
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    await expect(
      readActiveApprovals(target, {
        command: 'resetdb',
        environment: 'stage',
        now: new Date('2026-05-21T12:00:00.000Z'),
      }),
    ).resolves.toEqual([
      {
        scope: 'destructive',
        environment: 'stage',
        expiresAt: '2026-05-21T12:30:00.000Z',
        label: 'approval:destructive',
      },
    ]);
  });
});
