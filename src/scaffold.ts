import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  addSubmodule,
  cloneRepository,
  ensureRemoteHasBranch,
  realGit,
  stageAll,
  syncSubmodules,
  type GitRunner,
} from './git.js';
import {
  renderAddonsYaml,
  renderAgents,
  renderAppstoreRelease,
  renderGitignore,
  renderPlaceholder,
  renderReadme,
  renderReposYaml,
} from './templates.js';
import type { ScaffoldOptions, ScaffoldResult } from './types.js';

type GeneratedFile = {
  path: string;
  content: string;
};

export function generatedFiles(options: ScaffoldOptions): GeneratedFile[] {
  return [
    { path: '.gitignore', content: renderGitignore() },
    { path: 'README.md', content: renderReadme(options) },
    { path: 'AGENTS.md', content: renderAgents(options) },
    { path: 'docs/appstore-release.md', content: renderAppstoreRelease(options) },
    { path: 'odoo/custom/src/addons.yaml', content: renderAddonsYaml(options) },
    { path: 'odoo/custom/src/repos.yaml', content: renderReposYaml(options) },
    {
      path: 'odoo/custom/dependencies/apt.txt',
      content: '# Add Debian/Ubuntu package dependencies here, one per line.\n',
    },
    {
      path: 'odoo/custom/dependencies/pip.txt',
      content: '# Add Python package dependencies here, one per line.\n',
    },
    {
      path: 'odoo/custom/dependencies/npm.txt',
      content: '# Add Node package dependencies here, one per line.\n',
    },
    {
      path: 'odoo/custom/conf.d/README.md',
      content: renderPlaceholder('conf.d', 'Place project-specific Odoo config snippets here.'),
    },
    {
      path: 'odoo/custom/entrypoint.d/README.md',
      content: renderPlaceholder('entrypoint.d', 'Place executable startup hooks here.'),
    },
    {
      path: 'odoo/custom/build.d/README.md',
      content: renderPlaceholder('build.d', 'Place executable image build hooks here.'),
    },
  ];
}

async function writeGeneratedFiles(target: string, files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const destination = join(target, file.path);
    await mkdir(join(destination, '..'), { recursive: true });
    await writeFile(destination, file.content, 'utf8');
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepository(git: GitRunner, target: string): Promise<boolean> {
  if (!(await pathExists(target))) {
    return false;
  }

  try {
    const result = await git.run(target, ['rev-parse', '--is-inside-work-tree']);
    return result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function prepareTargetRepository(options: ScaffoldOptions, git: GitRunner): Promise<void> {
  if (await isGitRepository(git, options.target)) {
    return;
  }

  if (await pathExists(options.target)) {
    throw new Error(
      `Target exists but is not a Git repository: ${options.target}\n` +
        'Clone the dev environment repository first, or remove the directory and run the CLI again.',
    );
  }

  await mkdir(dirname(options.target), { recursive: true });
  await cloneRepository(git, dirname(options.target), options.devRepoUrl, options.target);
}

export async function scaffold(
  options: ScaffoldOptions,
  git: GitRunner = realGit,
): Promise<ScaffoldResult> {
  const files = generatedFiles(options);
  const plannedCommands = options.sourceRepos.map(
    (repo) =>
      `git submodule add -b ${options.odooVersion} ${repo.url} odoo/custom/src/private/${repo.path}`,
  );

  if (options.stage) {
    plannedCommands.push('git add .');
  }

  if (options.dryRun) {
    return {
      plannedFiles: files.map((file) => file.path),
      plannedCommands,
    };
  }

  if (!options.skipSubmodules || options.stage) {
    await prepareTargetRepository(options, git);
  }
  await writeGeneratedFiles(options.target, files);

  if (!options.skipSubmodules) {
    for (const repo of options.sourceRepos) {
      await ensureRemoteHasBranch(git, options.target, repo.url, options.odooVersion, options.initEmptyRepos);
    }
    await mkdir(join(options.target, 'odoo/custom/src/private'), { recursive: true });
    for (const repo of options.sourceRepos) {
      await addSubmodule(git, options.target, repo.url, options.odooVersion, `odoo/custom/src/private/${repo.path}`);
    }
    await syncSubmodules(git, options.target);
  }

  if (options.stage) {
    await stageAll(git, options.target);
  }

  return {
    plannedFiles: files.map((file) => file.path),
    plannedCommands,
  };
}
