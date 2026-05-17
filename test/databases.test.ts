import { describe, expect, it } from 'vitest';

import { parseDatabaseListOutput } from '../src/databases.js';

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
});
