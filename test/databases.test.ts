import { describe, expect, it } from 'vitest';

import { isValidDatabaseName, normalizeDatabaseName, parseDatabaseListOutput } from '../src/databases.js';

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
});
