import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  addSubmodule,
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

export async function scaffold(
  options: ScaffoldOptions,
  git: GitRunner = realGit,
): Promise<ScaffoldResult> {
  const files = generatedFiles(options);
  const plannedCommands = [
    `git submodule add -b ${options.odooVersion} ${options.communityRepoUrl} odoo/custom/src/private/${options.communityRepo}`,
    `git submodule add -b ${options.odooVersion} ${options.proRepoUrl} odoo/custom/src/private/${options.proRepo}`,
  ];

  if (options.stage) {
    plannedCommands.push('git add .');
  }

  if (options.dryRun) {
    return {
      plannedFiles: files.map((file) => file.path),
      plannedCommands,
    };
  }

  await writeGeneratedFiles(options.target, files);

  if (!options.skipSubmodules) {
    await ensureRemoteHasBranch(
      git,
      options.target,
      options.communityRepoUrl,
      options.odooVersion,
      options.initEmptyRepos,
    );
    await ensureRemoteHasBranch(
      git,
      options.target,
      options.proRepoUrl,
      options.odooVersion,
      options.initEmptyRepos,
    );
    await mkdir(join(options.target, 'odoo/custom/src/private'), { recursive: true });
    await addSubmodule(
      git,
      options.target,
      options.communityRepoUrl,
      options.odooVersion,
      `odoo/custom/src/private/${options.communityRepo}`,
    );
    await addSubmodule(
      git,
      options.target,
      options.proRepoUrl,
      options.odooVersion,
      `odoo/custom/src/private/${options.proRepo}`,
    );
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

