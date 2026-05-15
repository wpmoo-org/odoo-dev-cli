import { cp, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { realGit, type GitRunner } from './git.js';

export type ExternalAssetOptions = {
  label: string;
  source: string;
  destination: string;
  ref?: string;
  sourceSubdirCandidates?: string[];
  sourceSubdir?: string;
  destinationSubdir?: string;
  exclude?: string[];
  readmeDestination?: string;
};

type CheckedOutSource = {
  root: string;
  cleanup?: string;
};

const defaultExcludes = ['.git', 'node_modules', '.DS_Store'];

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function expandHome(path: string): string {
  if (path === '~') return process.env.HOME ?? path;
  if (path.startsWith('~/')) return join(process.env.HOME ?? '~', path.slice(2));
  return path;
}

export function gitUrlFromSource(source: string): string | undefined {
  if (source.startsWith('gh:')) {
    return `https://github.com/${source.slice(3).replace(/\.git$/, '')}.git`;
  }

  if (source.startsWith('git:github.com/')) {
    return `https://github.com/${source.slice('git:github.com/'.length).replace(/\.git$/, '')}.git`;
  }

  if (/^(https?:|ssh:|git:)/.test(source) || /^[^\s@]+@[^\s:]+:.+/.test(source)) {
    return source;
  }

  return undefined;
}

async function checkoutSource(git: GitRunner, source: string, ref?: string): Promise<CheckedOutSource> {
  const gitUrl = gitUrlFromSource(source);
  if (!gitUrl) {
    return { root: resolve(expandHome(source)) };
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'wpmoo-external-'));
  const cloneDir = join(tempRoot, 'source');
  const cloneArgs = ['clone', '--depth', '1'];
  if (ref) {
    cloneArgs.push('--branch', ref);
  }
  cloneArgs.push(gitUrl, cloneDir);

  try {
    await git.run(tempRoot, cloneArgs);
  } catch (error) {
    if (!ref) {
      await rm(tempRoot, { recursive: true, force: true });
      throw error;
    }

    await rm(cloneDir, { recursive: true, force: true });
    await git.run(tempRoot, ['clone', gitUrl, cloneDir]);
    await git.run(cloneDir, ['checkout', ref]);
  }

  return { root: cloneDir, cleanup: tempRoot };
}

function isExcluded(relativePath: string, excludes: string[]): boolean {
  const normalized = relativePath.split('\\').join('/');
  return excludes.some((pattern) => normalized === pattern || normalized.startsWith(`${pattern}/`));
}

async function copyDirectory(options: ExternalAssetOptions, checkedOut: CheckedOutSource): Promise<void> {
  const selectedSourceSubdir = await selectSourceSubdir(options, checkedOut.root);
  const sourcePath = selectedSourceSubdir ? join(checkedOut.root, selectedSourceSubdir) : checkedOut.root;
  const destinationPath = options.destinationSubdir
    ? join(options.destination, options.destinationSubdir)
    : options.destination;

  if (!(await pathExists(sourcePath))) {
    throw new Error(`External asset source path does not exist: ${sourcePath}`);
  }

  const excludes = [...defaultExcludes, ...(options.exclude ?? [])];
  await mkdir(destinationPath, { recursive: true });
  await cp(sourcePath, destinationPath, {
    recursive: true,
    force: true,
    filter: (source) => {
      const rel = relative(sourcePath, source);
      return !rel || !isExcluded(rel, excludes);
    },
  });

  if (options.readmeDestination) {
    const selectedReadmePath = selectedSourceSubdir ? join(checkedOut.root, selectedSourceSubdir, 'README.md') : undefined;
    const readmePath =
      selectedReadmePath && (await pathExists(selectedReadmePath))
        ? selectedReadmePath
        : join(checkedOut.root, 'README.md');
    if (await pathExists(readmePath)) {
      const destination = join(options.destination, options.readmeDestination);
      await mkdir(dirname(destination), { recursive: true });
      await cp(readmePath, destination, { force: true });
    }
  }
}

async function selectSourceSubdir(options: ExternalAssetOptions, root: string): Promise<string | undefined> {
  for (const candidate of options.sourceSubdirCandidates ?? []) {
    if (await pathExists(join(root, candidate))) {
      return candidate;
    }
  }

  return options.sourceSubdir;
}

export function renderExternalAssetCommand(options: ExternalAssetOptions): string {
  const sourcePath = options.sourceSubdir ? `${options.source}/${options.sourceSubdir}` : options.source;
  const destinationPath = options.destinationSubdir
    ? `${options.destination}/${options.destinationSubdir}`
    : options.destination;
  const ref = options.ref ? `#${options.ref}` : '';
  return `copy external ${options.label}: ${sourcePath}${ref} -> ${destinationPath}`;
}

export async function applyExternalAsset(
  options: ExternalAssetOptions,
  git: GitRunner = realGit,
): Promise<void> {
  const checkedOut = await checkoutSource(git, options.source, options.ref);
  try {
    await copyDirectory(options, checkedOut);
  } finally {
    if (checkedOut.cleanup) {
      await rm(checkedOut.cleanup, { recursive: true, force: true });
    }
  }
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
