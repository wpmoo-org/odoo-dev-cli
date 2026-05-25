import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

type SmokeCommandBehavior = 'default' | 'npx-version-fail' | 'npx-version-timeout' | 'version-mismatch';

const scriptPath = new URL('../scripts/smoke-published.sh', import.meta.url);

function buildSmokeStub(expectedSpec: string, behavior: SmokeCommandBehavior) {
  const versionOutput = behavior === 'version-mismatch' ? '@wpmoo/toolkit@0.0.0' : expectedSpec;
  const failureBlock =
    behavior === 'npx-version-fail'
      ? `
if [[ "$1" == "--yes" && "$5" == "--version" ]]; then
  echo "simulated npx failure" >&2
  exit 2
fi`
      : behavior === 'npx-version-timeout'
        ? `
if [[ "$1" == "--yes" && "$5" == "--version" ]]; then
  echo "simulated npx timeout" >&2
  sleep 5
fi`
        : '';

  return `#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "${'$'}{npxArgsLogPath}"
printf '%s\n' "${'$'}{NPM_CONFIG_CACHE:-}" >> "${'$'}{npxCacheLogPath}"

${failureBlock}

if [[ "$1" == "exec" ]]; then
  if [[ "$2" == "--yes" && "$3" == "--package" && "$4" == "${expectedSpec}" && "$5" == "--" && "$6" == "wpmoo" ]]; then
    case "${'$'}{7}" in
      --version)
        echo "${versionOutput}"
        ;;
      --help)
        echo "Usage: wpmoo"
        ;;
      create)
        if [[ "${'$'}{8:-}" == "--help" ]]; then
          echo "Usage: wpmoo create"
          exit 0
        fi
        ;;
      doctor)
        if [[ "${'$'}{8:-}" == "--help" ]]; then
          echo "Usage: wpmoo doctor"
          exit 0
        fi
        ;;
      status)
        if [[ "${'$'}{8:-}" == "--help" ]]; then
          echo "Usage: wpmoo status"
          exit 0
        fi
        ;;
      *)
        echo "unexpected npm exec command: $*" >&2
        exit 1
        ;;
    esac
    exit 0
  fi

  echo "unexpected npm exec command: $*" >&2
  exit 1
fi

case "$*" in
  "--yes --package ${expectedSpec} wpmoo --version")
    echo "${versionOutput}"
    ;;
  "--yes --package ${expectedSpec} wpmoo --help")
    echo "Usage: wpmoo"
    ;;
  "--yes --package ${expectedSpec} wpmoo create --help")
    echo "Usage: wpmoo create"
    ;;
  "--yes --package ${expectedSpec} wpmoo doctor --help")
    echo "Usage: wpmoo doctor"
    ;;
  "--yes --package ${expectedSpec} wpmoo status --help")
    echo "Usage: wpmoo status"
    ;;
  *)
    echo "unexpected npx command: $*" >&2
    exit 1
    ;;
esac
`;
}

async function createSmokeFixture(
  version: string,
  expectedSpec: string,
  behavior: SmokeCommandBehavior = 'default',
) {
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
    `export npxArgsLogPath="${argsLogPath}"
export npxCacheLogPath="${cacheLogPath}"

${buildSmokeStub(expectedSpec, behavior)}
`,
    { mode: 0o755 },
  );

  return { argsLogPath, cacheLogPath, root, stubPath, tmpRoot: join(root, 'tmp') };
}

