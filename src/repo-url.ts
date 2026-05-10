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
