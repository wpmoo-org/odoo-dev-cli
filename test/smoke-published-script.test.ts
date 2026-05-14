import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const scriptPath = new URL('../scripts/smoke-published.sh', import.meta.url);

async function createSmokeFixture(version: string, expectedSpec: string) {
  const root = mkdtempSync(join(tmpdir(), 'wpmoo-smoke-published-'));
  await mkdir(join(root, 'bin'));
  await mkdir(join(root, 'tmp'));

  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  packageJson.version = version;
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

  const argsLogPath = join(root, 'npx-args.log');
  const cacheLogPath = join(root, 'npx-cache.log');
  const stubPath = join(root, 'bin', 'npx-stub');
  await writeFile(
    stubPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${argsLogPath}"
printf '%s\\n' "\${NPM_CONFIG_CACHE:-}" >> "${cacheLogPath}"

case "$*" in
  "--yes --package ${expectedSpec} wpmoo --version")
    echo "${expectedSpec}"
    ;;
  "--yes --package ${expectedSpec} wpmoo --help")
    echo "Usage: wpmoo"
    ;;
  *)
    echo "unexpected npx command: $*" >&2
    exit 1
    ;;
esac
`,
    { mode: 0o755 },
  );

  return { argsLogPath, cacheLogPath, root, stubPath, tmpRoot: join(root, 'tmp') };
}

function runSmoke(root: string, npxStub: string, args: string[] = [], env: Record<string, string> = {}) {
  const runEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
    WPMOO_NPX_BIN: npxStub,
  };
  if (!('NPM_CONFIG_CACHE' in env)) {
    delete runEnv.NPM_CONFIG_CACHE;
  }

  execFileSync('bash', [scriptPath.pathname, ...args], {
    cwd: root,
    env: runEnv,
    stdio: 'pipe',
  });
}

describe('published package smoke script', () => {
  it('exposes an npm script for the published package smoke check', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['smoke:published']).toBe('bash scripts/smoke-published.sh');
  });

  it('uses the local package version as the default package spec and creates a temporary npm cache', async () => {
    const { argsLogPath, cacheLogPath, root, stubPath, tmpRoot } = await createSmokeFixture(
      '9.8.7',
      '@wpmoo/odoo@9.8.7',
    );

    runSmoke(root, stubPath, [], { TMPDIR: tmpRoot });

    expect(readFileSync(argsLogPath, 'utf8').trim().split('\n')).toEqual([
      '--yes --package @wpmoo/odoo@9.8.7 wpmoo --version',
      '--yes --package @wpmoo/odoo@9.8.7 wpmoo --help',
    ]);
    const cachePaths = readFileSync(cacheLogPath, 'utf8').trim().split('\n');
    expect(cachePaths).toHaveLength(2);
    expect(cachePaths[0]).toBe(cachePaths[1]);
    expect(cachePaths[0].startsWith(`${tmpRoot}/wpmoo-published-smoke-npm-cache.`)).toBe(true);
  });

  it('uses an environment package spec override', async () => {
    const { argsLogPath, root, stubPath } = await createSmokeFixture('9.8.7', '@wpmoo/odoo@next');

    runSmoke(root, stubPath, [], { WPMOO_PUBLISHED_PACKAGE_SPEC: '@wpmoo/odoo@next' });

    expect(readFileSync(argsLogPath, 'utf8').trim().split('\n')).toEqual([
      '--yes --package @wpmoo/odoo@next wpmoo --version',
      '--yes --package @wpmoo/odoo@next wpmoo --help',
    ]);
  });

  it('treats a positional version override as a version for the local package', async () => {
    const { argsLogPath, root, stubPath } = await createSmokeFixture('9.8.7', '@wpmoo/odoo@9.8.8');

    runSmoke(root, stubPath, ['9.8.8'], { WPMOO_PUBLISHED_PACKAGE_SPEC: '@wpmoo/odoo@next' });

    expect(readFileSync(argsLogPath, 'utf8').trim().split('\n')).toEqual([
      '--yes --package @wpmoo/odoo@9.8.8 wpmoo --version',
      '--yes --package @wpmoo/odoo@9.8.8 wpmoo --help',
    ]);
  });
});
