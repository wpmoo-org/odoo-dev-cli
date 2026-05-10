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

export function packageName(): string {
  return readPackageJson().name;
}

export function renderVersionTag(latestVersion?: string): string {
  const current = packageVersion();
  const updateSuffix = latestVersion ? ` -> v.${latestVersion} available` : '';

  return `\u001B[33mv.${current}${updateSuffix}\u001B[0m`;
}
