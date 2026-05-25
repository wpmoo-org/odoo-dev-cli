import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { parseOdooManifest, type OdooManifest } from './module-manifest.js';

export type ModuleQualityIssue = {
  moduleName: string;
  path: string;
  issue: string;
  severity?: 'error' | 'warning';
};

export type ModuleDependencyGraph = {
  dependencies: Array<{
    moduleName: string;
    dependency: string;
    kind: 'local' | 'external' | 'unresolved';
  }>;
  missingDependencies: Array<{
    moduleName: string;
    dependency: string;
  }>;
  cycles: string[][];
};

export type ModuleQualitySummary = {
  totalModules: number;
  installableModules: number;
  nonInstallableModules: number;
  modulesWithMenuActions: number;
  modulesMissingMenuActions: number;
  dependencyGraph?: ModuleDependencyGraph;
  issues: ModuleQualityIssue[];
};

export type ModuleQualityResult = {
  moduleName: string;
  relativePath: string;
  installable: boolean;
  hasMenuAction: boolean;
  depends: string[];
  manifest?: OdooManifest;
  issues: ModuleQualityIssue[];
};

export function emptyModuleQualitySummary(): ModuleQualitySummary {
  return {
    totalModules: 0,
    installableModules: 0,
    nonInstallableModules: 0,
    modulesWithMenuActions: 0,
    modulesMissingMenuActions: 0,
    issues: [],
  };
}

export function isInstallableManifest(content: string): boolean {
  const parsed = parseOdooManifest(content);
  return parsed.ok && parsed.manifest.installable !== false;
}

function normalizedActionRef(value: string): string {
  const dynamicRef = value.trim().match(/^%\((.*?)\)d$/u)?.[1];
  const ref = dynamicRef ?? value.trim();
  return ref.includes('.') ? (ref.split('.').pop() ?? ref) : ref;
}

function isExternalActionRef(value: string, moduleName: string): boolean {
  const dynamicRef = value.trim().match(/^%\((.*?)\)d$/u)?.[1];
  const ref = dynamicRef ?? value.trim();
  if (!ref.includes('.')) return false;
  return !ref.startsWith(`${moduleName}.`);
}

function hasActionableMenuXmlFiles(xmlFiles: readonly string[], moduleName: string): boolean {
  const actionIds = declaredActionIds(xmlFiles);
  return menuActionReferences(xmlFiles).some((actionRef) => {
    return actionIds.has(normalizedActionRef(actionRef)) || isExternalActionRef(actionRef, moduleName);
  });
}

export function hasActionableMenuXml(content: string, moduleName: string): boolean {
  return hasActionableMenuXmlFiles([content], moduleName);
}

async function readMenusXml(modulePath: string): Promise<string[]> {
  try {
    const entries = await readdir(join(modulePath, 'views'), { withFileTypes: true });
    const menuFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('_menus.xml'))
      .map((entry) => join(modulePath, 'views', entry.name));
    return Promise.all(menuFiles.map((path) => readFile(path, 'utf8')));
  } catch {
    return [];
  }
}

