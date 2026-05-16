#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const checkOnly = process.argv.includes('--check');
const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));

if (rootPackage.name !== '@wpmoo/toolkit') {
  console.error(`Expected root package name @wpmoo/toolkit, got ${rootPackage.name}`);
  process.exit(1);
}

const aliasPackages = [
  'packages/wpmoo/package.json',
  'packages/odoo-compat/package.json',
  'packages/odoo-dev-compat/package.json',
];

const changed = [];

for (const path of aliasPackages) {
  const original = readFileSync(path, 'utf8');
  const packageJson = JSON.parse(original);

  packageJson.version = rootPackage.version;
  packageJson.dependencies = {
    ...packageJson.dependencies,
    '@wpmoo/toolkit': rootPackage.version,
  };

  const next = `${JSON.stringify(packageJson, null, 2)}\n`;
  if (next !== original) {
    changed.push(path);
    if (!checkOnly) {
      writeFileSync(path, next);
    }
  }
}

if (checkOnly && changed.length > 0) {
  console.error(`Alias package metadata is out of sync: ${changed.join(', ')}`);
  process.exit(1);
}
