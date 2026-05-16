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
    WPMOO_SMOKE_ENVIRONMENT: '0',
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

async function createAcceptanceFixture(version: string, expectedSpec: string) {
  const root = mkdtempSync(join(tmpdir(), 'wpmoo-smoke-published-acceptance-'));
  await mkdir(join(root, 'bin'));
  await mkdir(join(root, 'tmp'));

  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  packageJson.version = version;
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

  const argsLogPath = join(root, 'npx-args.log');
  const stubPath = join(root, 'bin', 'npx-stub');
  await writeFile(
    stubPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${argsLogPath}"

if [[ "$1" != "--yes" || "$2" != "--package" || "$3" != "${expectedSpec}" || "$4" != "wpmoo" ]]; then
  echo "unexpected npx command: $*" >&2
  exit 1
fi
shift 4

case "\${1:-}" in
  "--version")
    echo "${expectedSpec}"
    ;;
  "--help")
    echo "Usage: wpmoo"
    ;;
  "create")
    target=""
    while [[ "$#" -gt 0 ]]; do
      case "$1" in
        "--target")
          target="$2"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done
    [[ -n "$target" ]] || exit 2
    mkdir -p "$target"
    cat >"$target/moo" <<'MOO'
#!/usr/bin/env bash
set -euo pipefail
printf 'moo:%s\\n' "$*" >> "${argsLogPath}"
if [[ "$1" == "snapshot" ]]; then
  echo "Snapshot written"
  exit 0
fi
if [[ "$1" == "restore-snapshot" && "$2" == "--dry-run" ]]; then
  echo "Restore snapshot preview"
  exit 0
fi
echo "unexpected moo command: $*" >&2
exit 1
MOO
    chmod +x "$target/moo"
    echo "Created Odoo dev overlay in $target."
    ;;
  "source")
    echo "private/wpmoo_smoke_module @ 19.0 -> local"
    ;;
  "reset")
    echo "Safe reset preview"
    ;;
  "doctor")
    echo "Doctor checks passed."
    ;;
  *)
    echo "unexpected wpmoo command: $*" >&2
    exit 1
    ;;
esac
`,
    { mode: 0o755 },
  );

  return { argsLogPath, root, stubPath, tmpRoot: join(root, 'tmp') };
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

  it('runs the generated environment acceptance flow when enabled', async () => {
    const { argsLogPath, root, stubPath, tmpRoot } = await createAcceptanceFixture(
      '9.8.7',
      '@wpmoo/odoo@9.8.7',
    );

    runSmoke(root, stubPath, [], { TMPDIR: tmpRoot, WPMOO_SMOKE_ENVIRONMENT: '1' });

    const commands = readFileSync(argsLogPath, 'utf8').trim().split('\n');
    expect(commands).toContain('--yes --package @wpmoo/odoo@9.8.7 wpmoo --version');
    expect(commands).toContain('--yes --package @wpmoo/odoo@9.8.7 wpmoo --help');
    expect(commands.some((command) => command.includes(' wpmoo create '))).toBe(true);
    expect(commands).toContain('--yes --package @wpmoo/odoo@9.8.7 wpmoo source list');
    expect(commands.some((command) => command.includes(' wpmoo reset --dry-run '))).toBe(true);
    expect(commands).toContain('--yes --package @wpmoo/odoo@9.8.7 wpmoo doctor --fix');
    expect(commands).toContain('moo:snapshot devel smoke-before');
    expect(commands).toContain('moo:restore-snapshot --dry-run smoke-before devel');
  });
});