function runSmoke(
  root: string,
  npxStub: string,
  args: string[] = [],
  env: Record<string, string> = {},
  npmBin: string = npxStub,
) {
  const runEnv: NodeJS.ProcessEnv = {
    ...process.env,
    WPMOO_SMOKE_ENVIRONMENT: '0',
    ...env,
    WPMOO_NPX_BIN: npxStub,
    WPMOO_NPM_BIN: npmBin,
  };
  if (!('NPM_CONFIG_CACHE' in env)) {
    delete runEnv.NPM_CONFIG_CACHE;
  }

  const result = spawnSync('bash', [scriptPath.pathname, ...args], {
    cwd: root,
    env: runEnv,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.status !== 0) {
    throw new Error(`smoke script failed with status ${result.status}:\n${output}`);
  }

  return output;
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
printf '%s\n' "$*" >> "${argsLogPath}"

if [[ "$1" != "--yes" || "$2" != "--package" || "$3" != "${expectedSpec}" || "$4" != "wpmoo" ]]; then
  echo "unexpected npx command: $*" >&2
  exit 1
fi
shift 4

case "${'$'}{1:-}" in
  "--version")
    echo "${expectedSpec}"
    ;;
  "--help")
    echo "Usage: wpmoo"
    ;;
  "create")
    if [[ "${'$'}{2:-}" == "--help" ]]; then
      echo "Usage: wpmoo create"
      exit 0
    fi

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
    mkdir -p "$target/odoo/custom/src/private/wpmoo_smoke_module"
    git -C "$target/odoo/custom/src/private/wpmoo_smoke_module" init -b 19.0 >/dev/null
    git -C "$target/odoo/custom/src/private/wpmoo_smoke_module" config user.name "WPMoo Smoke"
    git -C "$target/odoo/custom/src/private/wpmoo_smoke_module" config user.email "smoke@example.com"
    printf '# Smoke source\n' >"$target/odoo/custom/src/private/wpmoo_smoke_module/README.md"
    git -C "$target/odoo/custom/src/private/wpmoo_smoke_module" add README.md
    git -C "$target/odoo/custom/src/private/wpmoo_smoke_module" commit -m "Initial smoke source" >/dev/null
    cat >"$target/moo" <<'MOO'
#!/usr/bin/env bash
set -euo pipefail
printf 'moo:%s\n' "$*" >> "${argsLogPath}"
if [[ "$1" == "snapshot" ]]; then
  echo "Snapshot written"
  exit 0
fi
if [[ "$1" == "restore-snapshot" && "$2" == "--dry-run" ]]; then
  echo "Restore snapshot preview"
  exit 0
fi
if [[ "$1" == "status" && "$2" == "--json" ]]; then
  cat <<'JSON'
{
  "schemaVersion": 1,
  "command": "status",
  "ok": true,
  "status": {
    "kind": "environment",
    "moduleCandidateCount": 2
  }
}
JSON
  exit 0
