import { basename } from 'node:path';

export function normalizeRepositoryUrl(repoUrl: string): string {
  const trimmed = repoUrl.trim();
  const withoutSuffix = trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/, '');
  const orgPageMatch = withoutSuffix.match(/^https:\/\/github\.com\/orgs\/([^/]+)\/([^/]+)$/);

  if (orgPageMatch) {
    return `https://github.com/${orgPageMatch[1]}/${orgPageMatch[2]}.git`;
  }

  return trimmed;
}

export function inferRepoPath(repoUrl: string): string {
  const trimmed = normalizeRepositoryUrl(repoUrl).replace(/[?#].*$/, '').replace(/\/+$/, '');
  const lastSegment = basename(trimmed);
  const withoutGit = lastSegment.replace(/\.git$/, '');

  if (!withoutGit) {
    throw new Error(`Cannot infer repository path from URL: ${repoUrl}`);
  }

  return withoutGit;
}

export function inferGitHubOwner(repoUrl: string): string | undefined {
  const normalized = normalizeRepositoryUrl(repoUrl);
  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+)\//);
  if (httpsMatch) return httpsMatch[1];

  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\//);
  return sshMatch?.[1];
}