async function readPythonModelFiles(modulePath: string): Promise<string[]> {
  try {
    const entries = await readdir(join(modulePath, 'models'), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.py') && entry.name !== '__init__.py')
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function readViewXmlFiles(modulePath: string): Promise<string[]> {
  try {
    const entries = await readdir(join(modulePath, 'views'), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.xml') && !entry.name.endsWith('_menus.xml'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function readManifestXmlFiles(modulePath: string, entries: readonly string[]): Promise<string[]> {
  const paths = Array.from(new Set(entries.filter((entry) => entry.endsWith('.xml')).map((entry) => join(modulePath, entry))));
  const contents = await Promise.all(paths.map((path) => readOptionalFile(path)));
  return contents.filter((content): content is string => content !== undefined);
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

function moduleIssue(moduleName: string, path: string, issue: string): ModuleQualityIssue {
  return { moduleName, path, issue };
}

function moduleQualityIssue(
  moduleName: string,
  path: string,
  issue: string,
  severity: NonNullable<ModuleQualityIssue['severity']>,
): ModuleQualityIssue {
  return { moduleName, path, issue, severity };
}

function manifestData(manifest: OdooManifest | undefined): string[] {
  return Array.isArray(manifest?.data) ? manifest.data : [];
}

function manifestDemo(manifest: OdooManifest | undefined): string[] {
  return Array.isArray(manifest?.demo) ? manifest.demo : [];
}

function manifestDepends(manifest: OdooManifest | undefined): string[] {
  return Array.isArray(manifest?.depends) ? manifest.depends : [];
}

function dataIncludesAccessCsv(data: readonly string[]): boolean {
  return data.includes('security/ir.model.access.csv');
}

function dataIncludesViewXml(data: readonly string[]): boolean {
  return data.some((entry) => entry.endsWith('.xml'));
}

function moduleHasOdooStructures(modelFiles: readonly string[], viewFiles: readonly string[], menuXml: readonly string[], data: readonly string[]): boolean {
  return (
    modelFiles.length > 0 ||
    viewFiles.length > 0 ||
    menuXml.length > 0 ||
    data.some((entry) => entry.startsWith('security/') || entry.endsWith('.xml'))
  );
}

function pythonImportPresent(content: string | undefined, importName: string): boolean {
  if (!content) return false;
  return new RegExp(`^\\s*from\\s+\\.\\s+import\\s+.*\\b${importName}\\b`, 'mu').test(content);
}

function xmlAttributeValues(content: string, attributeName: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`\\b${attributeName}=(["'])(.*?)\\1`, 'gsu');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    const value = match[2]?.trim();
    if (value) values.push(value);
  }
  return values;
}

function declaredActionIds(xmlFiles: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const content of xmlFiles) {
    for (const record of content.matchAll(/<record\b[^>]*\bmodel=(["'])ir\.actions\.act_window\1[^>]*>/gsu)) {
      for (const id of xmlAttributeValues(record[0], 'id')) {
        ids.add(id);
      }
    }
  }
  return ids;
}

function menuActionReferences(xmlFiles: readonly string[]): string[] {
  const refs: string[] = [];
  for (const content of xmlFiles) {
    for (const menu of content.matchAll(/<menuitem\b[^>]*>/gsu)) {
      refs.push(...xmlAttributeValues(menu[0], 'action'));
    }
  }
  return refs;
}

function declaredModelIds(modelFileContents: readonly string[]): Set<string> {
  const modelIds = new Set<string>();
  for (const content of modelFileContents) {
    for (const match of content.matchAll(/^\s*_name\s*=\s*["']([^"']+)["']/gmu)) {
      const modelName = match[1]?.trim();
      if (modelName) {
        modelIds.add(`model_${modelName.replace(/\./gu, '_')}`);
      }
    }
  }
  return modelIds;
}

function declaredModelNames(modelFileContents: readonly string[]): Set<string> {
  const modelNames = new Set<string>();
  for (const content of modelFileContents) {
    for (const match of content.matchAll(/^\s*_name\s*=\s*["']([^"']+)["']/gmu)) {
      const modelName = match[1]?.trim();
      if (modelName) {
        modelNames.add(modelName);
      }
    }
    for (const match of content.matchAll(/^\s*_inherit\s*=\s*["']([^"']+)["']/gmu)) {
      const modelName = match[1]?.trim();
      if (modelName) {
        modelNames.add(modelName);
      }
    }
  }
  return modelNames;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function xmlRecordFieldValues(xmlFiles: readonly string[], recordModel: string, fieldName: string): string[] {
  const values: string[] = [];
  const recordPattern = new RegExp(
    `<record\\b[^>]*\\bmodel=(["'])${escapeRegExp(recordModel)}\\1[^>]*>(.*?)</record>`,
    'gsu',
  );
  const fieldPattern = new RegExp(
    `<field\\b[^>]*\\bname=(["'])${escapeRegExp(fieldName)}\\1[^>]*>(.*?)</field>`,
    'gsu',
  );

  for (const content of xmlFiles) {
    let recordMatch: RegExpExecArray | null;
    while ((recordMatch = recordPattern.exec(content))) {
      const body = recordMatch[2] ?? '';
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = fieldPattern.exec(body))) {
        const value = fieldMatch[2]?.replace(/<[^>]+>/gu, '').trim();
        if (value) {
          values.push(value);
        }
      }
    }
  }

  return values;
}

function looksLikePlainModelName(value: string): boolean {
  return /^[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)+$/u.test(value);
}

function accessCsvModelIds(content: string | undefined): string[] {
  if (!content) return [];
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (lines.length < 2) return [];

  const header = lines[0]?.split(',').map((value) => value.trim()) ?? [];
  const modelColumn = header.findIndex((value) => value === 'model_id:id' || value === 'model_id');
  if (modelColumn < 0) return [];

  return lines
    .slice(1)
    .map((line) => line.split(',')[modelColumn]?.trim())
    .filter((value): value is string => Boolean(value));
}

async function readModelFileContents(modulePath: string, modelFiles: readonly string[]): Promise<string[]> {
  return Promise.all(
    modelFiles.map(async (fileName) => (await readOptionalFile(join(modulePath, 'models', fileName))) ?? ''),
  );
}

export async function analyzeModuleDirectory(
  modulePath: string,
  moduleName = basename(modulePath),
  relativePath = modulePath,
): Promise<ModuleQualityResult> {
  const issues: ModuleQualityIssue[] = [];
  let manifest: OdooManifest | undefined;
  let installable = false;
  const manifestContent = await readOptionalFile(join(modulePath, '__manifest__.py'));
  if (!manifestContent) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing __manifest__.py'));
  } else {
    const parsedManifest = parseOdooManifest(manifestContent);
    if (parsedManifest.ok) {
      manifest = parsedManifest.manifest;
      installable = manifest.installable !== false;
    } else {
      issues.push(moduleIssue(moduleName, relativePath, `invalid manifest syntax: ${parsedManifest.error}`));
    }
  }

  if (manifest?.installable === false) {
    issues.push(moduleIssue(moduleName, relativePath, 'installable is false in __manifest__.py'));
  }

  if (manifest && !manifest.license) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing license in __manifest__.py'));
  }
  if (manifest && manifest.depends === undefined) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing depends in __manifest__.py'));
  }

  const menuXml = await readMenusXml(modulePath);
  const modelFiles = await readPythonModelFiles(modulePath);
  const viewFiles = await readViewXmlFiles(modulePath);
  const viewXml = await Promise.all(viewFiles.map(async (fileName) => (await readOptionalFile(join(modulePath, 'views', fileName))) ?? ''));
  const depends = manifestDepends(manifest);
  const data = manifestData(manifest);
  const demo = manifestDemo(manifest);
  const manifestXml = await readManifestXmlFiles(modulePath, [...data, ...demo]);
  const allViewXml = [...viewXml, ...menuXml, ...manifestXml];
  const hasOdooStructures = moduleHasOdooStructures(modelFiles, viewFiles, menuXml, data);

  for (const entry of data) {
    if (!(await fileExists(join(modulePath, entry)))) {
      issues.push(moduleQualityIssue(moduleName, relativePath, `missing manifest data file: ${entry}`, 'error'));
    }
  }
  for (const entry of demo) {
    if (!(await fileExists(join(modulePath, entry)))) {
      issues.push(moduleQualityIssue(moduleName, relativePath, `missing manifest demo file: ${entry}`, 'warning'));
    }
  }

  if (hasOdooStructures && !depends.includes('base')) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing base dependency for model-based module'));
  }

  if (modelFiles.length > 0) {
    const rootInit = await readOptionalFile(join(modulePath, '__init__.py'));
    if (!pythonImportPresent(rootInit, 'models')) {
      issues.push(moduleIssue(moduleName, relativePath, 'missing __init__.py models import'));
    }

    const modelsInit = await readOptionalFile(join(modulePath, 'models/__init__.py'));
    const missingModelImport = modelFiles
      .map((fileName) => fileName.replace(/\.py$/u, ''))
      .some((modelImport) => !pythonImportPresent(modelsInit, modelImport));
    if (missingModelImport) {
      issues.push(moduleIssue(moduleName, relativePath, 'missing models/__init__.py model import'));
    }

    if (!(await fileExists(join(modulePath, 'security/ir.model.access.csv')))) {
      issues.push(moduleIssue(moduleName, relativePath, 'missing security/ir.model.access.csv'));
    }
  }

  const modelFileContents = await readModelFileContents(modulePath, modelFiles);
  const modelIds = declaredModelIds(modelFileContents);
  const modelNames = declaredModelNames(modelFileContents);
  if (modelIds.size > 0) {
    for (const modelId of accessCsvModelIds(await readOptionalFile(join(modulePath, 'security/ir.model.access.csv')))) {
      if (!modelIds.has(modelId)) {
        issues.push(moduleQualityIssue(moduleName, relativePath, `access CSV references unknown model id: ${modelId}`, 'error'));
      }
    }
  }

  if (modelNames.size > 0) {
    for (const modelName of new Set(xmlRecordFieldValues(viewXml, 'ir.ui.view', 'model'))) {
      if (looksLikePlainModelName(modelName) && !modelNames.has(modelName)) {
        issues.push(moduleQualityIssue(moduleName, relativePath, `view XML references unknown model name: ${modelName}`, 'error'));
      }
    }
    for (const modelName of new Set(xmlRecordFieldValues(allViewXml, 'ir.actions.act_window', 'res_model'))) {
      if (looksLikePlainModelName(modelName) && !modelNames.has(modelName)) {
        issues.push(moduleQualityIssue(moduleName, relativePath, `action XML references unknown res_model: ${modelName}`, 'error'));
      }
    }
  }

  if (hasOdooStructures && !dataIncludesAccessCsv(data)) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing security/ir.model.access.csv in manifest data'));
  }

  if (hasOdooStructures && viewFiles.length === 0 && !dataIncludesViewXml(data)) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing views XML under views/'));
  }

  if (!(await directoryExists(join(modulePath, 'tests')))) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing tests directory'));
  }

  const actionIds = declaredActionIds(allViewXml);
  for (const actionRef of menuActionReferences(allViewXml)) {
    if (!isExternalActionRef(actionRef, moduleName) && !actionIds.has(normalizedActionRef(actionRef))) {
      issues.push(moduleQualityIssue(moduleName, relativePath, `menu XML references missing action id: ${actionRef}`, 'error'));
    }
  }

  const hasMenuAction = hasActionableMenuXmlFiles(allViewXml, moduleName);
  if (!hasMenuAction) {
    issues.push(moduleIssue(moduleName, relativePath, 'missing actionable menu XML'));
  }

  return { moduleName, relativePath, installable, hasMenuAction, depends, ...(manifest ? { manifest } : {}), issues };
}

