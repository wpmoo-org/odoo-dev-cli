import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const addonPolicyPath = '.wpmoo/policy.yaml';

export type OdooAddonPolicyRule = {
  from: string;
  mustNotDependOn?: string[];
  mayDependOn?: string[];
  mustNotDependOnEnterpriseOnly?: boolean;
};

export type OdooAddonPolicy = {
  odooVersion?: string;
  addonGroups: Record<string, string[]>;
  enterpriseOnlyDependencies: string[];
  backendMenu?: {
    allowedTopLevel: string[];
    severity?: 'error' | 'warning';
  };
  lint: {
    directStateWrite?: boolean;
    controllerWrites?: boolean;
    notificationDependency?: {
      requiredDependency: string;
    };
  };
  notifications?: {
    requiredAddon?: string;
    templateModels: string[];
    ruleModels: string[];
  };
  rules: OdooAddonPolicyRule[];
};

export type ReadOdooAddonPolicyResult =
  | { ok: true; policy?: OdooAddonPolicy }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function asSeverity(value: unknown): 'error' | 'warning' | undefined {
  return value === 'error' || value === 'warning' ? value : undefined;
}

function normalizePolicy(value: unknown): OdooAddonPolicy {
  if (!isRecord(value)) {
    throw new Error('policy must be an object');
  }

  const addonGroups: Record<string, string[]> = {};
  const rawGroups = value.addonGroups;
  if (isRecord(rawGroups)) {
    for (const [groupName, addons] of Object.entries(rawGroups)) {
      const normalizedGroup = groupName.trim();
      if (!normalizedGroup) continue;
      addonGroups[normalizedGroup] = asStringArray(addons);
    }
  }

  const rules: OdooAddonPolicyRule[] = [];
  if (Array.isArray(value.rules)) {
    for (const rawRule of value.rules) {
      if (!isRecord(rawRule) || typeof rawRule.from !== 'string' || !rawRule.from.trim()) {
        continue;
      }
      const rule: OdooAddonPolicyRule = { from: rawRule.from.trim() };
      const mustNotDependOn = asStringArray(rawRule.mustNotDependOn);
      if (mustNotDependOn.length > 0) rule.mustNotDependOn = mustNotDependOn;
      const mayDependOn = asStringArray(rawRule.mayDependOn);
      if (mayDependOn.length > 0) rule.mayDependOn = mayDependOn;
      if (rawRule.mustNotDependOnEnterpriseOnly === true) {
        rule.mustNotDependOnEnterpriseOnly = true;
      }
      rules.push(rule);
    }
  }

  return {
    ...(typeof value.odooVersion === 'string' && value.odooVersion.trim() ? { odooVersion: value.odooVersion.trim() } : {}),
    addonGroups,
    enterpriseOnlyDependencies: asStringArray(value.enterpriseOnlyDependencies),
    ...(isRecord(value.backendMenu)
      ? {
          backendMenu: {
            allowedTopLevel: asStringArray(value.backendMenu.allowedTopLevel),
            ...(asSeverity(value.backendMenu.severity) ? { severity: asSeverity(value.backendMenu.severity) } : {}),
          },
        }
      : {}),
    lint: isRecord(value.lint)
      ? {
          ...(value.lint.directStateWrite === true ? { directStateWrite: true } : {}),
          ...(value.lint.controllerWrites === true ? { controllerWrites: true } : {}),
          ...(isRecord(value.lint.notificationDependency) &&
          typeof value.lint.notificationDependency.requiredDependency === 'string' &&
          value.lint.notificationDependency.requiredDependency.trim()
            ? {
                notificationDependency: {
                  requiredDependency: value.lint.notificationDependency.requiredDependency.trim(),
                },
              }
            : {}),
        }
      : {},
    ...(isRecord(value.notifications)
      ? {
          notifications: {
            ...(typeof value.notifications.requiredAddon === 'string' && value.notifications.requiredAddon.trim()
              ? { requiredAddon: value.notifications.requiredAddon.trim() }
              : {}),
            templateModels: asStringArray(value.notifications.templateModels),
            ruleModels: asStringArray(value.notifications.ruleModels),
          },
        }
      : {}),
    rules,
  };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(value: string): string | boolean | string[] {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => unquote(item)).filter(Boolean);
  }
  return unquote(trimmed);
}

