import type { SourceRepoType } from '../types.js';

export function stringOption(values: Record<string, string | boolean>, key: string): string | undefined {
  const value = values[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function optionalSourceTypeValue(values: Record<string, string | boolean>): SourceRepoType | undefined {
  const value = stringOption(values, 'sourceType');
  if (value === undefined) {
    return undefined;
  }

  if (value === 'private' || value === 'oca' || value === 'external') {
    return value;
  }

  throw new Error(`Invalid value for --source-type: ${value}`);
}

export function sourceTypeValue(values: Record<string, string | boolean>): SourceRepoType {
  return optionalSourceTypeValue(values) ?? 'private';
}

export function booleanOption(values: Record<string, string | boolean>, key: string, fallback: boolean): boolean {
  const value = values[key];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = value.toLowerCase().trim();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;

  throw new Error(`Invalid boolean value for --${key}: ${value}`);
}

export function jsonOption(values: Record<string, string | boolean>): boolean {
  return booleanOption(values, 'json', false);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
}
