import type { DailyActionCommand } from '../daily-actions.js';

export type CockpitCommandCategory =
  | 'services'
  | 'modules'
  | 'database'
  | 'diagnostics'
  | 'repositories'
  | 'maintenance';

export type CockpitCommandTarget =
  | {
      kind: 'daily';
      command: DailyActionCommand;
    }
  | {
      kind: 'internal';
    };

export type CockpitCommand = {
  id: string;
  slashAlias: `/${string}`;
  category: CockpitCommandCategory;
  label: string;
  description: string;
  isRisky: boolean;
  target: CockpitCommandTarget;
  aliases: readonly string[];
};

const riskyCommandIds = new Set(['stop', 'resetdb', 'restore-snapshot', 'remove-repo', 'remove-module', 'safe-reset']);

function dailyCommand(
  command: DailyActionCommand,
  category: CockpitCommandCategory,
  label: string,
  description: string,
  aliases: readonly string[] = [],
): CockpitCommand {
  return {
    id: command,
    slashAlias: `/${command}`,
    category,
    label,
    description,
    isRisky: riskyCommandIds.has(command),
    target: {
      kind: 'daily',
      command,
    },
    aliases,
  };
}

function internalCommand(
  id: string,
  category: CockpitCommandCategory,
  label: string,
  description: string,
  aliases: readonly string[] = [],
): CockpitCommand {
  return {
    id,
    slashAlias: `/${id}`,
    category,
    label,
    description,
    isRisky: riskyCommandIds.has(id),
    target: {
      kind: 'internal',
    },
    aliases,
  };
}

export const cockpitCommands = [
  dailyCommand('start', 'services', 'Start services', 'Start Odoo services.', ['up', 'compose up']),
  dailyCommand('stop', 'services', 'Stop services', 'Stop Odoo services.', ['down', 'compose down']),
  dailyCommand('restart', 'services', 'Restart services', 'Restart Odoo services.', ['reload']),
  dailyCommand('logs', 'services', 'View logs', 'Tail service logs.', ['log', 'tail']),
  dailyCommand('shell', 'services', 'Open shell', 'Open a service shell.', ['bash', 'terminal']),
  internalCommand('list-modules', 'modules', 'List modules', 'Browse detected Odoo modules by source category.', [
    'modules list',
    'browse modules',
    '/module',
    '/modules',
    '/mods',
    'module',
  ]),
  dailyCommand('install', 'modules', 'Install module', 'Install modules in the database.', [
    'install module',
    '/install-module',
    'module',
  ]),
  dailyCommand('update', 'modules', 'Update module', 'Update modules in the database.', ['upgrade', 'module']),
  dailyCommand('test', 'modules', 'Run tests', 'Run tests for selected modules.', ['/tests', 'tests', 'pytest', 'module']),
  dailyCommand('lint', 'modules', 'Run environment lint', 'Run environment lint checks.', ['check', 'quality']),
  dailyCommand('pot', 'modules', 'Generate POT', 'Generate module translation templates.', ['translation', 'i18n']),
  dailyCommand('psql', 'database', 'Open psql', 'Open PostgreSQL prompt.', ['postgres', 'sql', '/db']),
  dailyCommand('snapshot', 'database', 'Create snapshot', 'Create a database snapshot.', ['backup', 'dump', '/snapshot']),
  dailyCommand(
    'restore-snapshot',
    'database',
    'Restore snapshot',
    'Restore a named snapshot.',
    ['restore', 'snapshot restore'],
  ),
  dailyCommand('resetdb', 'database', 'Reset database', 'Reset the environment database.', ['reset db', 'database reset']),
  internalCommand('status', 'diagnostics', 'Environment status', 'Show a summary of the current environment state.', [
    'state',
    'summary',
  ]),
  internalCommand('doctor', 'diagnostics', 'Run doctor', 'Run environment diagnostics.', ['diagnose', 'health']),
  internalCommand('add-repo', 'repositories', 'Add source repo', 'Add a source repository.', [
    'repository add',
    'source add',
  ]),
  internalCommand(
    'remove-repo',
    'repositories',
    'Remove source repo',
    'Remove a source repository.',
    ['repository remove', 'source remove'],
  ),
  internalCommand('add-module', 'modules', 'Add module', 'Add a module to a source repository.', ['module add']),
  internalCommand(
    'remove-module',
    'modules',
    'Remove module',
    'Remove a module from a source repository.',
    ['module remove', '/remove-module', '/rm-module'],
  ),
  internalCommand(
    'safe-reset',
    'maintenance',
    'Safe reset environment',
    'Refresh generated files only.',
    ['reset', 'refresh', '/safe'],
  ),
  internalCommand('exit', 'maintenance', 'Exit', 'Close the command palette.', ['quit', 'back']),
] as const satisfies readonly CockpitCommand[];

const defaultCommandIds = new Set(['start', 'logs', 'test', 'status', 'doctor', 'exit']);

export function normalizeCockpitSearchTerm(term: string | undefined): string {
  return (term ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function commandSearchFields(command: CockpitCommand): readonly string[] {
  return [command.slashAlias, command.id, command.label, command.category, command.description, ...command.aliases].map(
    normalizeCockpitSearchTerm,
  );
}

function exactMatchScore(command: CockpitCommand, term: string): number {
  const bareTerm = term.startsWith('/') ? term.slice(1) : term;
  if (normalizeCockpitSearchTerm(command.slashAlias) === term) return 0;
  if (normalizeCockpitSearchTerm(command.id) === bareTerm) return 0;
  if (normalizeCockpitSearchTerm(command.label) === term) return 1;
  if (command.aliases.map(normalizeCockpitSearchTerm).includes(term)) return 2;
  return 10;
}

export function searchCockpitCommands(term: string | undefined): CockpitCommand[] {
  const normalizedTerm = normalizeCockpitSearchTerm(term);

  if (!normalizedTerm) {
    return cockpitCommands.filter((command) => defaultCommandIds.has(command.id));
  }

  return cockpitCommands
    .filter((command) => commandSearchFields(command).some((field) => field.includes(normalizedTerm)))
    .sort((left, right) => exactMatchScore(left, normalizedTerm) - exactMatchScore(right, normalizedTerm));
}
