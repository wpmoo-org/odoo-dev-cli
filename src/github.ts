import { execa } from 'execa';

export type RepositoryVisibility = 'private' | 'public';

export type GitHubRepo = {
  owner: string;
  name: string;
};

export type GitHubAccount = {
  login: string;
  type: 'user' | 'organization';
};

export type GitHubRepositoryStatus =
  | { status: 'accessible'; slug: string }
  | { status: 'inaccessible'; slug: string }
  | { status: 'unsupported'; slug?: undefined };

export type GitHubRunner = {
  run(args: string[]): Promise<{ stdout: string; stderr: string }>;
};

export const realGitHub: GitHubRunner = {
  async run(args) {
    const result = await execa('gh', args);
    return { stdout: result.stdout, stderr: result.stderr };
  },
};

export function parseGitHubRepoUrl(repoUrl: string): GitHubRepo | undefined {
  const normalized = repoUrl.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/, '');
  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }

  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  return undefined;
}

export function githubSlug(repoUrl: string): string | undefined {
  const repo = parseGitHubRepoUrl(repoUrl);
  return repo ? `${repo.owner}/${repo.name}` : undefined;
}

export function githubRepositoryUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

export async function isGitHubCliAvailable(runner: GitHubRunner = realGitHub): Promise<boolean> {
  try {
    await runner.run(['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function getAuthenticatedGitHubLogin(runner: GitHubRunner = realGitHub): Promise<string> {
  const result = await runner.run(['api', 'user', '--jq', '.login']);
  const login = result.stdout.trim();
  if (!login) {
    throw new Error('GitHub CLI is not authenticated');
  }
  return login;
}

export async function isGitHubAuthenticated(runner: GitHubRunner = realGitHub): Promise<boolean> {
  try {
    await getAuthenticatedGitHubLogin(runner);
    return true;
  } catch {
    return false;
  }
}

export async function listGitHubOrganizations(runner: GitHubRunner = realGitHub): Promise<string[]> {
  const result = await runner.run(['api', 'user/orgs', '--jq', '.[].login']);
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function getGitHubAccounts(runner: GitHubRunner = realGitHub): Promise<GitHubAccount[]> {
  const user = await getAuthenticatedGitHubLogin(runner);
  const organizations = await listGitHubOrganizations(runner);

  return [
    { login: user, type: 'user' },
    ...organizations.map((login) => ({ login, type: 'organization' as const })),
  ];
}

export async function getGitHubRepositoryStatus(
  runner: GitHubRunner,
  repoUrl: string,
): Promise<GitHubRepositoryStatus> {
  const slug = githubSlug(repoUrl);
  if (!slug) {
    return { status: 'unsupported' };
  }

  try {
    await runner.run(['repo', 'view', slug, '--json', 'name']);
    return { status: 'accessible', slug };
  } catch {
    return { status: 'inaccessible', slug };
  }
}

export async function createGitHubRepository(
  runner: GitHubRunner,
  repoUrl: string,
  visibility: RepositoryVisibility,
): Promise<void> {
  const slug = githubSlug(repoUrl);
  if (!slug) {
    throw new Error(`Only GitHub repository URLs can be created automatically: ${repoUrl}`);
  }

  await runner.run(['repo', 'create', slug, visibility === 'private' ? '--private' : '--public']);
}
