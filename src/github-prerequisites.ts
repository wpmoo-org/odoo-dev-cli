import { isGitHubAuthenticated, isGitHubCliAvailable, realGitHub, type GitHubRunner } from './github.js';

export type GitHubPrerequisiteStatus =
  | { status: 'missing'; reason: 'gh-missing' }
  | { status: 'unauthenticated'; reason: 'gh-unauthenticated' }
  | { status: 'ready' };

export async function getGitHubPrerequisiteStatus(
  runner: GitHubRunner = realGitHub,
): Promise<GitHubPrerequisiteStatus> {
  if (!(await isGitHubCliAvailable(runner))) {
    return { status: 'missing', reason: 'gh-missing' };
  }

  if (!(await isGitHubAuthenticated(runner))) {
    return { status: 'unauthenticated', reason: 'gh-unauthenticated' };
  }

  return { status: 'ready' };
}

export function renderGitHubPrerequisiteGuidance(status: GitHubPrerequisiteStatus): string {
  if (status.status === 'ready') {
    return '';
  }

  return [
    'GitHub CLI (`gh`) is not available or not authenticated.',
    'Install and authenticate it to auto-create missing GitHub repositories:',
    '',
    'brew install gh',
    'gh auth login',
  ].join('\n');
}