export function addModuleQualityResult(
  summary: ModuleQualitySummary,
  result: ModuleQualityResult,
): ModuleQualitySummary {
  return {
    totalModules: summary.totalModules + 1,
    installableModules: summary.installableModules + (result.installable ? 1 : 0),
    nonInstallableModules: summary.nonInstallableModules + (result.installable ? 0 : 1),
    modulesWithMenuActions: summary.modulesWithMenuActions + (result.hasMenuAction ? 1 : 0),
    modulesMissingMenuActions: summary.modulesMissingMenuActions + (result.hasMenuAction ? 0 : 1),
    issues: [...summary.issues, ...result.issues],
  };
}

export function mergeModuleQualitySummaries(
  left: ModuleQualitySummary,
  right: ModuleQualitySummary,
): ModuleQualitySummary {
  const missingDependencies = [
    ...(left.dependencyGraph?.missingDependencies ?? []),
    ...(right.dependencyGraph?.missingDependencies ?? []),
  ];
  const dependencies = [...(left.dependencyGraph?.dependencies ?? []), ...(right.dependencyGraph?.dependencies ?? [])];
  const cycles = [...(left.dependencyGraph?.cycles ?? []), ...(right.dependencyGraph?.cycles ?? [])];
  const dependencyGraph =
    dependencies.length > 0 || missingDependencies.length > 0 || cycles.length > 0
      ? { dependencies, missingDependencies, cycles }
      : undefined;

  return {
    totalModules: left.totalModules + right.totalModules,
    installableModules: left.installableModules + right.installableModules,
    nonInstallableModules: left.nonInstallableModules + right.nonInstallableModules,
    modulesWithMenuActions: left.modulesWithMenuActions + right.modulesWithMenuActions,
    modulesMissingMenuActions: left.modulesMissingMenuActions + right.modulesMissingMenuActions,
    ...(dependencyGraph ? { dependencyGraph } : {}),
    issues: [...left.issues, ...right.issues],
  };
}

