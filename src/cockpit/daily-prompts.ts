import type { DailyActionCommand } from '../daily-actions.js';
import {
  listEnvironmentDatabases,
  normalizeDatabaseListResult,
  type DatabaseListOptions,
  type DatabaseListResponse,
} from '../databases.js';
import { listModulesInSourceRepo } from '../module-actions.js';
import { listModuleRepos } from '../repo-actions.js';
import { listSources } from '../source-actions.js';
import {
  handlePromptCancel,
  menuPromptMessage,
  type PromptCancelAction,
} from '../menu-navigation.js';
import { isPromptCancel, selectPrompt, textPrompt } from '../prompts/index.js';

export type DailyActionPromptCancelAction = PromptCancelAction;
export type DailyActionPromptOption = {
  value: string;
  label: string;
};

export type DailyActionTextPromptOptions = {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
};

export type DailyActionSelectPromptOptions = {
  message: string;
  options: DailyActionPromptOption[];
  initialValue?: string;
};

export type DailyActionPromptDeps = {
  select?: (options: DailyActionSelectPromptOptions) => Promise<unknown>;
  text?: (options: DailyActionTextPromptOptions) => Promise<unknown>;
  list?: (options: DailyActionSelectPromptOptions) => Promise<unknown>;
  databases?: (cwd: string, options?: DatabaseListOptions) => Promise<DatabaseListResponse>;
  handleCancel?: (value: unknown, action: DailyActionPromptCancelAction) => void;
};

const manualModuleValue = '__wpmoo_manual_module_entry__';
const manualDatabaseValue = '__wpmoo_manual_database_entry__';

function defaultCancelHandler(value: unknown, action: DailyActionPromptCancelAction): void {
  handlePromptCancel(isPromptCancel(value), action);
}

function promptDeps(deps: DailyActionPromptDeps = {}): Required<DailyActionPromptDeps> {
  return {
    select: deps.select ?? ((options) => selectPrompt(options)),
    text: deps.text ?? ((options) => textPrompt(options)),
    list: deps.list ?? ((options) => selectPrompt(options)),
    databases: deps.databases ?? ((cwd, options) => listEnvironmentDatabases(cwd, options)),
    handleCancel: deps.handleCancel ?? defaultCancelHandler,
  };
}

