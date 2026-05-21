import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

import { renderDoctorScript, renderMooDelegationScript, renderStatusScript } from '../src/templates.js';
import { packageName, packageVersion } from '../src/version.js';

const expectedFallbackPackageSpec = `${packageName()}@${packageVersion()}`;

const dailyScripts = [
  'up.sh',
  'down.sh',
  'logs.sh',
  'restart.sh',
  'shell.sh',
  'psql.sh',
  'install.sh',
  'update.sh',
  'test.sh',
  'resetdb.sh',
  'snapshot.sh',
  'restore-snapshot.sh',
  'lint.sh',
  'pot.sh',
  'status.sh',
];

async function createMooFixture(options: { includeDoctorScript?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'wpmoo-generated-moo-'));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'bin'), { recursive: true });
  await writeFile(join(root, 'moo'), renderMooDelegationScript(), 'utf8');
  await chmod(join(root, 'moo'), 0o755);

  const callsPath = join(root, 'calls.log');
  await writeFile(callsPath, '', 'utf8');
  for (const scriptName of dailyScripts) {
    const scriptPath = join(root, 'scripts', scriptName);
    await writeFile(
      scriptPath,
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\\n' "$(basename "$0")" "$*" >> "${callsPath}"
`,
      'utf8',
    );
    await chmod(scriptPath, 0o755);
  }

  if (options.includeDoctorScript) {
    const doctorScriptPath = join(root, 'scripts', 'doctor.sh');
    await writeFile(doctorScriptPath, renderDoctorScript(), 'utf8');
    await chmod(doctorScriptPath, 0o755);
  }

  await writeFile(
    join(root, 'bin', 'npx'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'npx|%s\\n' "$*" >> "${callsPath}"
`,
    'utf8',
  );
  await chmod(join(root, 'bin', 'npx'), 0o755);

  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH ?? ''}` };
  delete env.WPMOO_ENV;
  delete env.WPMOO_ALLOW_DESTRUCTIVE;
  delete env.WPMOO_ALLOW_PROD_LIFECYCLE;
  return { callsPath, env, root };
}

describe('generated environment moo delegation matrix', () => {
  it('delegates daily commands and arguments to local scripts', async () => {
    const { callsPath, env, root } = await createMooFixture();

    await execa(join(root, 'moo'), ['start'], { cwd: root, env });
    await execa(join(root, 'moo'), ['logs'], { cwd: root, env });
    await execa(join(root, 'moo'), ['logs', 'db'], { cwd: root, env });
    await execa(join(root, 'moo'), ['logs', 'odoo', '200'], { cwd: root, env });
    await execa(join(root, 'moo'), ['test', 'sale', '--db', 'devel', '--mode', 'update', '--tags', '/sale'], {
      cwd: root,
      env,
    });
    await execa(join(root, 'moo'), ['restore-snapshot', 'snap1', 'devel'], { cwd: root, env });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe(
      [
        'up.sh|',
        'logs.sh|odoo',
        'logs.sh|db',
        'logs.sh|odoo 200',
        'test.sh|sale --db devel --mode update --tags /sale',
        'restore-snapshot.sh|snap1 devel',
        '',
      ].join('\n'),
    );
  }, 15000);

  it('falls back to package command for doctor', async () => {
    const { callsPath, env, root } = await createMooFixture();

    await execa(join(root, 'moo'), ['doctor'], { cwd: root, env });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe(`npx|--yes ${expectedFallbackPackageSpec} doctor\n`);
  });

  it('prefers local doctor script when available', async () => {
    const { callsPath, env, root } = await createMooFixture({ includeDoctorScript: true });

    const result = await execa(join(root, 'moo'), ['doctor'], { cwd: root, env });

    expect(result.stdout).toContain('WPMoo doctor');
    await expect(readFile(callsPath, 'utf8')).resolves.toBe('');
  });

  it('falls back to package command for doctor when local script is not available offline-safe checks', async () => {
    const { callsPath, env, root } = await createMooFixture();
    await writeFile(
      join(root, 'bin', 'docker'),
      `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "${callsPath}"
exit 1
`,
      'utf8',
    );
    await chmod(join(root, 'bin', 'docker'), 0o755);

    await execa(join(root, 'moo'), ['doctor', '--help'], { cwd: root, env });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe(`npx|--yes ${expectedFallbackPackageSpec} doctor --help\n`);
  });

  it('runs local doctor checks without Docker', async () => {
    const { callsPath, env, root } = await createMooFixture({ includeDoctorScript: true });
    await writeFile(
      join(root, 'bin', 'docker'),
      `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "${callsPath}"
