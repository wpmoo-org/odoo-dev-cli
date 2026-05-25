import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { ModuleQualityIssue } from './module-quality.js';
import type { OdooAddonPolicy } from './odoo-addon-policy.js';

type FileRecord = {
  relativePath: string;
  content: string;
};

const pythonFilePattern = /\.py$/u;
const xmlFilePattern = /\.xml$/u;

async function readPolicyLintFiles(modulePath: string): Promise<FileRecord[]> {
  const stack = [modulePath];
  const files: FileRecord[] = [];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['.git', '__pycache__', 'node_modules'].includes(entry.name)) {
          stack.push(path);
        }
        continue;
      }
      if (!entry.isFile() || (!pythonFilePattern.test(entry.name) && !xmlFilePattern.test(entry.name))) {
        continue;
      }
      files.push({ relativePath: relative(modulePath, path), content: await readFile(path, 'utf8') });
    }
  }

  return files;
}

function odooMajor(policy: OdooAddonPolicy | undefined): number | undefined {
  const match = policy?.odooVersion?.match(/^(\d+)/u);
  return match ? Number(match[1]) : undefined;
}

function lineHasIgnoreReason(line: string, rule: string): boolean {
  return line.includes(`wpmoo-lint: disable=${rule}`) && /\breason=(?:"[^"]+"|'[^']+'|\S+)/u.test(line);
}

function isRuleIgnored(lines: readonly string[], index: number, rule: string): boolean {
  return lineHasIgnoreReason(lines[index] ?? '', rule) || lineHasIgnoreReason(lines[index - 1] ?? '', rule);
}

function isTestOrMigration(relativePath: string): boolean {
  return relativePath.startsWith('tests/') || relativePath.includes('/tests/') || relativePath.includes('/migrations/');
}

function issue(moduleName: string, moduleRelativePath: string, detailPath: string, message: string): ModuleQualityIssue {
  return {
    moduleName,
    path: `${moduleRelativePath}/${detailPath}`,
    issue: message,
    severity: 'warning',
  };
}

function hasNotificationXml(content: string): boolean {
  return /model=(["'])mail\.template\1/u.test(content) || /model=(["'])moo\.olympiad\.notification\.rule\1/u.test(content);
}

export async function lintOdooAddonPolicy(options: {
  moduleName: string;
  modulePath: string;
  moduleRelativePath: string;
  depends: readonly string[];
  policy?: OdooAddonPolicy;
}): Promise<ModuleQualityIssue[]> {
  const { moduleName, modulePath, moduleRelativePath, depends, policy } = options;
  if (!policy) return [];

  const files = await readPolicyLintFiles(modulePath);
  const major = odooMajor(policy);
  const issues: ModuleQualityIssue[] = [];

  if (major !== undefined && major >= 17) {
    for (const file of files.filter((candidate) => xmlFilePattern.test(candidate.relativePath))) {
      if (/\sattrs=/u.test(file.content)) {
        issues.push(
          issue(
            moduleName,
            moduleRelativePath,
            file.relativePath,
            'Odoo policy warning: XML attrs attribute is deprecated for configured Odoo 17+ policy',
          ),
        );
      }
    }
  }

  if (major === 19) {
    for (const file of files.filter((candidate) => pythonFilePattern.test(candidate.relativePath))) {
      if (file.content.includes('_sql_constraints')) {
        issues.push(
          issue(
            moduleName,
            moduleRelativePath,
            file.relativePath,
            'Odoo policy warning: _sql_constraints found; prefer models.Constraint for configured Odoo 19 policy',
          ),
        );
      }
    }
  }

  for (const file of files.filter((candidate) => pythonFilePattern.test(candidate.relativePath))) {
    if (isTestOrMigration(file.relativePath)) continue;
    const lines = file.content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (policy.lint.directStateWrite === true && /\.write\(\s*\{\s*["']state["']\s*:/u.test(line)) {
        if (!isRuleIgnored(lines, index, 'direct-state-write')) {
          issues.push(
            issue(
              moduleName,
              moduleRelativePath,
              file.relativePath,
              'Odoo policy warning: direct state write detected; use an action method or service hook',
            ),
          );
        }
      }

      if (
        policy.lint.controllerWrites === true &&
        file.relativePath.startsWith('controllers/') &&
        /\.(?:sudo\(\)\.)?(?:write|create|unlink)\(/u.test(line)
      ) {
        if (!isRuleIgnored(lines, index, 'controller-write')) {
          issues.push(
            issue(
              moduleName,
              moduleRelativePath,
              file.relativePath,
              'Odoo policy warning: controller performs ORM write; move business logic to model or service layer',
            ),
          );
        }
      }
    }
  }

  const notificationDependency = policy.lint.notificationDependency?.requiredDependency;
  if (notificationDependency && !depends.includes(notificationDependency)) {
    const hasNotificationData = files
      .filter((candidate) => xmlFilePattern.test(candidate.relativePath))
      .some((file) => hasNotificationXml(file.content));
    if (hasNotificationData) {
      issues.push(
        issue(
          moduleName,
          moduleRelativePath,
          '__manifest__.py',
          `Odoo policy warning: notification XML requires manifest dependency ${notificationDependency}`,
        ),
      );
    }
  }

  return issues;
}
