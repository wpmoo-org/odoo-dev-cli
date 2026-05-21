import { resolve } from 'node:path';

import { parseArgs } from '../args.js';
import type { SafeResetOptions } from '../safe-reset.js';
import { booleanOption, stringOption } from './options.js';

export type ResetCommandOptions = SafeResetOptions & {
  dryRun: boolean;
};

export function resetCommandOptionsFromArgs(argv: string[]): ResetCommandOptions {
  const { values } = parseArgs(argv);

  return {
    target: resolve(stringOption(values, 'target') ?? process.cwd()),
    stage: booleanOption(values, 'stage', true),
    dryRun: booleanOption(values, 'dryRun', false),
  };
}