function asString(value: unknown, fallback: string, deps: Required<DailyActionPromptDeps>): string {
  deps.handleCancel(value, 'back');
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function requiredString(value: unknown, message: string, deps: Required<DailyActionPromptDeps>): string {
  deps.handleCancel(value, 'back');
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new Error(message);
}

async function detectedModules(cwd: string): Promise<string[]> {
  try {
    const sources = await listSources(cwd);
    const repos =
      sources.length > 0
        ? sources.map((source) => ({ path: source.path, sourceType: source.type }))
        : (await listModuleRepos(cwd)).map((path) => ({ path, sourceType: 'private' as const }));
    const modules = await Promise.all(
      repos.map(async (repo) => {
        try {
          return await listModulesInSourceRepo(cwd, repo.path, repo.sourceType);
        } catch {
          return [];
        }
      }),
    );

    return [...new Set(modules.flat())].sort();
  } catch {
    return [];
  }
}

async function moduleArg(
  cwd: string,
  deps: Required<DailyActionPromptDeps>,
  message = 'Module(s)',
): Promise<string> {
  const modules = await detectedModules(cwd);
  if (modules.length === 0) {
    return requiredString(
      await deps.text({
        message: menuPromptMessage(message, 'back'),
        placeholder: 'sale,stock',
        validate: (value) => (value.trim() ? undefined : 'Enter one or more module technical names.'),
      }),
      'Module is required.',
      deps,
    );
  }

  const selected = await deps.select({
    message: menuPromptMessage(message, 'back'),
    options: [
      ...modules.map((moduleName) => ({ value: moduleName, label: moduleName })),
      { value: manualModuleValue, label: 'Manual entry' },
    ],
    initialValue: modules[0],
  });
  deps.handleCancel(selected, 'back');

  if (selected !== manualModuleValue) {
    return String(selected);
  }

  return requiredString(
    await deps.text({
      message: menuPromptMessage('Module(s)', 'back'),
      placeholder: modules.join(','),
      validate: (value) => (value.trim() ? undefined : 'Enter one or more module technical names.'),
    }),
    'Module is required.',
    deps,
  );
}

async function optionalTextArg(
  deps: Required<DailyActionPromptDeps>,
  message: string,
  fallback: string,
): Promise<string> {
  return asString(
    await deps.text({
      message: menuPromptMessage(message, 'back'),
      defaultValue: fallback,
      placeholder: fallback,
    }),
    fallback,
    deps,
  );
}

async function optionalTextArgOrUndefined(
  deps: Required<DailyActionPromptDeps>,
  message: string,
  placeholder: string,
): Promise<string | undefined> {
  const value = await deps.text({
    message: menuPromptMessage(message, 'back'),
    placeholder,
  });
  deps.handleCancel(value, 'back');
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

async function databaseArg(
  cwd: string,
  deps: Required<DailyActionPromptDeps>,
  message: string,
  fallback: string,
  options: DatabaseListOptions = {},
): Promise<string> {
  const databaseResult = normalizeDatabaseListResult(await deps.databases(cwd, options));
  const databases: string[] = databaseResult.databases;
  if (databases.length > 0) {
    const selected = await deps.list({
      message: menuPromptMessage(message, 'back'),
      options: [
        ...databases.map((database) => ({ value: database, label: database })),
        { value: manualDatabaseValue, label: 'Manual entry' },
      ],
      initialValue: databases.includes(fallback) ? fallback : databases[0],
    });
    deps.handleCancel(selected, 'back');

    if (selected !== manualDatabaseValue) {
      return String(selected);
    }
  }

  return optionalTextArg(
    deps,
    databaseResult.ok ? message : `${message} (database list unavailable; enter manually)`,
    fallback,
  );
}

async function optionalModules(cwd: string, deps: Required<DailyActionPromptDeps>): Promise<string | undefined> {
  const modules = await detectedModules(cwd);
  if (modules.length === 0) {
    const manualModules = asString(
      await deps.text({
        message: menuPromptMessage('Module(s) to include (optional)', 'back'),
        placeholder: 'sale,stock',
      }),
      '',
      deps,
    );
    return manualModules || undefined;
  }

  const selected = await deps.select({
    message: menuPromptMessage('Module(s) to include (optional)', 'back'),
    options: [
      { value: '', label: 'All modules' },
      ...modules.map((moduleName) => ({ value: moduleName, label: moduleName })),
      { value: manualModuleValue, label: 'Manual entry' },
    ],
    initialValue: '',
  });
  deps.handleCancel(selected, 'back');

  if (selected === '') {
    return undefined;
  }
  if (selected !== manualModuleValue) {
    return String(selected);
  }

  const manualModules = asString(
    await deps.text({
      message: menuPromptMessage('Module(s) to include', 'back'),
      placeholder: modules.join(','),
    }),
    '',
    deps,
  );
  return manualModules || undefined;
}

export async function collectDailyActionArgs(
  command: DailyActionCommand,
  cwd: string,
  promptDepsArg: DailyActionPromptDeps = {},
): Promise<string[]> {
  const deps = promptDeps(promptDepsArg);

  if (['start', 'restart', 'shell', 'lint', 'stop'].includes(command)) {
    return [];
  }
  if (command === 'logs') {
    const service = await optionalTextArg(deps, 'Service', 'odoo');
    const tail = await optionalTextArgOrUndefined(deps, 'Tail line count (optional)', '100');
    return tail ? [service, tail] : [service];
  }
  if (command === 'psql') {
    return [await databaseArg(cwd, deps, 'Database', 'postgres', { includeMaintenance: true })];
  }
  if (command === 'install' || command === 'update') {
    const modules = await moduleArg(cwd, deps);
    const db = await databaseArg(cwd, deps, 'Odoo database', 'devel');
    return [modules, db];
  }
  if (command === 'test') {
    const modules = await moduleArg(cwd, deps);
    const db = await databaseArg(cwd, deps, 'Odoo database', 'devel');
    const mode = asString(
      await deps.list({
        message: menuPromptMessage('Mode', 'back'),
        options: [
          { value: 'update', label: 'update' },
          { value: 'init', label: 'init' },
        ],
        initialValue: 'update',
      }),
      'update',
      deps,
    );
    const tags = asString(
      await deps.text({
        message: menuPromptMessage('Tags (optional)', 'back'),
        placeholder: '/sale',
      }),
      '',
      deps,
    );
    return tags
      ? [modules, '--db', db, '--mode', mode, '--tags', tags]
      : [modules, '--db', db, '--mode', mode];
  }
  if (command === 'pot') {
    const modules = await moduleArg(cwd, deps);
    const db = await databaseArg(cwd, deps, 'Odoo database', 'devel');
    const output = await optionalTextArg(deps, 'Output file', `i18n/${modules}.pot`);
    return [modules, db, output];
  }
  if (command === 'resetdb') {
    const db = await databaseArg(cwd, deps, 'Odoo database', 'devel');
    const modules = await optionalModules(cwd, deps);
    return modules ? [db, modules] : [db];
  }
  if (command === 'snapshot') {
    const db = await databaseArg(cwd, deps, 'Odoo database', 'devel');
    const snapshotName = await optionalTextArg(deps, 'Snapshot name', 'before-update');
    return [db, snapshotName];
  }
  if (command === 'restore-snapshot') {
    const snapshotName = requiredString(
      await deps.text({
        message: menuPromptMessage('Snapshot name', 'back'),
        validate: (value) => (value.trim() ? undefined : 'Enter the snapshot name.'),
      }),
      'Snapshot name is required.',
      deps,
    );
    const db = await databaseArg(cwd, deps, 'Odoo database', 'devel');
    return [snapshotName, db];
  }

  return [];
}
