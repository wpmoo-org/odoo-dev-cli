import { isAbsolute, relative, resolve } from 'node:path';

const windowsDrivePattern = /^[a-zA-Z]:/;
const pythonPackageNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function invalidPathError(label: string): Error {
  return new Error(`Invalid ${label}: use a single path segment without traversal.`);
}

export function validatePathSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Invalid ${label}: value is required.`);
  }

  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    normalized.includes(':') ||
    isAbsolute(normalized) ||
    windowsDrivePattern.test(normalized)
  ) {
    throw invalidPathError(label);
  }

  return normalized;
}

export function isValidPathSegment(value: string): boolean {
  try {
    validatePathSegment(value, 'path');
    return true;
  } catch {
    return false;
  }
}

export function validateRepoPath(value: string): string {
  return validatePathSegment(value, 'repo path');
}

export function validateModuleName(value: string): string {
  const moduleName = validatePathSegment(value, 'module name');
  if (!pythonPackageNamePattern.test(moduleName)) {
    throw new Error('Invalid module name: use letters, numbers, and underscores, and do not start with a number.');
  }
  return moduleName;
}

export function validateAddonName(value: string): string {
  return validatePathSegment(value, 'addon name');
}

export function pathUnderBase(base: string, segment: string, label: string): string {
  const safeSegment = validatePathSegment(segment, label);
  const resolvedBase = resolve(base);
  const destination = resolve(resolvedBase, safeSegment);
  const relativePath = relative(resolvedBase, destination);

  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw invalidPathError(label);
  }

  return destination;
}