exit 1
`,
      'utf8',
    );

    await chmod(join(root, 'bin', 'docker'), 0o755);

    const result = await execa(join(root, 'moo'), ['doctor'], { cwd: root, env });

    expect(result.stdout).toContain('Doctor checks passed.');
    await expect(readFile(callsPath, 'utf8')).resolves.not.toContain('docker ');
  });

  it('runs status locally when the generated status script exists', async () => {
    const { callsPath, env, root } = await createMooFixture();

    await execa(join(root, 'moo'), ['status'], { cwd: root, env });
    await execa(join(root, 'moo'), ['status', '--json'], { cwd: root, env });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe('status.sh|\nstatus.sh|--json\n');
  });

  it('falls back to package status when the generated status script is missing', async () => {
    const { callsPath, env, root } = await createMooFixture();
    await rm(join(root, 'scripts/status.sh'), { force: true });

    await execa(join(root, 'moo'), ['status', '--json'], { cwd: root, env });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe(
      `npx|--yes ${expectedFallbackPackageSpec} status --json\n`,
    );
  });

  it('delegates doctor help to the package fallback command', async () => {
    const { callsPath, env, root } = await createMooFixture();

    await execa(join(root, 'moo'), ['doctor', '--help'], { cwd: root, env });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe(`npx|--yes ${expectedFallbackPackageSpec} doctor --help\n`);
  });

  it('reports local environment status text output without docker', async () => {
    const { callsPath, env, root } = await createMooFixture();
    await writeFile(join(root, 'scripts/status.sh'), renderStatusScript(), 'utf8');
    await chmod(join(root, 'scripts/status.sh'), 0o755);
    await writeFile(callsPath, '', 'utf8');

    await writeFile(
      join(root, 'bin', 'docker'),
      `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "${callsPath}"
exit 1
`,
      'utf8',
    );
    await writeFile(
      join(root, 'bin', 'docker-compose'),
      `#!/usr/bin/env bash
