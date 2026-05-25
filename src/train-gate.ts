import { access, readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { execa } from 'execa';

import { runDailyAction, type DailyActionCommand } from './daily-actions.js';
import { getDoctorReport, type DoctorReport } from './doctor.js';
import { parseOdooManifest } from './module-manifest.js';
import { validateAddonName } from './path-validation.js';
import { environmentStatusJson, getEnvironmentStatus, type EnvironmentStatus } from './status.js';

export type TrainGateOptions = {
  modules: string[];
  db?: string;
  strict: boolean;
  failOnWarning: boolean;
  json: boolean;
  skipUpdate: boolean;
  changed: boolean;
  includeDependent: boolean;
};

export type TrainGateStepStatus = 'pass' | 'fail' | 'skipped';

export type TrainGateStep = {
  name: 'update' | 'test' | 'lint' | 'doctor' | 'status';
  status: TrainGateStepStatus;
  command: string;
  error?: string;
  warnings?: string[];
};

export type TrainGateResult = {
  schemaVersion: 1;
  command: 'gate';
  ok: boolean;
  outcome: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';
  target: string;
  modules: string[];
  db?: string;
  steps: TrainGateStep[];
  warnings: string[];
};

export type TrainGateDependencies = {
  runAction?: (command: DailyActionCommand, args: string[], cwd: string) => Promise<void>;
  getDoctor?: (target: string, options: { failOnWarning?: boolean }) => Promise<DoctorReport>;
  getStatus?: (target: string) => Promise<EnvironmentStatus>;
  gitChangedFiles?: (target: string) => Promise<string[]>;
};

type ParsedTrainGateArgs = Omit<TrainGateOptions, 'modules'> & {
  modules: string[];
};

type ModuleManifestInfo = {
  moduleName: string;
  path: string;
  depends: string[];
};

const sourceRoots = [
  'odoo/custom/src/private',
  'odoo/custom/src/oca',
  'odoo/custom/src/external',
  'addons',
];

function asArray(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(validateAddonName);
}

function valueAfter(argv: readonly string[], index: number, option: string): { value: string; nextIndex: number } {
  const arg = argv[index] ?? '';
  const inline = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : undefined;
  if (inline !== undefined) {
    if (!inline) throw new Error(`Missing value for ${option}`);
    return { value: inline, nextIndex: index };
  }
  const next = argv[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`Missing value for ${option}`);
  }
  return { value: next, nextIndex: index + 1 };
}