function stripComment(line: string): string {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? undefined : quote ?? char;
      continue;
    }
    if (char === '#' && !quote) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseYamlPolicy(content: string): OdooAddonPolicy {
  const root: Record<string, unknown> = {};
  let section:
    | 'odoo'
    | 'addonGroups'
    | 'enterpriseOnlyDependencies'
    | 'backendMenu'
    | 'notifications'
    | 'lint'
    | 'notificationDependency'
    | 'rules'
    | undefined;
  let currentGroup: string | undefined;
  let currentListKey: string | undefined;
  let currentRule: Record<string, unknown> | undefined;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = stripComment(rawLine).replace(/\s+$/u, '');
    if (!line.trim()) continue;
    const indent = line.match(/^ */u)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (indent === 0) {
      currentGroup = undefined;
      currentListKey = undefined;
      currentRule = undefined;
      if (trimmed === 'odoo:') {
        section = 'odoo';
        continue;
      }
      if (trimmed === 'addonGroups:') {
        section = 'addonGroups';
        root.addonGroups = {};
        continue;
      }
      if (trimmed === 'enterpriseOnlyDependencies:') {
        section = 'enterpriseOnlyDependencies';
        root.enterpriseOnlyDependencies = [];
        continue;
      }
      if (trimmed === 'backendMenu:') {
        section = 'backendMenu';
        root.backendMenu = {};
        continue;
      }
      if (trimmed === 'notifications:') {
        section = 'notifications';
        root.notifications = {};
        continue;
      }
      if (trimmed === 'rules:') {
        section = 'rules';
        root.rules = [];
        continue;
      }
      if (trimmed === 'lint:') {
        section = 'lint';
        root.lint = {};
        continue;
      }
      section = undefined;
      continue;
    }

    if (section === 'odoo' && indent === 2) {
      const separator = trimmed.indexOf(':');
      if (separator !== -1 && trimmed.slice(0, separator).trim() === 'version') {
        root.odooVersion = parseScalar(trimmed.slice(separator + 1));
      }
      continue;
    }

    if ((section === 'backendMenu' || section === 'notifications') && indent >= 2) {
      const target = root[section] as Record<string, unknown>;
      if (indent === 2 && trimmed.endsWith(':')) {
        currentListKey = trimmed.slice(0, -1).trim();
        target[currentListKey] = [];
        continue;
      }
      if (indent >= 4 && currentListKey && trimmed.startsWith('- ')) {
        (target[currentListKey] as string[]).push(unquote(trimmed.slice(2)));
        continue;
      }
      if (indent === 2) {
        currentListKey = undefined;
        const separator = trimmed.indexOf(':');
        if (separator !== -1) {
          target[trimmed.slice(0, separator).trim()] = parseScalar(trimmed.slice(separator + 1));
        }
      }
      continue;
    }

    if ((section === 'lint' || section === 'notificationDependency') && indent >= 2) {
      if (section === 'notificationDependency' && indent === 2 && trimmed !== 'notificationDependency:') {
        section = 'lint';
      }
      if (section === 'lint' && indent === 2 && trimmed === 'notificationDependency:') {
        const lint = root.lint as Record<string, unknown>;
        lint.notificationDependency = {};
        section = 'notificationDependency';
        continue;
      }
      const separator = trimmed.indexOf(':');
      if (separator !== -1) {
        const key = trimmed.slice(0, separator).trim();
        const value = parseScalar(trimmed.slice(separator + 1));
        if (section === 'notificationDependency') {
          const lint = root.lint as Record<string, unknown>;
          (lint.notificationDependency as Record<string, unknown>)[key] = value;
        } else {
          (root.lint as Record<string, unknown>)[key] = value;
        }
      }
      continue;
    }

    if (section === 'enterpriseOnlyDependencies' && trimmed.startsWith('- ')) {
      (root.enterpriseOnlyDependencies as string[]).push(unquote(trimmed.slice(2)));
      continue;
    }

    if (section === 'addonGroups') {
      if (indent === 2 && trimmed.endsWith(':')) {
        currentGroup = trimmed.slice(0, -1).trim();
        const groups = root.addonGroups as Record<string, string[]>;
        groups[currentGroup] = [];
        continue;
      }
      if (indent >= 4 && currentGroup && trimmed.startsWith('- ')) {
        const groups = root.addonGroups as Record<string, string[]>;
        groups[currentGroup]?.push(unquote(trimmed.slice(2)));
        continue;
      }
    }

    if (section === 'rules') {
      if (indent === 2 && trimmed.startsWith('- ')) {
        currentRule = {};
        (root.rules as Record<string, unknown>[]).push(currentRule);
        const firstEntry = trimmed.slice(2).trim();
        if (firstEntry) {
          const separator = firstEntry.indexOf(':');
          if (separator !== -1) {
            currentRule[firstEntry.slice(0, separator).trim()] = parseScalar(firstEntry.slice(separator + 1));
          }
        }
        continue;
      }
      if (indent >= 4 && currentRule) {
        const separator = trimmed.indexOf(':');
        if (separator !== -1) {
          currentRule[trimmed.slice(0, separator).trim()] = parseScalar(trimmed.slice(separator + 1));
        }
      }
    }
  }

  return normalizePolicy(root);
}

export function parseOdooAddonPolicy(content: string): OdooAddonPolicy {
  const trimmed = content.trim();
  if (!trimmed) {
    return normalizePolicy({});
  }
  if (trimmed.startsWith('{')) {
    return normalizePolicy(JSON.parse(trimmed));
  }
  return parseYamlPolicy(content);
}

export async function readOdooAddonPolicy(target: string): Promise<ReadOdooAddonPolicyResult> {
  const fullPath = join(target, addonPolicyPath);
  try {
    await access(fullPath);
  } catch {
    return { ok: true };
  }

  try {
    return { ok: true, policy: parseOdooAddonPolicy(await readFile(fullPath, 'utf8')) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Invalid addon policy in ${addonPolicyPath}: ${message}` };
  }
}