fi
if [[ "$1" == "doctor" && "$#" -eq 1 ]]; then
  echo "Doctor checks passed."
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
  "add-module")
    module_name=""
    profile=""
    while [[ "$#" -gt 0 ]]; do
      case "$1" in
        "--module")
          module_name="$2"
          shift 2
          ;;
        "--profile")
          profile="$2"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done
    [[ -n "$module_name" ]] || exit 2
    module_dir="odoo/custom/src/private/wpmoo_smoke_module/$module_name"
    mkdir -p "$module_dir"
    printf '{}\n' >"$module_dir/__manifest__.py"
    if [[ "$profile" == "portal" ]]; then
      mkdir -p "$module_dir/controllers" "$module_dir/views"
      printf '# portal controller\\n' >"$module_dir/controllers/main.py"
      printf '<odoo><template id="portal" inherit_id="website.layout"/></odoo>\\n' >"$module_dir/views/${'$'}{module_name}_portal_templates.xml"
    fi
    echo "Added module $module_name under source repo wpmoo_smoke_module."
    ;;
  "remove-module")
    module_name=""
    dry_run=0
    while [[ "$#" -gt 0 ]]; do
      case "$1" in
        "--module")
          module_name="$2"
          shift 2
          ;;
        "--dry-run")
          dry_run=1
          shift
          ;;
        *)
          shift
          ;;
      esac
    done
    [[ -n "$module_name" ]] || exit 2
    if [[ "$dry_run" -eq 1 ]]; then
      echo "Previewed removal of module $module_name from source repo wpmoo_smoke_module."
      exit 0
    fi

    rm -rf "odoo/custom/src/private/wpmoo_smoke_module/$module_name"
    echo "Removed module $module_name from source repo wpmoo_smoke_module."
    ;;
  "reset")
    printf 'S\\033[36mummary:\\033[0m 3 files will be refreshed\\n'
    printf 'T\\033[36marget:\\033[0m %s\\n' "$PWD"
    echo "Files to refresh"
    echo "- .wpmoo/odoo.json"
    echo "Files kept unchanged"
    echo "- source repo folders"
    ;;
  "doctor")
    if [[ "${'$'}{2:-}" == "--help" ]]; then
      echo "Usage: wpmoo doctor"
      exit 0
    fi

    echo "Doctor checks passed."
    ;;
  "status")
    if [[ "${'$'}{2:-}" == "--help" ]]; then
      echo "Usage: wpmoo status"
      exit 0
    fi

    if [[ "${'$'}{2:-}" == "--json" ]]; then
      cat <<'JSON'
{
  "schemaVersion": 1,
  "command": "status",
  "ok": true,
  "status": {
    "kind": "environment",
    "moduleCandidateCount": 2
  }
}
JSON
      exit 0
    fi

    echo "Status looks good."
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
      '@wpmoo/toolkit@9.8.7',
    );

    const output = runSmoke(root, stubPath, [], { TMPDIR: tmpRoot });

    expect(readFileSync(argsLogPath, 'utf8').trim().split('\n')).toEqual([
      '--yes --package @wpmoo/toolkit@9.8.7 wpmoo --version',
      '--yes --package @wpmoo/toolkit@9.8.7 wpmoo --help',
      '--yes --package @wpmoo/toolkit@9.8.7 wpmoo create --help',
      '--yes --package @wpmoo/toolkit@9.8.7 wpmoo doctor --help',
      '--yes --package @wpmoo/toolkit@9.8.7 wpmoo status --help',
    ]);
    const cachePaths = readFileSync(cacheLogPath, 'utf8').trim().split('\n');
    expect(cachePaths).toHaveLength(5);
    expect(cachePaths[0]).toBe(cachePaths[1]);
    expect(cachePaths[0].startsWith(`${tmpRoot}/wpmoo-published-smoke-npm-cache.`)).toBe(true);
    expect(output).toContain('Smoke step: wpmoo --version using @wpmoo/toolkit@9.8.7');
    expect(output).toContain('Smoke step: wpmoo doctor --help using @wpmoo/toolkit@9.8.7');
  });

  it('uses an environment package spec override', async () => {
    const { argsLogPath, root, stubPath } = await createSmokeFixture('9.8.7', '@wpmoo/toolkit@next');

    runSmoke(root, stubPath, [], { WPMOO_PUBLISHED_PACKAGE_SPEC: '@wpmoo/toolkit@next' });

    expect(readFileSync(argsLogPath, 'utf8').trim().split('\n')).toEqual([
      '--yes --package @wpmoo/toolkit@next wpmoo --version',
      '--yes --package @wpmoo/toolkit@next wpmoo --help',
      '--yes --package @wpmoo/toolkit@next wpmoo create --help',
      '--yes --package @wpmoo/toolkit@next wpmoo doctor --help',
      '--yes --package @wpmoo/toolkit@next wpmoo status --help',
    ]);
  });

  it('treats a positional version override as a version for the local package', async () => {
    const { argsLogPath, root, stubPath } = await createSmokeFixture('9.8.7', '@wpmoo/toolkit@9.8.8');

    runSmoke(root, stubPath, ['9.8.8'], { WPMOO_PUBLISHED_PACKAGE_SPEC: '@wpmoo/toolkit@next' });

    expect(readFileSync(argsLogPath, 'utf8').trim().split('\n')).toEqual([
      '--yes --package @wpmoo/toolkit@9.8.8 wpmoo --version',
      '--yes --package @wpmoo/toolkit@9.8.8 wpmoo --help',
      '--yes --package @wpmoo/toolkit@9.8.8 wpmoo create --help',
      '--yes --package @wpmoo/toolkit@9.8.8 wpmoo doctor --help',
      '--yes --package @wpmoo/toolkit@9.8.8 wpmoo status --help',
    ]);
  });

  it('fails when an exact positional version override does not match CLI output', async () => {
    const { root, stubPath } = await createSmokeFixture(
      '9.8.7',
      '@wpmoo/toolkit@9.8.8',
      'version-mismatch',
    );

    const result = spawnSync('bash', [scriptPath.pathname, '9.8.8'], {
      cwd: root,
      env: {
        ...process.env,
        WPMOO_SMOKE_ENVIRONMENT: '0',
        WPMOO_NPX_BIN: stubPath,
        WPMOO_NPM_BIN: stubPath,
      },
      encoding: 'utf8',
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    expect(result.status).toBe(1);
    expect(output).toContain('Expected wpmoo --version output to include 9.8.8');
    expect(output).toContain('@wpmoo/toolkit@0.0.0');
  });

  it.each(['@wpmoo/odoo', '@wpmoo/odoo-dev'])('uses compatibility aliases (%s)', async (packageSpec) => {
    const { argsLogPath, root, stubPath, tmpRoot } = await createSmokeFixture('9.8.7', packageSpec);

    runSmoke(root, stubPath, [], { TMPDIR: tmpRoot, WPMOO_PUBLISHED_PACKAGE_SPEC: packageSpec });

    expect(readFileSync(argsLogPath, 'utf8').trim().split('\n')).toEqual([
      `--yes --package ${packageSpec} wpmoo --version`,
      `--yes --package ${packageSpec} wpmoo --help`,
      `--yes --package ${packageSpec} wpmoo create --help`,
      `--yes --package ${packageSpec} wpmoo doctor --help`,
      `--yes --package ${packageSpec} wpmoo status --help`,
    ]);
  });

  it('falls back to npm exec when npx command fails', async () => {
    const { argsLogPath, root, stubPath } = await createSmokeFixture(
      '9.8.7',
      '@wpmoo/toolkit@9.8.7',
      'npx-version-fail',
    );

    const output = runSmoke(root, stubPath);

    expect(output).toContain('npx command failed: status=2');
    expect(output).toContain('Falling back to npm exec for this command');
    const commands = readFileSync(argsLogPath, 'utf8').trim().split('\n');
    expect(commands[0]).toBe('--yes --package @wpmoo/toolkit@9.8.7 wpmoo --version');
    expect(commands[1]).toBe('exec --yes --package @wpmoo/toolkit@9.8.7 -- wpmoo --version');
  });

  it('rejects invalid timeout configuration with a clear error', async () => {
    const { root, stubPath } = await createSmokeFixture('9.8.7', '@wpmoo/toolkit@9.8.7');

    const result = spawnSync('bash', [scriptPath.pathname], {
      cwd: root,
      env: {
        ...process.env,
        WPMOO_SMOKE_ENVIRONMENT: '0',
        WPMOO_NPX_BIN: stubPath,
        WPMOO_SMOKE_CMD_TIMEOUT_SECONDS: 'soon',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('WPMOO_SMOKE_CMD_TIMEOUT_SECONDS must be a positive integer');
  });

  it('falls back to npm exec when npx command times out', async () => {
    const { argsLogPath, root, stubPath } = await createSmokeFixture(
      '9.8.7',
      '@wpmoo/toolkit@9.8.7',
      'npx-version-timeout',
    );

    const output = runSmoke(root, stubPath, [], { WPMOO_SMOKE_CMD_TIMEOUT_SECONDS: '1' });

    expect(output).toContain('npx command timed out after 1s');
    expect(output).toContain('Falling back to npm exec for this command');
    const commands = readFileSync(argsLogPath, 'utf8').trim().split('\n');
    expect(commands).toContain('exec --yes --package @wpmoo/toolkit@9.8.7 -- wpmoo --version');
  });

  it('runs the generated environment acceptance flow when enabled', async () => {
    const { argsLogPath, root, stubPath, tmpRoot } = await createAcceptanceFixture(
      '9.8.7',
      '@wpmoo/toolkit@9.8.7',
    );

    runSmoke(root, stubPath, [], { TMPDIR: tmpRoot, WPMOO_SMOKE_ENVIRONMENT: '1' });

    const commands = readFileSync(argsLogPath, 'utf8').trim().split('\n');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo --version');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo --help');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo create --help');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo doctor --help');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo status --help');
    expect(commands.some((command) => command.includes(' wpmoo create '))).toBe(true);
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo source list');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo add-module --repo wpmoo_smoke_module --module wpmoo_smoke_extra --stage=false');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo add-module --repo wpmoo_smoke_module --module wpmoo_smoke_portal --profile portal --stage=false');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo status --json');
    expect(commands.some((command) => command.includes(' wpmoo reset --dry-run '))).toBe(true);
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo doctor --fix');
    expect(commands).toContain('moo:status --json');
    expect(commands).toContain('moo:doctor');
    expect(commands).toContain('moo:snapshot devel smoke-before');
    expect(commands).toContain('moo:restore-snapshot --dry-run smoke-before devel');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo remove-module --repo wpmoo_smoke_module --module wpmoo_smoke_extra --dry-run --stage=false');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo remove-module --repo wpmoo_smoke_module --module wpmoo_smoke_extra --deleteFiles --stage=false');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo remove-module --repo wpmoo_smoke_module --module wpmoo_smoke_portal --dry-run --stage=false');
    expect(commands).toContain('--yes --package @wpmoo/toolkit@9.8.7 wpmoo remove-module --repo wpmoo_smoke_module --module wpmoo_smoke_portal --deleteFiles --stage=false');
  });
});
