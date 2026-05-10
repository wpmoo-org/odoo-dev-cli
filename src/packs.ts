export type DevelopmentPackId = 'agentic-stack' | 'vscode-workspace' | 'doctor' | 'github-actions';

export type DevelopmentPacks = {
  agenticStack: boolean;
  vscodeWorkspace: boolean;
  doctor: boolean;
  githubActions: boolean;
};

export type DevelopmentPackOption = {
  id: DevelopmentPackId;
  key: keyof DevelopmentPacks;
  label: string;
  hint: string;
};

export const developmentPackOptions: DevelopmentPackOption[] = [
  {
    id: 'agentic-stack',
    key: 'agenticStack',
    label: 'Agentic stack',
    hint: 'Install the Codex adapter in the generated environment',
  },
  {
    id: 'vscode-workspace',
    key: 'vscodeWorkspace',
    label: 'VS Code/Cursor workspace',
    hint: 'Workspace settings pack placeholder',
  },
  {
    id: 'doctor',
    key: 'doctor',
    label: 'Doodba doctor scripts',
    hint: 'Doctor pack placeholder',
  },
  {
    id: 'github-actions',
    key: 'githubActions',
    label: 'GitHub Actions CI',
    hint: 'CI pack placeholder',
  },
];

export function emptyDevelopmentPacks(): DevelopmentPacks {
  return {
    agenticStack: false,
    vscodeWorkspace: false,
    doctor: false,
    githubActions: false,
  };
}

export function developmentPacksFromIds(ids: Iterable<string>): DevelopmentPacks {
  const packs = emptyDevelopmentPacks();
  const optionsById = new Map(developmentPackOptions.map((option) => [option.id, option]));

  for (const id of ids) {
    const option = optionsById.get(id as DevelopmentPackId);
    if (!option) {
      throw new Error(`Unknown development pack: ${id}`);
    }
    packs[option.key] = true;
  }

  return packs;
}

export function parsePackIdsFromArgv(argv: string[]): DevelopmentPackId[] | undefined {
  if (argv.includes('--no-packs')) {
    return [];
  }

  const ids: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const rawKey = arg.slice(2).split('=', 1)[0];
    if (rawKey !== 'pack') continue;

    const inlineValue = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : undefined;
    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('Missing value for --pack');
    }

    ids.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  if (ids.length === 0) {
    return undefined;
  }

  developmentPacksFromIds(ids);
  return ids as DevelopmentPackId[];
}
