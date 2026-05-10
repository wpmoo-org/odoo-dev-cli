import type { GitHubRunner, RepositoryVisibility } from './github.js';
import {
  createGitHubRepository,
  getGitHubRepositoryStatus,
  githubSlug,
  isGitHubAuthenticated,
  isGitHubCliAvailable,
  realGitHub,
} from './github.js';
import type { ScaffoldOptions } from './types.js';

export type RepositoryRequirement = {
  label: string;
  url: string;
  defaultVisibility: RepositoryVisibility;
};

export type MissingRepository = RepositoryRequirement & {
  slug: string;
};

export function repositoryRequirements(options: ScaffoldOptions): RepositoryRequirement[] {
  return [
    {
      label: 'Dev environment repo',
      url: options.devRepoUrl,
      defaultVisibility: 'private',
    },
    ...options.sourceRepos.map((repo) => ({
      label: `Module source repo: ${repo.path}`,
      url: repo.url,
      defaultVisibility: 'private' as const,
    })),
  ];
}

export async function findInaccessibleGitHubRepositories(
  options: ScaffoldOptions,
  runner: GitHubRunner = realGitHub,
): Promise<MissingRepository[]> {
  const missing: MissingRepository[] = [];

  for (const requirement of repositoryRequirements(options)) {
    const status = await getGitHubRepositoryStatus(runner, requirement.url);
    if (status.status === 'inaccessible') {
      missing.push({ ...requirement, slug: status.slug });
    }
  }

  return missing;
}

export async function createGitHubRepositories(
  repositories: MissingRepository[],
  visibility: RepositoryVisibility,
  runner: GitHubRunner = realGitHub,
): Promise<void> {
  for (const repository of repositories) {
    await createGitHubRepository(runner, repository.url, visibility);
  }
}

export async function repositoryPreflightAvailable(runner: GitHubRunner = realGitHub): Promise<boolean> {
  return (await isGitHubCliAvailable(runner)) && (await isGitHubAuthenticated(runner));
}

export function manualCreateCommands(repositories: MissingRepository[]): string[] {
  return repositories.map((repository) => {
    const slug = githubSlug(repository.url) ?? repository.url;
    return `gh repo create ${slug} --${repository.defaultVisibility}`;
  });
}
