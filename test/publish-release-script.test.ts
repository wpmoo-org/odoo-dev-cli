import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const scriptPath = new URL('../scripts/publish-release.sh', import.meta.url);

async function createReleaseFixture(version: string, existingVersions: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'wpmoo-publish-release-'));
  await cp(new URL('../package.json', import.meta.url), join(root, 'package.json'));
  await cp(new URL('../package-lock.json', import.meta.url), join(root, 'package-lock.json'));
  await mkdir(join(root, 'bin'));

  for (const file of ['package.json', 'package-lock.json']) {
    const path = join(root, file);
    const data = JSON.parse(readFileSync(path, 'utf8')) as {
      version: string;
      packages?: Record<string, { version?: string }>;
    };
    data.version = version;
    if (data.packages?.['']) {
      data.packages[''].version = version;
    }
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  }

  const logPath = join(root, 'npm.log');
  const stubPath = join(root, 'bin', 'npm-stub');
  await writeFile(
    stubPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${logPath}"
case "$1" in
  view)
    spec="$2"
    case "$spec" in
${existingVersions.map((item) => `      "@wpmoo/odoo@${item}") echo "${item}"; exit 0 ;;`).join('\n')}
      *) echo "npm ERR! code E404" >&2; exit 1 ;;
    esac
    ;;
  version)
    "${process.execPath}" - <<'NODE'
const fs = require('node:fs');
function bump(version) {
  const parts = version.split('.').map(Number);
  parts[2] += 1;
  return parts.join('.');
}
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const next = bump(packageJson.version);
packageJson.version = next;
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\\n');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.version = next;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = next;
}
fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\\n');
console.log('v' + next);
NODE
    ;;
  test)
    test "$2" = "--"
    test "$3" = "test/package.test.ts"
    ;;
  pack)
    test "$2" = "--dry-run"
    ;;
  publish)
    test "$2" = "--access"
    test "$3" = "public"
    ;;
  *)
    echo "unexpected npm command: $*" >&2
    exit 1
    ;;
esac
`,
    { mode: 0o755 },
  );

  return { root, logPath, stubPath };
}

function runReleaseScript(root: string, npmStub: string) {
  execFileSync('bash', [scriptPath.pathname], {
    cwd: root,
    env: {
      ...process.env,
      WPMOO_NPM_BIN: npmStub,
      NPM_CONFIG_CACHE: join(root, '.npm-cache'),
    },
    stdio: 'pipe',
  });
}

function runReleaseScriptExpectFailure(root: string, npmStub: string) {
  try {
    runReleaseScript(root, npmStub);
    throw new Error('Expected publish release script to fail');
  } catch (error) {
    const failure = error as { stdout?: Buffer; stderr?: Buffer; status?: number };
    expect(failure.status).not.toBe(0);
    return `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`;
  }
}

describe('publish release script', () => {
  it('bumps patch version and stops before publishing when the current version already exists on npm', async () => {
    const { root, logPath, stubPath } = await createReleaseFixture('0.8.36', ['0.8.36']);

    const output = runReleaseScriptExpectFailure(root, stubPath);

    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    const commands = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(packageJson.version).toBe('0.8.37');
    expect(commands).toEqual([
      'view @wpmoo/odoo@0.8.36 version',
      'version patch --no-git-tag-version',
      'view @wpmoo/odoo@0.8.37 version',
    ]);
    expect(output).toContain('Version was bumped to 0.8.37.');
    expect(output).toContain('Commit package.json and package-lock.json, push them, then rerun this script.');
  });

  it('keeps the current version when it is not published yet', async () => {
    const { root, logPath, stubPath } = await createReleaseFixture('0.8.37', []);

    runReleaseScript(root, stubPath);

    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    const commands = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(packageJson.version).toBe('0.8.37');
    expect(commands).toEqual([
      'view @wpmoo/odoo@0.8.37 version',
      'test -- test/package.test.ts',
      'pack --dry-run',
      'publish --access public',
    ]);
  });
});