printf 'docker-compose %s\\n' "$*" >> "${callsPath}"
exit 1
`,
      'utf8',
    );

    await chmod(join(root, 'bin', 'docker'), 0o755);
    await chmod(join(root, 'bin', 'docker-compose'), 0o755);

    const result = await execa(join(root, 'moo'), ['status'], { cwd: root, env });

    expect(result.stdout).toContain('Status:');
    expect(result.stdout).toContain('Metadata:');
    expect(result.stdout).toContain('.wpmoo/odoo.json');
    await expect(readFile(callsPath, 'utf8')).resolves.not.toContain('docker-compose');
    await expect(readFile(callsPath, 'utf8')).resolves.not.toContain('docker ');
    await expect(readFile(callsPath, 'utf8')).resolves.not.toContain('npx');
  });

  it('prints generated command help without falling back to npx', async () => {
    const { callsPath, env, root } = await createMooFixture();

    const result = await execa(join(root, 'moo'), ['--help'], { cwd: root, env });

    expect(result.stdout).toContain('Usage: ./moo <command> [args]');
    expect(result.stdout).toContain('Daily commands:');
    expect(result.stdout).toContain('start, stop, logs, restart, shell, psql');
    expect(result.stdout).toContain('install, update, test, resetdb, snapshot, restore-snapshot, lint, pot');
    expect(result.stdout).toContain('Management commands:');
    expect(result.stdout).toContain('source, add-repo, remove-repo, add-module, remove-module, reset, doctor');
    expect(result.stdout).toContain('Local diagnostics:');
    expect(result.stdout).toContain('status [--json]');
    await expect(readFile(callsPath, 'utf8')).resolves.toBe('');
  });

  it('rejects unsupported generated commands with a local help hint', async () => {
    const { callsPath, env, root } = await createMooFixture();

    const result = await execa(join(root, 'moo'), ['not-a-command'], { cwd: root, env, reject: false });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Unknown ./moo command: not-a-command');
    expect(result.stderr).toContain('Run ./moo --help to see supported commands.');
    await expect(readFile(callsPath, 'utf8')).resolves.toBe('');
  });

  it('blocks destructive commands in stage and prod unless explicitly allowed', async () => {
    const { callsPath, env, root } = await createMooFixture();
    await writeFile(join(root, '.env'), 'WPMOO_ENV=stage\n');

    const resetResult = await execa(join(root, 'moo'), ['resetdb', 'devel'], { cwd: root, env, reject: false });
    const restoreResult = await execa(join(root, 'moo'), ['restore-snapshot', 'snap1', 'devel'], {
      cwd: root,
      env,
      reject: false,
    });
    const dryRunResult = await execa(join(root, 'moo'), ['restore-snapshot', '--dry-run', 'snap1', 'devel'], {
      cwd: root,
      env,
      reject: false,
    });

    expect(resetResult.exitCode).toBe(1);
    expect(resetResult.stderr).toContain(
      "Refusing destructive command 'resetdb' in WPMOO_ENV=stage. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.",
    );
    expect(restoreResult.exitCode).toBe(1);
    expect(restoreResult.stderr).toContain(
      "Refusing destructive command 'restore-snapshot' in WPMOO_ENV=stage. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally.",
    );
    expect(dryRunResult.exitCode).toBe(0);
    await expect(readFile(callsPath, 'utf8')).resolves.toBe('restore-snapshot.sh|--dry-run snap1 devel\n');

    await writeFile(join(root, '.env'), 'WPMOO_ENV=prod\nWPMOO_ALLOW_DESTRUCTIVE=1\n');
    await execa(join(root, 'moo'), ['resetdb', 'devel'], { cwd: root, env });
    await expect(readFile(callsPath, 'utf8')).resolves.toBe(
      'restore-snapshot.sh|--dry-run snap1 devel\nresetdb.sh|devel\n',
    );
  }, 15000);

  it('blocks production module lifecycle commands unless explicitly allowed', async () => {
    const { callsPath, env, root } = await createMooFixture();
    await writeFile(join(root, '.env'), 'WPMOO_ENV=prod\n');

    for (const [command, args] of [
      ['install', ['sale', 'devel']],
      ['update', ['sale', 'devel']],
      ['test', ['sale', '--db', 'devel', '--mode', 'update']],
    ] as const) {
      const result = await execa(join(root, 'moo'), [command, ...args], { cwd: root, env, reject: false });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        `Refusing production lifecycle command '${command}' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally.`,
      );
    }

    await writeFile(join(root, '.env'), 'WPMOO_ENV=stage\n');
    for (const [command, args] of [
      ['install', ['sale', 'devel']],
      ['update', ['sale', 'devel']],
    ] as const) {
      const result = await execa(join(root, 'moo'), [command, ...args], { cwd: root, env, reject: false });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        `Refusing stage lifecycle command '${command}' in WPMOO_ENV=stage. Set WPMOO_ALLOW_STAGE_LIFECYCLE=1 to run it intentionally.`,
      );
    }
    await execa(join(root, 'moo'), ['test', 'sale', '--db', 'devel', '--mode', 'update'], { cwd: root, env });
    await execa(join(root, 'moo'), ['snapshot', 'devel', 'before-update'], { cwd: root, env });
    await execa(join(root, 'moo'), ['lint'], { cwd: root, env });
    await execa(join(root, 'moo'), ['pot', 'sale', 'devel', 'i18n/sale.pot'], { cwd: root, env });

    await writeFile(join(root, '.env'), 'WPMOO_ENV=stage\nWPMOO_ALLOW_STAGE_LIFECYCLE=1\n');
    await execa(join(root, 'moo'), ['install', 'sale', 'devel'], { cwd: root, env });
    await execa(join(root, 'moo'), ['update', 'sale', 'devel'], { cwd: root, env });

    await writeFile(join(root, '.env'), 'WPMOO_ENV=prod\nWPMOO_ALLOW_PROD_LIFECYCLE=1\n');
    await execa(join(root, 'moo'), ['install', 'sale', 'devel'], { cwd: root, env });
    await execa(join(root, 'moo'), ['update', 'sale', 'devel'], { cwd: root, env });
    await execa(join(root, 'moo'), ['test', 'sale'], { cwd: root, env });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe(
      [
        'test.sh|sale --db devel --mode update',
        'snapshot.sh|devel before-update',
        'lint.sh|',
        'pot.sh|sale devel i18n/sale.pot',
        'install.sh|sale devel',
        'update.sh|sale devel',
        'install.sh|sale devel',
        'update.sh|sale devel',
        'test.sh|sale',
        '',
      ].join('\n'),
    );
  }, 15000);

  it('prefers process environment production lifecycle flags over .env values', async () => {
    const { callsPath, env, root } = await createMooFixture();
    await writeFile(join(root, '.env'), 'WPMOO_ENV=stage\n');

    const blockedEnv = { ...env, WPMOO_ENV: 'prod' };
    const blockedResult = await execa(join(root, 'moo'), ['install', 'sale'], {
      cwd: root,
      env: blockedEnv,
      reject: false,
    });
    expect(blockedResult.exitCode).toBe(1);
    expect(blockedResult.stderr).toContain(
      "Refusing production lifecycle command 'install' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally.",
    );

    const allowedEnv = { ...env, WPMOO_ENV: 'prod', WPMOO_ALLOW_PROD_LIFECYCLE: '1' };
    await execa(join(root, 'moo'), ['install', 'sale'], { cwd: root, env: allowedEnv });

    await expect(readFile(callsPath, 'utf8')).resolves.toBe('install.sh|sale\n');
  }, 15000);

  it('exits with usage error code 2 for invalid command usage', async () => {
    const { env, root } = await createMooFixture();

    const result = await execa(join(root, 'moo'), ['start', 'extra'], { cwd: root, env, reject: false });
    const invalidLogsTail = await execa(join(root, 'moo'), ['logs', 'odoo', 'abc'], {
      cwd: root,
      env,
      reject: false,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Usage: ./moo start');
    expect(invalidLogsTail.exitCode).toBe(2);
    expect(invalidLogsTail.stderr).toContain('Invalid logs tail count: expected a positive integer.');
  });

  it('exits with code 1 when a required daily action script is missing', async () => {
    const { env, root } = await createMooFixture();
    await rm(join(root, 'scripts', 'logs.sh'));

    const result = await execa(join(root, 'moo'), ['logs'], { cwd: root, env, reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing daily action script: scripts/logs.sh');
  });
});