export function trainGateOptionsFromArgs(argv: string[]): ParsedTrainGateArgs {
  const positionals: string[] = [];
  const options: ParsedTrainGateArgs = {
    modules: [],
    strict: false,
    failOnWarning: false,
    json: false,
    skipUpdate: false,
    changed: false,
    includeDependent: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const key = arg.split('=', 1)[0]!;
    if (key === '--modules') {
      const parsed = valueAfter(argv, index, key);
      options.modules = asArray(parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    if (key === '--db') {
      const parsed = valueAfter(argv, index, key);
      options.db = parsed.value.trim();
      index = parsed.nextIndex;
      continue;
    }
    if (key === '--strict') {
      options.strict = true;
      options.failOnWarning = true;
      continue;
    }
    if (key === '--fail-on-warning') {
      options.failOnWarning = true;
      continue;
    }
    if (key === '--json') {
      options.json = true;
      continue;
    }
    if (key === '--skip-update') {
      options.skipUpdate = true;
      continue;
    }
    if (key === '--changed') {
      options.changed = true;
      continue;
    }
    if (key === '--include-dependent') {
      options.includeDependent = true;
      continue;
    }
    throw new Error(`Unknown option for gate: ${arg}`);
  }

  if (options.modules.length === 0 && positionals[0]) {
    options.modules = asArray(positionals[0]);
  }
  if (!options.db && positionals[1]) {
    options.db = positionals[1].trim();
  }
  if (positionals.length > 2) {
    throw new Error('Usage: wpmoo gate --modules <module[,module]> [--db <database>]');
  }

  return options;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function findAddonRootForFile(target: string, relativePath: string): Promise<string | undefined> {
  let current = resolve(target, relativePath);
  if (!(await isDirectory(current))) {
    current = dirname(current);
  }
  const root = resolve(target);

  while (current.startsWith(root)) {
    if (await pathExists(join(current, '__manifest__.py'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return undefined;
}

async function defaultGitChangedFiles(target: string): Promise<string[]> {
  try {
    const result = await execa('git', ['diff', '--name-only', 'HEAD', '--'], { cwd: target });
    const staged = await execa('git', ['diff', '--name-only', '--cached', '--'], { cwd: target });
    return [...result.stdout.split(/\r?\n/u), ...staged.stdout.split(/\r?\n/u)].filter(Boolean);
  } catch {
    return [];
  }
}

async function changedModules(target: string, gitChangedFiles: (target: string) => Promise<string[]>): Promise<string[]> {
  const modules = new Set<string>();
  for (const file of await gitChangedFiles(target)) {
    const addonRoot = await findAddonRootForFile(target, file);
    if (addonRoot) {
      modules.add(basename(addonRoot));
    }
  }
  return [...modules].sort();
}

async function discoverModuleManifests(target: string): Promise<ModuleManifestInfo[]> {
  const roots = sourceRoots.map((sourceRoot) => join(target, sourceRoot));
  const stack = [...roots];
  const modules: ModuleManifestInfo[] = [];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!(await isDirectory(current))) continue;
    const entries = await readdir(current, { withFileTypes: true });
    const hasManifest = entries.some((entry) => entry.isFile() && entry.name === '__manifest__.py');
    if (hasManifest) {
      const moduleName = basename(current);
      const manifest = parseOdooManifest(await readFile(join(current, '__manifest__.py'), 'utf8'));
      const depends = manifest.ok && Array.isArray(manifest.manifest.depends) ? manifest.manifest.depends : [];
      modules.push({ moduleName, path: relative(target, current), depends });
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        stack.push(join(current, entry.name));
      }
    }
  }

  return modules;
}

async function includeDependentModules(target: string, modules: string[]): Promise<string[]> {
  const selected = new Set(modules);
  const manifests = await discoverModuleManifests(target);
  let changed = true;

  while (changed) {
    changed = false;
    for (const manifest of manifests) {
      if (selected.has(manifest.moduleName)) continue;
      if (manifest.depends.some((dependency) => selected.has(dependency))) {
        selected.add(manifest.moduleName);
        changed = true;
      }
    }
  }

  return [...selected].sort();
}

export async function resolveTrainGateModules(
  target: string,
  options: Pick<TrainGateOptions, 'modules' | 'changed' | 'includeDependent'>,
  gitChangedFiles: (target: string) => Promise<string[]> = defaultGitChangedFiles,
): Promise<string[]> {
  let modules = [...options.modules];
  if (modules.length === 0 && options.changed) {
    modules = await changedModules(target, gitChangedFiles);
  }
  modules = [...new Set(modules.map(validateAddonName))].sort();
  if (modules.length === 0) {
    throw new Error('Usage: wpmoo gate --modules <module[,module]> [--db <database>]');
  }
  return options.includeDependent ? includeDependentModules(target, modules) : modules;
}

function commandText(command: string, args: readonly string[]): string {
  return ['./moo', command, ...args].join(' ');
}

function actionArgs(command: 'update' | 'test', modules: string[], db: string | undefined): string[] {
  const moduleArg = modules.join(',');
  if (command === 'update') {
    return db ? [moduleArg, db] : [moduleArg];
  }
  return db ? [moduleArg, '--db', db] : [moduleArg];
}

function skippedStep(name: TrainGateStep['name']): TrainGateStep {
  return { name, status: 'skipped', command: name };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runTrainGate(
  target: string,
  options: TrainGateOptions,
  dependencies: TrainGateDependencies = {},
): Promise<TrainGateResult> {
  const runAction = dependencies.runAction ?? runDailyAction;
  const getDoctor = dependencies.getDoctor ?? getDoctorReport;
  const getStatus = dependencies.getStatus ?? getEnvironmentStatus;
  const modules = await resolveTrainGateModules(target, options, dependencies.gitChangedFiles ?? defaultGitChangedFiles);
  const steps: TrainGateStep[] = [];
  const warnings: string[] = [];
  let failed = false;

  async function runStep(name: 'update' | 'test' | 'lint', args: string[]): Promise<void> {
    if (failed) {
      steps.push(skippedStep(name));
      return;
    }
    try {
      await runAction(name, args, target);
      steps.push({ name, status: 'pass', command: commandText(name, args) });
    } catch (error) {
      failed = true;
      steps.push({ name, status: 'fail', command: commandText(name, args), error: errorMessage(error) });
    }
  }

  if (!options.skipUpdate) {
    await runStep('update', actionArgs('update', modules, options.db));
  } else {
    steps.push({ name: 'update', status: 'skipped', command: './moo update' });
  }
  await runStep('test', actionArgs('test', modules, options.db));
  await runStep('lint', []);

  if (!failed) {
    try {
      const doctor = await getDoctor(target, { failOnWarning: options.failOnWarning || options.strict });
      warnings.push(...doctor.warnings);
      steps.push({
        name: 'doctor',
        status: doctor.ok ? 'pass' : 'fail',
        command: './moo doctor',
        warnings: doctor.warnings,
        ...(doctor.ok ? {} : { error: doctor.errors.join('; ') || 'doctor failed' }),
      });
      if (!doctor.ok) failed = true;
    } catch (error) {
      failed = true;
      steps.push({ name: 'doctor', status: 'fail', command: './moo doctor', error: errorMessage(error) });
    }
  } else {
    steps.push(skippedStep('doctor'));
  }

  if (!failed) {
    const status = await getStatus(target);
    const payload = environmentStatusJson(status);
    if (status.kind === 'environment') {
      warnings.push(
        ...status.moduleQuality.issues
          .filter((issue) => issue.severity !== 'error')
          .map((issue) => `${issue.path}: ${issue.issue}`),
      );
    }
    steps.push({
      name: 'status',
      status: payload.ok ? 'pass' : 'fail',
      command: './moo status --json',
      ...(payload.ok ? {} : { error: 'status --json reported ok=false' }),
    });
    if (!payload.ok) failed = true;
  } else {
    steps.push(skippedStep('status'));
  }

  const strictWarningsFail = (options.strict || options.failOnWarning) && warnings.length > 0;
  const outcome = failed || strictWarningsFail ? 'FAIL' : warnings.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';

  return {
    schemaVersion: 1,
    command: 'gate',
    ok: outcome !== 'FAIL',
    outcome,
    target,
    modules,
    ...(options.db ? { db: options.db } : {}),
    steps,
    warnings,
  };
}

export function renderTrainGateSummary(result: TrainGateResult): string {
  const lines = ['Gate summary', '', `Modules: ${result.modules.join(', ')}`];
  if (result.db) lines.push(`Database: ${result.db}`);
  lines.push('');
  for (const step of result.steps) {
    const label = step.status === 'pass' ? 'pass' : step.status === 'fail' ? 'fail' : 'skipped';
    lines.push(`${step.name[0]!.toUpperCase()}${step.name.slice(1)}: ${label}`);
    if (step.error) lines.push(`  ${step.error}`);
  }
  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push('', `Result: ${result.outcome}`);
  return lines.join('\n');
}
