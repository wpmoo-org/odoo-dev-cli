export type CreateOptions = {
  product: string;
  org: string;
  odooVersion: string;
  devRepo: string;
  communityRepo: string;
  proRepo: string;
  communityRepoUrl: string;
  proRepoUrl: string;
  communityAddons: string[];
  proAddons: string[];
};

export type ScaffoldOptions = CreateOptions & {
  target: string;
  dryRun: boolean;
  initEmptyRepos: boolean;
  stage: boolean;
  skipSubmodules?: boolean;
};

export type ScaffoldResult = {
  plannedFiles: string[];
  plannedCommands: string[];
};

