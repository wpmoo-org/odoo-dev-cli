import search from '@inquirer/search';

import { searchCockpitCommands, type CockpitCommand } from './command-registry.js';

export type CockpitCommandChoice = {
  value: CockpitCommand;
  name: string;
  description: string;
  short: string;
};

export type CockpitSearchPrompt = (config: {
  message: string;
  source: (
    term: string | undefined,
    opt: {
      signal: AbortSignal;
    },
  ) => readonly CockpitCommandChoice[] | Promise<readonly CockpitCommandChoice[]>;
  pageSize?: number;
}) => Promise<CockpitCommand>;

const defaultSearchPrompt: CockpitSearchPrompt = (config) => search<CockpitCommand>(config);

function commandChoice(command: CockpitCommand): CockpitCommandChoice {
  return {
    value: command,
    name: `${command.slashAlias} ${command.label}`,
    description: command.description,
    short: command.id,
  };
}

export async function selectCockpitCommandFromPalette(options: {
  prompt?: CockpitSearchPrompt;
} = {}): Promise<CockpitCommand> {
  const prompt = options.prompt ?? defaultSearchPrompt;

  return prompt({
    message: 'Search commands',
    pageSize: 10,
    source: (term) => searchCockpitCommands(term).map(commandChoice),
  });
}
