import { environmentOdooVersion } from './environment.js';

export async function commandOdooVersion(target: string, explicitVersion?: string): Promise<string> {
  const normalizedVersion = explicitVersion?.trim();
  return normalizedVersion || environmentOdooVersion(target);
}
