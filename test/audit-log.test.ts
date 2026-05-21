import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendAuditLog,
  extractApprovedFlags,
  sanitizeCommandArgs,
} from '../src/audit-log.js';

describe('audit log sanitizer', () => {
  it('redacts secret-like key/value flags', () => {
    expect(
      sanitizeCommandArgs([
        '--password',
        'hunter2',
        '--api-key=my-key',
        'list',
        'token=abc',
        'api_key=xyz',
        '--token',
        '123',
      ]),
    ).toEqual([
      '--password',
      '***',
      '--api-key=***',
      'list',
      'token=***',
      'api_key=***',
      '--token',
      '***',
    ]);
  });

  it('does not mutate non-secret arguments', () => {
    expect(sanitizeCommandArgs(['start', '--keep-logs', 'true', '--user', 'alice'])).toEqual([
      'start',
      '--keep-logs',
      'true',
      '--user',
      'alice',
    ]);
  });

  it('identifies approved flag names that are present', () => {
    expect(
      extractApprovedFlags(
        ['--dry-run', '--force=true', 'resetdb'],
        ['--force', '--approve', '--dry-run'],
      ),
    ).toEqual(['--force', '--dry-run']);
  });
});

describe('appendAuditLog', () => {
  it('writes sanitized entries to .wpmoo/audit.log and creates directories', async () => {
    const environment = await mkdtemp(join(tmpdir(), 'wpmoo-audit-log-'));
    const timestamp = new Date('2026-05-21T12:00:00.000Z');

    await appendAuditLog({
      environmentPath: environment,
      command: 'restore-snapshot',
      environment: 'prod',
      dryRun: true,
      args: ['--token', 'abc', '--dry-run'],
      approvedFlagNames: ['--dry-run', '--token'],
      timestamp,
    });

    const content = await readFile(join(environment, '.wpmoo', 'audit.log'), 'utf8');
    const line = content.trim();
    const entry = JSON.parse(line);

    expect(entry).toMatchObject({
      timestamp: '2026-05-21T12:00:00.000Z',
      command: 'restore-snapshot',
      environment: 'prod',
      dryRun: true,
      approvedFlags: ['--dry-run', '--token'],
      args: ['--token', '***', '--dry-run'],
    });
  });
});
