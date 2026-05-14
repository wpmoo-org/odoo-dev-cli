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
  dailyCommand('start', 'services', 'Start services', 'Start the Odoo development services.', ['up', 'compose up']),
  dailyCommand('stop', 'services', 'Stop services', 'Stop the Odoo development services.', ['down', 'compose down']),
  dailyCommand('restart', 'services', 'Restart services', 'Restart the Odoo development services.', ['reload']),
  dailyCommand('logs', 'services', 'View logs', 'Stream logs for an Odoo environment service.', ['log', 'tail']),
  dailyCommand('shell', 'services', 'Open shell', 'Open a shell inside the Odoo service container.', ['bash', 'terminal']),
  dailyCommand('install', 'modules', 'Install module', 'Install one or more Odoo modules into a database.', ['install module']),
  dailyCommand('update', 'modules', 'Update module', 'Update one or more Odoo modules in a database.', ['upgrade']),
  dailyCommand('test', 'modules', 'Run tests', 'Run Odoo tests for one or more modules.', ['tests', 'pytest']),
  dailyCommand('lint', 'modules', 'Run lint', 'Run the configured module lint checks.', ['check', 'quality']),
  dailyCommand('pot', 'modules', 'Generate POT', 'Generate translation template files for a module.', ['translation', 'i18n']),
  dailyCommand('psql', 'database', 'Open psql', 'Open a PostgreSQL prompt for an environment database.', ['postgres', 'sql']),
  dailyCommand('snapshot', 'database', 'Create snapshot', 'Create a database snapshot.', ['backup', 'dump']),
  dailyCommand(
    'restore-snapshot',
    'database',
    'Restore snapshot',
    'Restore a database from a named snapshot.',
    ['restore', 'snapshot restore'],
  ),
  dailyCommand('resetdb', 'database', 'Reset database', 'Reset an environment database.', ['reset db', 'database reset']),
  internalCommand('status', 'diagnostics', 'Environment status', 'Show a summary of the current environment state.', [
    'state',
    'summary',
  ]),
  internalCommand('doctor', 'diagnostics', 'Run doctor', 'Run environment diagnostics and report actionable issues.', [
    'diagnose',
    'health',
  ]),
  internalCommand('add-repo', 'repositories', 'Add source repo', 'Add a source repository as an environment submodule.', [
    'repository add',
    'source add',
  ]),
  internalCommand(
    'remove-repo',
    'repositories',
    'Remove source repo',
    'Remove a source repository from the environment.',
    ['repository remove', 'source remove'],
  ),
  internalCommand('add-module', 'modules', 'Add module', 'Add a module folder to a source repository.', ['module add']),
  internalCommand(
    'remove-module',
    'modules',
    'Remove module',
    'Remove a module folder from a source repository.',
    ['module remove'],
  ),
  internalCommand(
    'safe-reset',
    'maintenance',
    'Safe reset environment',
    'Refresh generated environment files while preserving source repositories.',
    ['reset', 'refresh'],
  ),
  internalCommand('exit', 'maintenance', 'Exit', 'Leave the command palette.', ['quit', 'back']),
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
