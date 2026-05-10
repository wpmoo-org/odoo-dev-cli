import { basename } from 'node:path';

export function inferRepoPath(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const lastSegment = basename(trimmed);
  const withoutGit = lastSegment.replace(/\.git$/, '');

  if (!withoutGit) {
    throw new Error(`Cannot infer repository path from URL: ${repoUrl}`);
  }

  return withoutGit;
}

export function inferGitHubOwner(repoUrl: string): string | undefined {
  const httpsMatch = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\//);
  if (httpsMatch) return httpsMatch[1];

  const sshMatch = repoUrl.match(/^git@github\.com:([^/]+)\//);
  return sshMatch?.[1];
}
