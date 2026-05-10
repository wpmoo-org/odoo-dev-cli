import { readEnvironmentMetadata } from './environment.js';
import { inferGitHubOwner } from './repo-url.js';

export async function environmentGitHubOwner(target: string): Promise<string | undefined> {
  const metadata = await readEnvironmentMetadata(target);
  return inferGitHubOwner(metadata?.devRepoUrl ?? '');
}

export async function environmentProduct(target: string): Promise<string | undefined> {
  const metadata = await readEnvironmentMetadata(target);
  return metadata?.product;
}
