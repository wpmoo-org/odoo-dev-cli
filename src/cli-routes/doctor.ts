import { parseArgs } from '../args.js';
import type { DoctorCommandOptions } from '../doctor.js';
import { booleanOption, jsonOption } from './options.js';

export type DoctorCliOptions = DoctorCommandOptions & {
  json: boolean;
};

export function doctorOptionsFromArgs(argv: string[]): DoctorCliOptions {
  const { values } = parseArgs(argv);
  const keys = Object.keys(values);
  const allowedKeys = new Set(['fix', 'json', 'postgres']);
  if (!keys.every((key) => allowedKeys.has(key))) {
    throw new Error('Usage: wpmoo doctor');
  }

  const options: DoctorCliOptions = {
    json: jsonOption(values),
  };
  if (Object.hasOwn(values, 'fix')) {
    options.fix = booleanOption(values, 'fix', false);
  }
  if (Object.hasOwn(values, 'postgres')) {
    options.postgres = booleanOption(values, 'postgres', false);
  }

  return options;
}
