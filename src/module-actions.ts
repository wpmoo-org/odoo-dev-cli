import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  addModuleToSourceRepoInAddonsYaml,
  removeModuleFromSourceRepoInAddonsYaml,
} from './addons-yaml.js';
import { readEnvironmentMetadata, replaceSourceRepos } from './environment.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import { analyzeModuleDirectory } from './module-quality.js';
import { supportedOdooVersions, type SupportedOdooVersion } from './odoo-versions.js';
import { pathUnderBase, validateModuleName, validateRepoPath } from './path-validation.js';
import { listModuleRepos, readAddonsYaml, writeAddonsYaml } from './repo-actions.js';
import { listSources } from './source-actions.js';
import { readSourceManifest, writeSourceManifest } from './source-manifest.js';
import type { SourceRepo, SourceRepoType } from './types.js';

export type ListedModule = {
  moduleName: string;
  repoPath: string;
  sourceType: SourceRepoType;
  repoUrl?: string;
  repoSlug?: string;
};

const sourceTypeSortOrder: SourceRepoType[] = ['private', 'oca', 'external'];
const githubRepoUrlPattern = /^(?:https?:\/\/|git@)github\.com[/:]([^/]+)\/([^/.#?]+)(?:\.git)?(?:[/?#].*)?$/i;

export type AddModuleOptions = {
  target: string;
  repoPath: string;
  moduleName: string;
  odooVersion: string;
  sourceType?: SourceRepoType;
  stage: boolean;
};

export type ModuleScaffoldCheck = {
  id: string;
  label: string;
  ok: boolean;
  details?: string;
};

export type ModuleScaffoldReport = {
  moduleName: string;
  repoPath: string;
  sourceType: SourceRepoType;
  path: string;
  checks: ModuleScaffoldCheck[];
  warnings: string[];
  summary: string;
};

export type RemoveModuleOptions = {
  target: string;
  repoPath: string;
  moduleName: string;
  sourceType?: SourceRepoType;
  deleteFiles: boolean;
  stage: boolean;
};

const validSourceTypes: SourceRepoType[] = ['private', 'oca', 'external'];

function deriveRepoSlug(repoUrl: string | undefined): string | undefined {
  if (!repoUrl) {
    return undefined;
  }

  const normalized = repoUrl.trim().replace(/[?#].*$/, '');
  const match = githubRepoUrlPattern.exec(normalized);
  if (!match) {
    return undefined;
  }

  const owner = match[1]?.trim();
  const repo = match[2]?.trim();
  if (!owner || !repo) {
    return undefined;
  }

  return `${owner}/${repo}`;
}

function normalizeSourceType(value?: SourceRepoType): SourceRepoType {
  return validSourceTypes.includes(value as SourceRepoType) ? (value as SourceRepoType) : 'private';
}

function validateSupportedOdooVersion(value: string): SupportedOdooVersion {
  const normalized = value.trim();
  if (supportedOdooVersions.includes(normalized as SupportedOdooVersion)) {
    return normalized as SupportedOdooVersion;
  }

  throw new Error(
    `Unsupported Odoo version for generated module scaffolding: ${value}. Supported versions: ${supportedOdooVersions.join(', ')}.`,
  );
}

function sourceRepoPath(target: string, sourceType: SourceRepoType, repoPath: string): string {
  return pathUnderBase(join(target, `odoo/custom/src/${sourceType}`), repoPath, 'repo path');
}

async function readableSourceRepoPath(target: string, sourceType: SourceRepoType, repoPath: string): Promise<string> {
  const primary = sourceRepoPath(target, sourceType, repoPath);
  try {
    await readdir(primary);
    return primary;
  } catch {
    if (sourceType !== 'private') {
      return primary;
    }
  }

  const legacy = pathUnderBase(join(target, 'odoo/custom/src'), repoPath, 'repo path');
  try {
    await readdir(legacy);
    return legacy;
  } catch {
    return primary;
  }
}

function modulePath(target: string, sourceType: SourceRepoType, repoPath: string, moduleName: string): string {
  return pathUnderBase(sourceRepoPath(target, sourceType, repoPath), moduleName, 'module name');
}

function titleizeModule(moduleName: string): string {
  return moduleName
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function moduleClassName(moduleName: string): string {
  const className = titleizeModule(moduleName).replace(/[^A-Za-z0-9]/g, '');
  return /^[A-Za-z_]/.test(className) ? className : `X${className}`;
}

function modelTechnicalName(moduleName: string): string {
  return moduleName.replace(/[_-]+/g, '.').toLowerCase();
}

function actionViewMode(odooVersion: string): string {
  const majorVersion = Number.parseInt(odooVersion.split('.', 1)[0] ?? '', 10);
  return Number.isFinite(majorVersion) && majorVersion < 18 ? 'tree,form' : 'list,form';
}

function listViewTag(odooVersion: string): 'list' | 'tree' {
  const majorVersion = Number.parseInt(odooVersion.split('.', 1)[0] ?? '', 10);
  return Number.isFinite(majorVersion) && majorVersion < 18 ? 'tree' : 'list';
}

function modelContent(moduleName: string): string {
  const moduleTitle = titleizeModule(moduleName);

  return `from odoo import fields, models


class ${moduleClassName(moduleName)}(models.Model):
    _name = "${modelTechnicalName(moduleName)}"
    _description = "${moduleTitle}"

    name = fields.Char(required=True, default="New")
`;
}

function manifestContent(moduleName: string, odooVersion: string): string {
  const moduleTitle = titleizeModule(moduleName);

  return `{
    "name": "${moduleTitle}",
    "version": "${odooVersion}.1.0.0",
    "category": "Productivity",
    "summary": "${moduleTitle} module",
    "depends": ["base"],
    "data": [
        "security/ir.model.access.csv",
        "views/${moduleName}_views.xml",
        "views/${moduleName}_menus.xml",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
`;
}

function viewXmlContent(moduleName: string, odooVersion: string): string {
  const moduleTitle = titleizeModule(moduleName);
  const technicalName = modelTechnicalName(moduleName);
  const primaryViewTag = listViewTag(odooVersion);

  return `<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="view_${moduleName}_${primaryViewTag}" model="ir.ui.view">
        <field name="name">${technicalName}.${primaryViewTag}</field>
        <field name="model">${technicalName}</field>
        <field name="arch" type="xml">
            <${primaryViewTag} string="${moduleTitle}">
                <field name="name"/>
            </${primaryViewTag}>
        </field>
    </record>

    <record id="view_${moduleName}_form" model="ir.ui.view">
        <field name="name">${technicalName}.form</field>
        <field name="model">${technicalName}</field>
        <field name="arch" type="xml">
            <form string="${moduleTitle}">
                <sheet>
                    <group>
                        <field name="name"/>
                    </group>
                </sheet>
            </form>
        </field>
    </record>
</odoo>
`;
}

function menuXmlContent(moduleName: string, odooVersion: string): string {
  const moduleTitle = titleizeModule(moduleName);

  return `<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="action_${moduleName}" model="ir.actions.act_window">
        <field name="name">${moduleTitle}</field>
        <field name="res_model">${modelTechnicalName(moduleName)}</field>
        <field name="view_mode">${actionViewMode(odooVersion)}</field>
    </record>

    <menuitem id="menu_${moduleName}_root" name="${moduleTitle}" groups="base.group_user" sequence="10"/>
    <menuitem id="menu_${moduleName}" name="${moduleTitle}" parent="menu_${moduleName}_root" action="action_${moduleName}" groups="base.group_user" sequence="10"/>
</odoo>
`;
}

function accessCsvContent(moduleName: string): string {
  const modelId = modelTechnicalName(moduleName).replace(/\./g, '_');

  return [
    'id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink',
    `access_${modelId}_user,access_${modelId}_user,model_${modelId},base.group_user,1,1,1,1`,
    '',
  ].join('\n');
}

function testInitContent(moduleName: string): string {
  return `from . import test_${moduleName}\n`;
}

function testContent(moduleName: string): string {
  const moduleTitle = titleizeModule(moduleName);

  return `from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged("post_install", "-at_install")
class Test${moduleClassName(moduleName)}(TransactionCase):

    def test_create_record(self):
        record = self.env["${modelTechnicalName(moduleName)}"].create({"name": "Test ${moduleTitle}"})
        self.assertEqual(record.name, "Test ${moduleTitle}")
`;
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await readFile(path, 'utf8');
  } catch {
    await writeFile(path, content, 'utf8');
  }
}

async function fileContains(path: string, expected: string): Promise<boolean> {
  try {
    return (await readFile(path, 'utf8')).includes(expected);
  } catch {
    return false;
  }
}

async function moduleScaffoldChecks(
  target: string,
  sourceType: SourceRepoType,
  repoPath: string,
  moduleName: string,
  includeRegistration: boolean,
): Promise<ModuleScaffoldCheck[]> {
  const destination = modulePath(target, sourceType, repoPath, moduleName);
  const technicalName = modelTechnicalName(moduleName);
  const modelId = technicalName.replace(/\./g, '_');
  const checks: ModuleScaffoldCheck[] = [
    {
      id: 'manifest',
      label: 'manifest',
      ok:
        (await fileContains(join(destination, '__manifest__.py'), '"installable": True')) &&
        (await fileContains(join(destination, '__manifest__.py'), '"security/ir.model.access.csv"')) &&
        (await fileContains(join(destination, '__manifest__.py'), `"views/${moduleName}_views.xml"`)) &&
        (await fileContains(join(destination, '__manifest__.py'), `"views/${moduleName}_menus.xml"`)),
      details: 'missing installable flag or required data entries',
    },
    {
      id: 'model',
      label: 'model',
      ok:
        (await fileContains(join(destination, '__init__.py'), 'from . import models')) &&
        (await fileContains(join(destination, 'models/__init__.py'), `from . import ${moduleName}`)) &&
        (await fileContains(join(destination, `models/${moduleName}.py`), `_name = "${technicalName}"`)),
      details: `missing model import or _name ${technicalName}`,
    },
    {
      id: 'access',
      label: 'access',
      ok: await fileContains(join(destination, 'security/ir.model.access.csv'), `model_${modelId}`),
      details: `missing access CSV model_${modelId}`,
    },
    {
      id: 'views',
      label: 'views',
      ok:
        (await fileContains(join(destination, `views/${moduleName}_views.xml`), `model">${technicalName}</field>`)) &&
        (await fileContains(join(destination, `views/${moduleName}_views.xml`), '<form ')),
      details: `missing views for ${technicalName}`,
    },
    {
      id: 'menus',
      label: 'menus',
      ok:
        (await fileContains(join(destination, `views/${moduleName}_menus.xml`), `id="action_${moduleName}"`)) &&
        (await fileContains(join(destination, `views/${moduleName}_menus.xml`), 'model="ir.actions.act_window"')) &&
        (await fileContains(join(destination, `views/${moduleName}_menus.xml`), `action="action_${moduleName}"`)) &&
        (await fileContains(join(destination, `views/${moduleName}_menus.xml`), 'groups="base.group_user"')),
      details: `missing action menu action_${moduleName}`,
    },
    {
      id: 'tests',
      label: 'tests',
      ok:
        (await fileContains(join(destination, 'tests/__init__.py'), `from . import test_${moduleName}`)) &&
        (await fileContains(join(destination, `tests/test_${moduleName}.py`), 'TransactionCase')) &&
        (await fileContains(join(destination, `tests/test_${moduleName}.py`), '@tagged("post_install", "-at_install")')) &&
        (await fileContains(join(destination, `tests/test_${moduleName}.py`), `class Test${moduleClassName(moduleName)}(TransactionCase):`)) &&
        (await fileContains(join(destination, `tests/test_${moduleName}.py`), 'def test_create_record(self):')) &&
        (await fileContains(join(destination, `tests/test_${moduleName}.py`), `self.env["${technicalName}"]`)),
      details: 'missing generated TransactionCase test markers',
    },
  ];

  if (includeRegistration) {
    checks.push({
      id: 'registration',
      label: 'registration',
      ok: await moduleRegistrationPresent(target, sourceType, repoPath, moduleName),
      details: 'missing module registration in addons.yaml, source manifest, or metadata',
    });
  }

  return checks;
}

async function moduleRegistrationPresent(
  target: string,
  sourceType: SourceRepoType,
  repoPath: string,
  moduleName: string,
): Promise<boolean> {
  if (sourceType === 'private' && (await usesAddonsYaml(target))) {
    try {
      const addonsYaml = await readAddonsYaml(target);
      return addonsYaml.includes(`private/${repoPath}:`) && addonsYaml.includes(`  - ${moduleName}`);
    } catch {
      return false;
    }
  }

  const manifest = await readSourceManifest(target);
  if (
    manifest.sources.some(
      (entry) => entry.type === sourceType && entry.path === repoPath && entry.addons.includes(moduleName),
    )
  ) {
    return true;
  }

  const metadata = await readEnvironmentMetadata(target);
  return Boolean(
    metadata?.sourceRepos?.some(
      (entry) =>
        normalizeSourceType(entry.sourceType) === sourceType &&
        entry.path === repoPath &&
        entry.addons.includes(moduleName),
    ),
  );
}

function buildModuleScaffoldReport(
  moduleName: string,
  repoPath: string,
  sourceType: SourceRepoType,
  path: string,
  checks: ModuleScaffoldCheck[],
): ModuleScaffoldReport {
  return {
    moduleName,
    repoPath,
    sourceType,
    path,
    checks: checks.map(({ details, ...check }) => (check.ok ? check : { ...check, details })),
    warnings: checks.filter((check) => !check.ok).map((check) => `${check.label} ${check.details ?? 'failed'}`),
    summary: `Module scaffold checks passed: ${checks.map((check) => check.label).join(', ')}.`,
  };
}

async function assertGeneratedModuleScaffold(
  target: string,
  sourceType: SourceRepoType,
  repoPath: string,
  moduleName: string,
): Promise<void> {
  const quality = await analyzeModuleDirectory(
    modulePath(target, sourceType, repoPath, moduleName),
    moduleName,
    `odoo/custom/src/${sourceType}/${repoPath}/${moduleName}`,
  );
  const checks = await moduleScaffoldChecks(target, sourceType, repoPath, moduleName, false);
  const failed = checks.filter((check) => !check.ok);
  if (!quality.installable) {
    failed.unshift({ id: 'manifest-installable', label: 'manifest', ok: false, details: 'missing installable=True in __manifest__.py' });
  }
  if (!quality.hasMenuAction) {
    failed.unshift({ id: 'menu-action', label: 'menus', ok: false, details: `missing action menu action_${moduleName}` });
  }

  if (failed.length > 0) {
    throw new Error(
      `Generated module scaffold validation failed for ${moduleName}: ${failed[0]?.label ?? 'unknown'} ${failed[0]?.details ?? 'failed'}`,
    );
  }
}

export function renderModuleScaffoldReport(report: ModuleScaffoldReport): string {
  return report.summary;
}

async function usesAddonsYaml(target: string): Promise<boolean> {
  const metadata = await readEnvironmentMetadata(target);
  return metadata?.engine !== 'compose';
}

function updateAddonList(addons: string[], moduleName: string, mode: 'add' | 'remove'): string[] {
  if (mode === 'add') {
    return [...new Set([...addons, moduleName])];
  }

  return addons.filter((addon) => addon !== moduleName);
}

function addonListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((addon, index) => addon === right[index]);
}

async function updateSourceManifestModuleRegistration(
  target: string,
  sourceType: SourceRepoType,
  repoPath: string,
  moduleName: string,
  mode: 'add' | 'remove',
): Promise<void> {
  const manifest = await readSourceManifest(target);
  if (manifest.sources.length === 0) {
    return;
  }

  let changed = false;
  const sources = manifest.sources.map((entry) => {
    if (entry.type !== sourceType || entry.path !== repoPath) {
      return entry;
    }

    const addons = updateAddonList(entry.addons, moduleName, mode);
    if (!addonListsEqual(entry.addons, addons)) {
      changed = true;
    }

    return { ...entry, addons };
  });

  if (changed) {
    await writeSourceManifest(target, sources);
  }
}

async function updateMetadataModuleRegistration(
  target: string,
  sourceType: SourceRepoType,
  repoPath: string,
  moduleName: string,
  mode: 'add' | 'remove',
): Promise<void> {
  const metadata = await readEnvironmentMetadata(target);
  if (!metadata?.sourceRepos?.length) {
    return;
  }

  let changed = false;
  const sourceRepos: SourceRepo[] = metadata.sourceRepos.map((repo) => {
    if (normalizeSourceType(repo.sourceType) !== sourceType || repo.path !== repoPath) {
      return repo;
    }

    const addons = updateAddonList(repo.addons, moduleName, mode);
    if (!addonListsEqual(repo.addons, addons)) {
      changed = true;
    }

    return { ...repo, addons };
  });

  if (changed) {
    await replaceSourceRepos(target, sourceRepos);
  }
}

async function updateModuleRegistration(
  target: string,
  sourceType: SourceRepoType,
  repoPath: string,
  moduleName: string,
  mode: 'add' | 'remove',
): Promise<void> {
  await updateSourceManifestModuleRegistration(target, sourceType, repoPath, moduleName, mode);
  await updateMetadataModuleRegistration(target, sourceType, repoPath, moduleName, mode);
}

async function assertModuleCleanBeforeDelete(
  target: string,
  sourceType: SourceRepoType,
  repoPath: string,
  moduleName: string,
  git: GitRunner,
): Promise<void> {
  const repoRoot = sourceRepoPath(target, sourceType, repoPath);
  try {
    const result = await git.run(repoRoot, ['status', '--short', '--', moduleName]);
    if (result.stdout.trim() && (await moduleHasCommittedFiles(repoRoot, moduleName, git))) {
      throw new Error(
        `Refusing to delete module ${moduleName} because it has dirty git changes in source repo ${repoPath}.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing to delete module ')) {
      throw error;
    }
  }
}

async function moduleHasCommittedFiles(repoRoot: string, moduleName: string, git: GitRunner): Promise<boolean> {
  try {
    const result = await git.run(repoRoot, ['ls-tree', '-r', '--name-only', 'HEAD', '--', moduleName]);
    return Boolean(result.stdout.trim());
  } catch {
    return false;
  }
}

export async function addModuleToSourceRepo(
  options: AddModuleOptions,
  git: GitRunner = realGit,
): Promise<ModuleScaffoldReport> {
  const repoPath = validateRepoPath(options.repoPath);
  const moduleName = validateModuleName(options.moduleName);
  const odooVersion = validateSupportedOdooVersion(options.odooVersion);
  const sourceType = normalizeSourceType(options.sourceType);
  const destination = modulePath(options.target, sourceType, repoPath, moduleName);
  await mkdir(join(destination, 'models'), { recursive: true });
  await mkdir(join(destination, 'security'), { recursive: true });
  await mkdir(join(destination, 'tests'), { recursive: true });
  await mkdir(join(destination, 'views'), { recursive: true });

  await writeIfMissing(join(destination, '__init__.py'), 'from . import models\n');
  await writeIfMissing(join(destination, '__manifest__.py'), manifestContent(moduleName, odooVersion));
  await writeIfMissing(join(destination, 'models/__init__.py'), `from . import ${moduleName}\n`);
  await writeIfMissing(join(destination, `models/${moduleName}.py`), modelContent(moduleName));
  await writeIfMissing(join(destination, 'tests/__init__.py'), testInitContent(moduleName));
  await writeIfMissing(join(destination, `tests/test_${moduleName}.py`), testContent(moduleName));
  await writeIfMissing(
    join(destination, 'security/ir.model.access.csv'),
    accessCsvContent(moduleName),
  );
  await writeIfMissing(join(destination, `views/${moduleName}_views.xml`), viewXmlContent(moduleName, odooVersion));
  await writeIfMissing(join(destination, `views/${moduleName}_menus.xml`), menuXmlContent(moduleName, odooVersion));
  await writeIfMissing(join(destination, 'views/.gitkeep'), '');

  await assertGeneratedModuleScaffold(options.target, sourceType, repoPath, moduleName);

  if (sourceType === 'private' && (await usesAddonsYaml(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    await writeAddonsYaml(
      options.target,
      addModuleToSourceRepoInAddonsYaml(addonsYaml, repoPath, moduleName),
    );
  }
  await updateModuleRegistration(options.target, sourceType, repoPath, moduleName, 'add');

  if (options.stage) {
    await stageAll(git, sourceRepoPath(options.target, sourceType, repoPath));
    await stageAll(git, options.target);
  }

  return buildModuleScaffoldReport(
    moduleName,
    repoPath,
    sourceType,
    destination,
    await moduleScaffoldChecks(options.target, sourceType, repoPath, moduleName, true),
  );
}

export async function listModulesInSourceRepo(
  target: string,
  repoPath: string,
  sourceType?: SourceRepoType,
): Promise<string[]> {
  const safeRepoPath = validateRepoPath(repoPath);
  const resolvedSourceType = normalizeSourceType(sourceType);
  try {
    const repoRoot = await readableSourceRepoPath(target, resolvedSourceType, safeRepoPath);
    const entries = await readdir(repoRoot, { withFileTypes: true });
    const modules = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            await readFile(
              join(repoRoot, entry.name, '__manifest__.py'),
              'utf8',
            );
            return entry.name;
          } catch {
            return undefined;
          }
        }),
    );

    return modules.filter((moduleName): moduleName is string => Boolean(moduleName)).sort();
  } catch {
    return [];
  }
}

export async function listModulesInEnvironment(target: string): Promise<ListedModule[]> {
  const sources = await listSources(target);
  type SourceRepoDescriptor = {
    repoPath: string;
    sourceType: SourceRepoType;
    repoUrl?: string;
  };
  const sourceRepos =
    sources.length > 0
      ? sources.map<SourceRepoDescriptor>((source) => ({
          repoPath: source.path,
          sourceType: source.type,
          repoUrl: source.url,
        }))
      : (await listModuleRepos(target)).map<SourceRepoDescriptor>((repoPath) => ({ repoPath, sourceType: 'private' }));

  const listedModules = await Promise.all(
    sourceRepos.map(async ({ repoPath, sourceType, repoUrl }) => {
      try {
        const moduleNames = await listModulesInSourceRepo(target, repoPath, sourceType);
        const repoSlug = deriveRepoSlug(repoUrl);
        return moduleNames.map((moduleName) => ({
          moduleName,
          repoPath,
          sourceType,
          ...(repoUrl ? { repoUrl } : {}),
          ...(repoSlug ? { repoSlug } : {}),
        }));
      } catch {
        return [];
      }
    }),
  );

  const sourceTypeOrder = new Map(sourceTypeSortOrder.map((sourceType, index) => [sourceType, index]));
  return listedModules.flat().sort(
    (left, right) =>
      (sourceTypeOrder.get(left.sourceType) ?? 0) - (sourceTypeOrder.get(right.sourceType) ?? 0) ||
      left.repoPath.localeCompare(right.repoPath) ||
      left.moduleName.localeCompare(right.moduleName),
  );
}

export async function removeModuleFromSourceRepo(
  options: RemoveModuleOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const repoPath = validateRepoPath(options.repoPath);
  const moduleName = validateModuleName(options.moduleName);
  const sourceType = normalizeSourceType(options.sourceType);

  if (options.deleteFiles) {
    await assertModuleCleanBeforeDelete(options.target, sourceType, repoPath, moduleName, git);
  }

  if (sourceType === 'private' && (await usesAddonsYaml(options.target))) {
    const addonsYaml = await readAddonsYaml(options.target);
    await writeAddonsYaml(
      options.target,
      removeModuleFromSourceRepoInAddonsYaml(addonsYaml, repoPath, moduleName),
    );
  }
  await updateModuleRegistration(options.target, sourceType, repoPath, moduleName, 'remove');

  if (options.deleteFiles) {
    await rm(modulePath(options.target, sourceType, repoPath, moduleName), { recursive: true, force: true });
  }

  if (options.stage) {
    if (options.deleteFiles) {
      await stageAll(git, sourceRepoPath(options.target, sourceType, repoPath));
    }
    await stageAll(git, options.target);
  }
}
