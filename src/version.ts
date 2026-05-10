import { readFileSync } from 'node:fs';

type PackageJson = {
  name: string;
  version: string;
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageJson;
}

export function packageVersion(): string {
  return readPackageJson().version;
}

export function renderVersion(): string {
  const packageJson = readPackageJson();
  return `${packageJson.name} ${packageJson.version}`;
}

export function renderVersionTag(): string {
  return `\u001B[33m v.${packageVersion()}\u001B[0m`;
}
