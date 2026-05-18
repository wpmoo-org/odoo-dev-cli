#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const delegateArgs = [
  'exec',
  '--yes',
  '--package',
  '@wpmoo/toolkit@latest',
  '--',
  'wpmoo',
  ...args,
];

console.error(
  '@wpmoo/odoo-dev has been renamed to @wpmoo/toolkit. Delegating to @wpmoo/toolkit@latest.',
);

if (process.env.WPMOO_ODOO_DEV_SHIM_DRY_RUN === '1') {
  console.error(`dry run: ${npmCommand} ${delegateArgs.join(' ')}`);
  process.exit(0);
}

const result = spawnSync(npmCommand, delegateArgs, {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`Failed to execute ${npmCommand}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
