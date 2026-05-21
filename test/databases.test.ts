import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  databaseSnapshotExtensions,
  defaultDatabaseSnapshotMaxAgeMs,
  findDatabaseSnapshots,
  hasRecentDatabaseSnapshot,
  isValidDatabaseName,
  normalizeDatabaseName,
  parseDatabaseListOutput,
} from '../src/databases.js';

async function writeSnapshotFile(path: string, mtimeMs: number): Promise<string> {
  await writeFile(path, 'snapshot');
  await utimes(path, new Date(mtimeMs), new Date(mtimeMs));
  return path;
}

describe('database discovery', () => {
  it('filters maintenance and invalid database names from Odoo workflow lists', () => {
    expect(
      parseDatabaseListOutput(
        [
          'devel',
          'postgres',
          'moo_olympiad_test',
          'bad name',
          '-invalid',
          'devel',
          'odoo_19',
          '',
        ].join('\n'),
      ),
    ).toEqual(['devel', 'moo_olympiad_test', 'odoo_19']);
  });

  it('can include maintenance databases for psql workflows', () => {
    expect(parseDatabaseListOutput('devel\npostgres\n', { includeMaintenance: true })).toEqual([
      'devel',
      'postgres',
    ]);
  });

  it('normalizes safe database names and keeps allowed characters', () => {
    expect(normalizeDatabaseName('devel-prod_1')).toEqual('devel-prod_1');
    expect(normalizeDatabaseName('my.db-name-2')).toEqual('my.db-name-2');
  });

  it('detects invalid database names as unsafe', () => {
    expect(isValidDatabaseName('')).toBe(false);
    expect(isValidDatabaseName('   ')).toBe(false);
    expect(isValidDatabaseName('-bad')).toBe(false);
    expect(isValidDatabaseName('bad name')).toBe(false);
    expect(isValidDatabaseName('bad/name')).toBe(false);
    expect(isValidDatabaseName('bad$(pwd)')).toBe(false);
    expect(isValidDatabaseName('bad\nname')).toBe(false);
    expect(isValidDatabaseName('bad\tname')).toBe(false);
    expect(isValidDatabaseName('bad;rm -rf /')).toBe(false);
  });

  it('throws clear errors for invalid database names', () => {
    expect(() => normalizeDatabaseName('')).toThrow('Invalid database name: value is required.');
    expect(() => normalizeDatabaseName(' -bad')).toThrow('Invalid database name: whitespace is not allowed.');
    expect(() => normalizeDatabaseName('bad name')).toThrow('Invalid database name: whitespace is not allowed.');
    expect(() => normalizeDatabaseName('bad$name')).toThrow(
      'Invalid database name: use letters, digits, underscores, dots, or hyphens without shell metacharacters or path characters.',
    );
    expect(() => normalizeDatabaseName('-bad')).toThrow('Invalid database name: leading hyphens are not allowed.');
  });

  it('finds database snapshot files across backups, backup, and snapshots directories', async () => {
    const nowMs = Date.now();
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-db-snapshot-scan-'));

    await mkdir(join(target, 'backups'), { recursive: true });
    await mkdir(join(target, 'backup'), { recursive: true });
    await mkdir(join(target, 'snapshots'), { recursive: true });

    const newestPath = await writeSnapshotFile(
      join(target, 'backup', 'fresh.dump'),
      nowMs - 5 * 60 * 1000,
    );
    const olderPath = await writeSnapshotFile(
      join(target, 'backups', 'daily.sql'),
      nowMs - 90 * 60 * 1000,
    );
    const zippedPath = await writeSnapshotFile(
      join(target, 'snapshots', 'archive.tar.gz'),
      nowMs - 2 * 60 * 60 * 1000,
    );
    await writeSnapshotFile(join(target, 'backups', 'ignore.txt'), nowMs - 60 * 1000);

    const result = findDatabaseSnapshots(target, { nowMs });

    expect(result.snapshotPaths).toEqual([newestPath, olderPath, zippedPath]);
    expect(result.newestSnapshotAgeMs).toBeCloseTo(5 * 60 * 1000);
    expect(result.snapshots).toHaveLength(3);
    expect(result.snapshots[0]).toMatchObject({
      path: newestPath,
      dumpPath: newestPath,
      filestoreStatus: 'missing',
    });
    expect(Math.abs(result.snapshots[0]!.createdAtMs - (nowMs - 5 * 60 * 1000))).toBeLessThanOrEqual(1);
    expect(Math.abs(Date.parse(result.snapshots[0]!.createdAt) - (nowMs - 5 * 60 * 1000))).toBeLessThanOrEqual(1);
    expect(result.snapshots[1]).toMatchObject({ path: olderPath });
    expect(result.snapshots[2]).toMatchObject({ path: zippedPath });
  });

  it('catalogs generated snapshot dump, manifest, and filestore siblings', async () => {
    const nowMs = Date.now();
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-db-snapshot-catalog-'));
    const snapshotDir = join(target, 'backups', 'snapshots');
    await mkdir(snapshotDir, { recursive: true });

    const dumpPath = await writeSnapshotFile(join(snapshotDir, 'before-update.dump'), nowMs - 60 * 1000);
    const filestorePath = await writeSnapshotFile(
      join(snapshotDir, 'before-update.filestore.tar.gz'),
      nowMs - 30 * 1000,
    );
    const manifestPath = join(snapshotDir, 'before-update.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'before-update',
        database: 'devel',
        created_at: '2026-05-22T10:20:30Z',
        dump: 'before-update.dump',
        filestore: 'before-update.filestore.tar.gz',
      }),
    );

    const result = findDatabaseSnapshots(target, { nowMs });

    expect(result.snapshotPaths).toEqual([dumpPath]);
    expect(result.snapshots).toEqual([
      expect.objectContaining({
        name: 'before-update',
        path: dumpPath,
        dumpPath,
        manifestPath,
        databaseName: 'devel',
        createdAtMs: Date.parse('2026-05-22T10:20:30Z'),
        createdAt: '2026-05-22T10:20:30.000Z',
        filestorePath,
        filestoreStatus: 'found',
      }),
    ]);
  });

  it('does not infer a database name from non-generated snapshot names', async () => {
    const nowMs = Date.now();
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-db-snapshot-no-db-'));
    await mkdir(join(target, 'backups', 'snapshots'), { recursive: true });
    await writeSnapshotFile(join(target, 'backups', 'snapshots', 'before-update.dump'), nowMs - 60 * 1000);

    const result = findDatabaseSnapshots(target, { nowMs });

    expect(result.snapshots[0]?.name).toBe('before-update');
    expect(result.snapshots[0]?.databaseName).toBeUndefined();
  });

  it('does not throw when snapshot directories are missing', () => {
    expect(findDatabaseSnapshots('/tmp/db-snapshots-that-do-not-exist').snapshotPaths).toEqual([]);
    expect(findDatabaseSnapshots('/tmp/db-snapshots-that-do-not-exist').newestSnapshotAgeMs).toBeNull();
  });

  it('checks for a recent snapshot using configurable max age', async () => {
    const nowMs = Date.now();
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-db-snapshot-recent-'));
    await mkdir(join(target, 'backups'), { recursive: true });
    await writeSnapshotFile(join(target, 'backups', 'fresh.sql.gz'), nowMs - 30 * 60 * 1000);

    expect(hasRecentDatabaseSnapshot(target, { nowMs, maxAgeMs: 60 * 60 * 1000 })).toBe(true);
    expect(hasRecentDatabaseSnapshot(target, { nowMs, maxAgeMs: 10 * 60 * 1000 })).toBe(false);
    expect(hasRecentDatabaseSnapshot(target)).toBe(true);
    expect(defaultDatabaseSnapshotMaxAgeMs).toBe(24 * 60 * 60 * 1000);
    expect(databaseSnapshotExtensions).toContain('.sql.gz');
  });
});
