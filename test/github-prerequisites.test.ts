import { describe, expect, it } from 'vitest';

import {
  getGitHubPrerequisiteStatus,
  renderGitHubPrerequisiteGuidance,
} from '../src/github-prerequisites.js';
import type { GitHubRunner } from '../src/github.js';

describe('github-prerequisites', () => {
  it('returns missing when gh is unavailable', async () => {
    const runner: GitHubRunner = {
      async run() {
        throw new Error('spawn gh ENOENT');
      },
    };

    await expect(getGitHubPrerequisiteStatus(runner)).resolves.toEqual({
      status: 'missing',
      reason: 'gh-missing',
    });
  });

  it('returns unauthenticated when gh is present but not logged in', async () => {
    const runner: GitHubRunner = {
      async run(args) {
        if (args[0] === '--version') {
          return { stdout: 'gh version 2.0.0', stderr: '' };
        }

        throw new Error('not logged in');
      },
    };

    await expect(getGitHubPrerequisiteStatus(runner)).resolves.toEqual({
      status: 'unauthenticated',
      reason: 'gh-unauthenticated',
    });
  });

  it('returns ready when gh is available and authenticated', async () => {
    const runner: GitHubRunner = {
      async run(args) {
        if (args[0] === '--version') {
          return { stdout: 'gh version 2.0.0', stderr: '' };
        }

        if (args[0] === 'api' && args[1] === 'user') {
          return { stdout: 'wpmoo\n', stderr: '' };
        }

        throw new Error('Unexpected command');
      },
    };

    await expect(getGitHubPrerequisiteStatus(runner)).resolves.toEqual({ status: 'ready' });
  });

  it('renders guidance text for missing gh with install and login instructions', () => {
    expect(
      renderGitHubPrerequisiteGuidance({
        status: 'missing',
        reason: 'gh-missing',
      }),
    ).toBe(
      [
        'GitHub CLI (`gh`) is not available or not authenticated.',
        'Install and authenticate it to auto-create missing GitHub repositories:',
        '',
        'brew install gh',
        'gh auth login',
      ].join('\n'),
    );
  });

  it('renders guidance text for unauthenticated gh with install and login instructions', () => {
    expect(
      renderGitHubPrerequisiteGuidance({
        status: 'unauthenticated',
        reason: 'gh-unauthenticated',
      }),
    ).toBe(
      [
        'GitHub CLI (`gh`) is not available or not authenticated.',
        'Install and authenticate it to auto-create missing GitHub repositories:',
        '',
        'brew install gh',
        'gh auth login',
      ].join('\n'),
    );
  });

  it('renders empty guidance for ready status', () => {
    expect(renderGitHubPrerequisiteGuidance({ status: 'ready' })).toBe('');
  });
});
