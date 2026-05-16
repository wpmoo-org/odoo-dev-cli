import { access } from 'node:fs/promises';
import { basename } from 'node:path';

import { markerPath, readEnvironmentMetadata, type EnvironmentMetadata } from './environment.js';

export type ExistingEnvironmentTargetState = {
  kind: 'existing_environment';
  target: string;
  metadata: EnvironmentMetadata;
};

export type ForeignEnvironmentTargetState = {
  kind: 'foreign_target';
  target: string;
};

export type MissingEnvironmentTargetState = {
  kind: 'missing_target';
  target: string;
};

export type EnvironmentTargetState =
  | ExistingEnvironmentTargetState
  | ForeignEnvironmentTargetState
  | MissingEnvironmentTargetState;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatBackupTimestamp(date: Date): string {
  return [
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`,
    `${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}`,
  ].join('-');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function inspectEnvironmentTarget(target: string): Promise<EnvironmentTargetState> {
  if (!(await pathExists(target))) {
    return { kind: 'missing_target', target };
  }

  const metadata = await readEnvironmentMetadata(target);
  if (metadata) {
    return { kind: 'existing_environment', target, metadata };
  }

  return { kind: 'foreign_target', target };
}

export function renderExistingEnvironmentSummary(state: ExistingEnvironmentTargetState): string {
  return [
    `Existing WPMoo environment detected at ${state.target}`,
    `- Product: ${state.metadata.product}`,
    `- Odoo version: ${state.metadata.odooVersion}`,
    `- Source repos: ${state.metadata.sourceRepos.length}`,
  ].join('\n');
}

export function renderForeignEnvironmentTargetWarning(state: ForeignEnvironmentTargetState): string {
  return `Target already exists: ${state.target}\nIt does not contain a WPMoo environment marker at ${markerPath}.`;
}

export function expectedTargetConfirmation(target: string, input: string): boolean {
  return basename(target) === input;
}

export function backupTargetPath(target: string, date = new Date()): string {
  return `${target}.backup-${formatBackupTimestamp(date)}`;
}
