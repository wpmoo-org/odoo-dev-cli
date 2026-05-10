import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { execa } from 'execa';

export type GitRunner = {
  run(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
};

export const realGit: GitRunner = {
  async run(cwd, args) {
    const result = await execa('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_ALLOW_PROTOCOL: 'file:https:ssh:git',
      },
    });
    return { stdout: result.stdout, stderr: result.stderr };
  },
};

export async function hasRemoteHeads(git: GitRunner, cwd: string, repoUrl: string): Promise<boolean> {
  const result = await git.run(cwd, ['ls-remote', '--heads', repoUrl]);
  return result.stdout.trim().length > 0;
}

export async function initializeEmptyRemote(
  git: GitRunner,
  cwd: string,
  repoUrl: string,
  branch: string,
): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'wpmoo-init-'));
  const cloneDir = join(tempRoot, basename(repoUrl).replace(/\.git$/, '') || 'repo');

  try {
    await git.run(tempRoot, ['clone', repoUrl, cloneDir]);
    await git.run(cloneDir, ['config', 'user.name', 'Create Odoo Dev Bot']);
    await git.run(cloneDir, ['config', 'user.email', 'dev@example.com']);
    await git.run(cloneDir, ['commit', '--allow-empty', '-m', 'Initial commit']);
    await git.run(cloneDir, ['push', 'origin', `HEAD:${branch}`]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function ensureRemoteHasBranch(
  git: GitRunner,
  cwd: string,
  repoUrl: string,
  branch: string,
  initEmptyRepos: boolean,
): Promise<void> {
  const hasHeads = await hasRemoteHeads(git, cwd, repoUrl);

  if (!hasHeads) {
    if (!initEmptyRepos) {
      throw new Error(`Repository has no commits: ${repoUrl}`);
    }
    await initializeEmptyRemote(git, cwd, repoUrl, branch);
    return;
  }

  const branchResult = await git.run(cwd, ['ls-remote', '--heads', repoUrl, branch]);
  if (!branchResult.stdout.trim()) {
    throw new Error(`Repository ${repoUrl} does not have branch ${branch}`);
  }
}

export async function addSubmodule(
  git: GitRunner,
  target: string,
  repoUrl: string,
  branch: string,
  path: string,
): Promise<void> {
  await git.run(target, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-b', branch, repoUrl, path]);
}

export async function isTrackedPath(git: GitRunner, target: string, path: string): Promise<boolean> {
  try {
    await git.run(target, ['ls-files', '--error-unmatch', path]);
    return true;
  } catch {
    return false;
  }
}

export async function ensureSubmodule(
  git: GitRunner,
  target: string,
  repoUrl: string,
  branch: string,
  path: string,
): Promise<void> {
  if (await isTrackedPath(git, target, path)) {
    await git.run(target, ['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive', path]);
    return;
  }

  await addSubmodule(git, target, repoUrl, branch, path);
}

export async function cloneRepository(
  git: GitRunner,
  cwd: string,
  repoUrl: string,
  target: string,
): Promise<void> {
  await git.run(cwd, ['clone', repoUrl, target]);
}

export async function syncSubmodules(git: GitRunner, target: string): Promise<void> {
  await git.run(target, ['submodule', 'sync', '--recursive']);
}

export async function stageAll(git: GitRunner, target: string): Promise<void> {
  await git.run(target, ['add', '.']);
}

export async function getOriginUrl(git: GitRunner, target: string): Promise<string | undefined> {
  try {
    const result = await git.run(target, ['remote', 'get-url', 'origin']);
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
