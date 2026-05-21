import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

export type ModuleQualityIssue = {
  moduleName: string;
  path: string;
  issue: string;
};

export type ModuleQualitySummary = {
  totalModules: number;
  installableModules: number;
  nonInstallableModules: number;
  modulesWithMenuActions: number;
  modulesMissingMenuActions: number;
  issues: ModuleQualityIssue[];
};

export type ModuleQualityResult = {
  moduleName: string;
  relativePath: string;
  installable: boolean;
  hasMenuAction: boolean;
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
  return /["']installable["']\s*:\s*(?:True|true)\b/u.test(content);
}

export function hasActionableMenuXml(content: string, moduleName: string): boolean {
  const actionId = `action_${moduleName}`;
  return (
    content.includes(`id="${actionId}"`) &&
    content.includes('model="ir.actions.act_window"') &&
    content.includes(`action="${actionId}"`)
  );
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

export async function analyzeModuleDirectory(
  modulePath: string,
  moduleName = basename(modulePath),
  relativePath = modulePath,
): Promise<ModuleQualityResult> {
  const issues: ModuleQualityIssue[] = [];
  let installable = false;
  try {
    installable = isInstallableManifest(await readFile(join(modulePath, '__manifest__.py'), 'utf8'));
  } catch {
    installable = false;
  }

  if (!installable) {
    issues.push({
      moduleName,
      path: relativePath,
      issue: 'missing installable=True in __manifest__.py',
    });
  }

  const menuXml = await readMenusXml(modulePath);
  const hasMenuAction = menuXml.some((content) => hasActionableMenuXml(content, moduleName));
  if (!hasMenuAction) {
    issues.push({
      moduleName,
      path: relativePath,
      issue: 'missing actionable menu XML',
    });
  }

  return { moduleName, relativePath, installable, hasMenuAction, issues };
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
  return {
    totalModules: left.totalModules + right.totalModules,
    installableModules: left.installableModules + right.installableModules,
    nonInstallableModules: left.nonInstallableModules + right.nonInstallableModules,
    modulesWithMenuActions: left.modulesWithMenuActions + right.modulesWithMenuActions,
    modulesMissingMenuActions: left.modulesMissingMenuActions + right.modulesMissingMenuActions,
    issues: [...left.issues, ...right.issues],
  };
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
      summary = addModuleQualityResult(
        summary,
        await analyzeModuleDirectory(current, basename(current), relative(target, current)),
      );
    }
  }

  return summary;
}
