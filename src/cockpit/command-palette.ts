import { isPromptCancel, searchPrompt, type SearchPromptOptions } from '../prompts/index.js';

import { searchCockpitCommands, type CockpitCommand } from './command-registry.js';

export type CockpitCommandChoice = {
  value: CockpitCommand;
  name: string;
  description: string;
  short: string;
};

export type CockpitSearchPrompt = (
  config: SearchPromptOptions<CockpitCommand>,
) => Promise<CockpitCommand | symbol>;

const defaultSearchPrompt: CockpitSearchPrompt = (config) => searchPrompt<CockpitCommand>(config);

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

  const selected = await prompt({
    message: 'Search commands',
    pageSize: 10,
    source: (term) => searchCockpitCommands(term).map(commandChoice),
  });

  if (isPromptCancel(selected)) {
    throw new Error('Prompt was canceled.');
  }

  return selected as CockpitCommand;
}
