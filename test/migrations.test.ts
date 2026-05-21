import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scanMigrationRisks } from '../src/migrations.js';

function uniqueTmpPrefix(): string {
  return join(tmpdir(), `wpmoo-migrations-${crypto.randomUUID()}`);
}

describe('migration risk scan', () => {
  it('returns no migration paths when no matching files exist', async () => {
    const target = await mkdtemp(uniqueTmpPrefix());
    await mkdir(join(target, 'odoo/custom/src/private/product'), { recursive: true });
    await mkdir(join(target, 'odoo/custom/src/private/product/no_migrations'), { recursive: true });

    await expect(scanMigrationRisks(target)).resolves.toEqual({
      foundPaths: [],
      count: 0,
      risk: false,
    });
  });

  it('finds migration hooks in plural and singular folders and module scripts', async () => {
    const target = await mkdtemp(uniqueTmpPrefix());
    const modulePath = join(target, 'odoo/custom/src/private/product/module');
    const migrationDir = join(modulePath, 'migrations', '18.0');
    const migrationLegacyDir = join(modulePath, 'migration', '19.0');
    const scriptsPath = join(modulePath, 'scripts');

    await mkdir(scriptsPath, { recursive: true });
    await mkdir(migrationDir, { recursive: true });
    await mkdir(migrationLegacyDir, { recursive: true });

    const prePath = join(migrationDir, 'pre-migration.py');
    const postPath = join(migrationDir, 'post-migration.py');
    const endPath = join(migrationLegacyDir, 'end-migration.py');
    const migrateScriptPath = join(scriptsPath, 'migrate.py');
    const migrationScriptPath = join(scriptsPath, 'migration.py');

    await writeFile(prePath, '# pre', 'utf8');
    await writeFile(postPath, '# post', 'utf8');
    await writeFile(endPath, '# end', 'utf8');
    await writeFile(migrateScriptPath, '# migrate', 'utf8');
    await writeFile(migrationScriptPath, '# migration', 'utf8');

    await expect(scanMigrationRisks(target)).resolves.toEqual({
      foundPaths: [endPath, migrateScriptPath, migrationScriptPath, postPath, prePath].sort(),
      count: 5,
      risk: true,
    });
  });

  it('finds matches across multiple repos and modules', async () => {
    const target = await mkdtemp(uniqueTmpPrefix());
    const firstMigration = join(
      target,
      'odoo/custom/src/private/product_a',
      'module_a',
      'migrations',
      '18.0',
      'pre-migration.py',
    );
    const secondMigration = join(
      target,
      'odoo/custom/src/oca/partner_repo',
      'module_b',
      'scripts',
      'migration.py',
    );

    await mkdir(dirname(firstMigration), { recursive: true });
    await mkdir(dirname(secondMigration), { recursive: true });

    await writeFile(firstMigration, '# first', 'utf8');
    await writeFile(secondMigration, '# second', 'utf8');

    await expect(scanMigrationRisks(target)).resolves.toEqual({
      foundPaths: [firstMigration, secondMigration].sort(),
      count: 2,
      risk: true,
    });
  });

  it('handles missing source trees as no risk', async () => {
    const target = await mkdtemp(uniqueTmpPrefix());
    await expect(scanMigrationRisks(target)).resolves.toEqual({
      foundPaths: [],
      count: 0,
      risk: false,
    });
  });
});
