import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isCliEntrypoint } from '../src/cli.js';

describe('cli entrypoint detection', () => {
  it('recognizes npm .bin symlinks as the cli entrypoint', () => {
    const root = mkdtempSync(join(tmpdir(), 'wpmoo-cli-entrypoint-'));
    const target = join(root, 'dist-cli.js');
    const symlink = join(root, 'wpmoo');
    writeFileSync(target, '#!/usr/bin/env node\n');
    symlinkSync(target, symlink);

    expect(isCliEntrypoint(pathToFileURL(target).href, symlink)).toBe(true);
  });

  it('does not treat unrelated files as the cli entrypoint', () => {
    const root = mkdtempSync(join(tmpdir(), 'wpmoo-cli-entrypoint-'));
    const target = join(root, 'dist-cli.js');
    const other = join(root, 'vitest.js');
    writeFileSync(target, '#!/usr/bin/env node\n');
    writeFileSync(other, '#!/usr/bin/env node\n');

    expect(isCliEntrypoint(pathToFileURL(target).href, other)).toBe(false);
  });
});