function firstToken(value: string): string {
  return value.split(/[_-]+/u, 1)[0] ?? value;
}

function looksLikeMissingLocalDependency(moduleName: string, dependency: string): boolean {
  if (dependency === 'base') return false;
  const namespace = firstToken(moduleName);
  const generatedOrProjectNamespaces = new Set(['custom', 'demo', 'module', 'odoo', 'wpmoo']);
  return Boolean(namespace) && generatedOrProjectNamespaces.has(namespace) && dependency.startsWith(`${namespace}_`);
}

function findCycleFrom(
  start: string,
  current: string,
  graph: ReadonlyMap<string, readonly string[]>,
  path: string[] = [start],
): string[] | undefined {
  for (const dependency of graph.get(current) ?? []) {
    if (dependency === start) {
      return [...path, start];
    }
    if (path.includes(dependency)) {
      continue;
    }
    const found = findCycleFrom(start, dependency, graph, [...path, dependency]);
    if (found) return found;
  }

  return undefined;
}

function moduleDependencyGraph(results: readonly ModuleQualityResult[]): {
  graph: ModuleDependencyGraph;
  issues: ModuleQualityIssue[];
} {
  const byName = new Map(results.map((result) => [result.moduleName, result]));
  const localModuleNames = new Set(byName.keys());
  const dependencyEdges = new Map<string, string[]>();
  const missingDependencies: ModuleDependencyGraph['missingDependencies'] = [];
  const dependencies: ModuleDependencyGraph['dependencies'] = [];
  const issues: ModuleQualityIssue[] = [];

  for (const result of results) {
    const localDependencies = result.depends.filter((dependency) => localModuleNames.has(dependency));
    dependencyEdges.set(result.moduleName, localDependencies);

    for (const dependency of result.depends) {
      if (localModuleNames.has(dependency)) {
        dependencies.push({ moduleName: result.moduleName, dependency, kind: 'local' });
        continue;
      }

      if (looksLikeMissingLocalDependency(result.moduleName, dependency)) {
        dependencies.push({ moduleName: result.moduleName, dependency, kind: 'unresolved' });
        missingDependencies.push({ moduleName: result.moduleName, dependency });
        issues.push(moduleIssue(result.moduleName, result.relativePath, `missing local dependency ${dependency}`));
        continue;
      }

      dependencies.push({ moduleName: result.moduleName, dependency, kind: 'external' });
    }
  }

  const cycles: string[][] = [];
  for (const moduleName of localModuleNames) {
    const cycle = findCycleFrom(moduleName, moduleName, dependencyEdges);
    if (cycle) {
      cycles.push(cycle);
      const result = byName.get(moduleName);
      if (result) {
        issues.push(moduleIssue(moduleName, result.relativePath, `dependency cycle detected: ${cycle.join(' -> ')}`));
      }
    }
  }

  return { graph: { dependencies, missingDependencies, cycles }, issues };
}

export async function scanModuleQuality(root: string, target: string): Promise<ModuleQualitySummary> {
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) return emptyModuleQualitySummary();
  } catch {
    return emptyModuleQualitySummary();
  }

  let summary = emptyModuleQualitySummary();
  const stack = [root];
  const results: ModuleQualityResult[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const entries = await readdir(current, { withFileTypes: true });
    let hasManifest = false;

    for (const entry of entries) {
      if (entry.isFile() && entry.name === '__manifest__.py') {
        hasManifest = true;
      } else if (entry.isDirectory()) {
        stack.push(join(current, entry.name));
      }
    }

    if (hasManifest) {
      const result = await analyzeModuleDirectory(current, basename(current), relative(target, current));
      results.push(result);
      summary = addModuleQualityResult(summary, result);
    }
  }

  const dependencyGraph = moduleDependencyGraph(results);
  const hasDependencyGraphIssues =
    dependencyGraph.graph.missingDependencies.length > 0 || dependencyGraph.graph.cycles.length > 0;

  return {
    ...summary,
    ...(hasDependencyGraphIssues ? { dependencyGraph: dependencyGraph.graph } : {}),
    issues: [...summary.issues, ...dependencyGraph.issues],
  };
}
