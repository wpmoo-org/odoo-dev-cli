import type { RepositoryVisibility } from './github.js';

export type SourceRepo = {
  url: string;
  path: string;
  addons: string[];
};

export type CreateOptions = {
  product: string;
  odooVersion: string;
  devRepo: string;
  devRepoUrl: string;
  sourceRepos: SourceRepo[];

  // Legacy fields kept for CLI compatibility and older tests/consumers.
  org?: string;
  communityRepo?: string;
  proRepo?: string;
  communityRepoUrl?: string;
  proRepoUrl?: string;
  communityAddons?: string[];
  proAddons?: string[];
};

export type ScaffoldOptions = CreateOptions & {
  target: string;
  dryRun: boolean;
  initEmptyRepos: boolean;
  stage: boolean;
  createMissingRepos?: boolean;
  repoVisibility?: RepositoryVisibility;
  skipSubmodules?: boolean;
};

export type ScaffoldResult = {
  plannedFiles: string[];
  plannedCommands: string[];
};
