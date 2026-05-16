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

export type DevRepositoryInspection = {
  status: 'empty' | 'non-empty' | 'unknown';
  repository: MissingRepository;
};

export type RepositoryCheckResult = {
  accessible: MissingRepository[];
  inaccessible: MissingRepository[];
  blocked: MissingRepository[];
};

export function repositoryRequirements(options: ScaffoldOptions): RepositoryRequirement[] {
  return [
    {
      label: 'Dev environment repo',
      url: options.devRepoUrl,
      defaultVisibility: 'private',
    },
    ...options.sourceRepos.map((repo) => ({
      label: `Source repo: ${repo.path}`,
      url: repo.url,
      defaultVisibility: 'private' as const,
    })),
  ];
}

export async function findInaccessibleGitHubRepositories(
  options: ScaffoldOptions,
  runner: GitHubRunner = realGitHub,
): Promise<MissingRepository[]> {
  return (await checkGitHubRepositories(options, runner)).inaccessible;
}

export async function getGitHubRepositorySize(runner: GitHubRunner, slug: string): Promise<number> {
  const result = await runner.run(['api', `repos/${slug}`, '--jq', '.size']);
  const rawSize = result.stdout.trim();
  if (!rawSize) {
    throw new Error(`Unable to parse repository size for ${slug}`);
  }
  const size = Number(rawSize);
  if (!Number.isFinite(size)) {
    throw new Error(`Unable to parse repository size for ${slug}`);
  }

  return size;
}

export async function inspectGitHubRepository(
  runner: GitHubRunner,
  repository: MissingRepository,
): Promise<DevRepositoryInspection> {
  try {
    const size = await getGitHubRepositorySize(runner, repository.slug);
    return { status: size === 0 ? 'empty' : 'non-empty', repository };
  } catch {
    return { status: 'unknown', repository };
  }
}

export async function checkGitHubRepositories(
  options: ScaffoldOptions,
  runner: GitHubRunner = realGitHub,
): Promise<RepositoryCheckResult> {
  const accessible: MissingRepository[] = [];
  const inaccessible: MissingRepository[] = [];
  const blocked: MissingRepository[] = [];

  for (const requirement of repositoryRequirements(options)) {
    const status = await getGitHubRepositoryStatus(runner, requirement.url);
    if (status.status === 'accessible') {
      const repository = { ...requirement, slug: status.slug };
      if (requirement.url === options.devRepoUrl) {
        const inspection = await inspectGitHubRepository(runner, repository);
        if (inspection.status === 'empty') {
          accessible.push(repository);
        } else {
          blocked.push(repository);
        }
      } else {
        accessible.push(repository);
      }
    }
    if (status.status === 'inaccessible') {
      inaccessible.push({ ...requirement, slug: status.slug });
    }
  }

  return { accessible, inaccessible, blocked };
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
