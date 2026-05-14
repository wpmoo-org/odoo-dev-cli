import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

import { addModuleToSourceRepo, removeModuleFromSourceRepo } from '../src/module-actions.js';
import { addModuleRepo, listModuleRepos } from '../src/repo-actions.js';
import { safeResetEnvironment } from '../src/safe-reset.js';
import { scaffold } from '../src/scaffold.js';

const composeScriptNames = [
  'up.sh',
  'down.sh',
  'logs.sh',
  'restart.sh',
  'shell.sh',
  'psql.sh',
  'install.sh',
  'update.sh',
  'test.sh',
  'resetdb.sh',
  'snapshot.sh',
  'restore-snapshot.sh',
  'lint.sh',
  'pot.sh',
];

async function git(cwd: string, args: string[]) {
  return execa('git', args, { cwd });
}

async function writeLocalComposeFixture(root: string): Promise<string> {
  const fixture = join(root, 'compose-fixture');
  await mkdir(join(fixture, 'scripts'), { recursive: true });
  await mkdir(join(fixture, 'etc'), { recursive: true });
  await writeFile(join(fixture, 'docker-compose_19.0.yml'), 'services:\n  odoo:\n    image: odoo:19\n', 'utf8');
  await writeFile(join(fixture, 'docker-compose_18.0.yml'), 'services:\n  odoo:\n    image: odoo:18\n', 'utf8');
  await writeFile(
    join(fixture, 'etc/odoo.conf'),
    '[options]\naddons_path = /usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons,/mnt/wpmoo-addons\n',
    'utf8',
  );
  await writeFile(join(fixture, 'README.md'), '# Local Compose Fixture\n', 'utf8');
  for (const scriptName of composeScriptNames) {
    await writeFile(join(fixture, 'scripts', scriptName), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  }

  return fixture;
}

describe('generated environment lifecycle and maintenance matrix', () => {
  it('preserves source repos and module directories across lifecycle maintenance flows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wpmoo-generated-env-lifecycle-'));
    const composeTemplateUrl = await writeLocalComposeFixture(root);
    const baseRemote = join(root, 'odoo_sample_module.git');
    const reportsRemote = join(root, 'odoo_sample_module_reports.git');
    const target = join(root, 'odoo_sample_module_dev');

    await git(root, ['init', '--bare', baseRemote]);
    await git(root, ['init', '--bare', reportsRemote]);
    await git(root, ['init', target]);
    await git(target, ['config', 'user.name', 'Test User']);
    await git(target, ['config', 'user.email', 'test@example.com']);
    await git(target, ['commit', '--allow-empty', '-m', 'Initial dev repo']);

    await scaffold({
      product: 'odoo_sample_module',
      odooVersion: '19.0',
      composeTemplateUrl,
      devRepo: 'odoo_sample_module_dev',
      devRepoUrl: target,
      sourceRepos: [
        {
          url: baseRemote,
          path: 'odoo_sample_module',
          addons: ['odoo_sample_module'],
        },
      ],
      target,
      dryRun: false,
      initEmptyRepos: true,
      stage: true,
      skipSubmodules: false,
    });
    await git(target, ['commit', '-m', 'Initial scaffold']);

    await addModuleRepo({
      target,
      repoUrl: reportsRemote,
      repoPath: 'odoo_sample_module_reports',
      odooVersion: '19.0',
      initEmptyRepos: true,
      stage: true,
    });

    await expect(readFile(join(target, '.gitmodules'), 'utf8')).resolves.toContain(
      'path = odoo/custom/src/private/odoo_sample_module_reports',
    );
    await expect(listModuleRepos(target)).resolves.toEqual(['odoo_sample_module', 'odoo_sample_module_reports']);
    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toContain('/mnt/wpmoo-addons');

    const moduleName = 'odoo_sample_module_reports_extra';
    const moduleDir = join(target, 'odoo/custom/src/private/odoo_sample_module_reports', moduleName);
    await mkdir(moduleDir, { recursive: true });
    await writeFile(join(moduleDir, '__manifest__.py'), '{}\n', 'utf8');

    await addModuleToSourceRepo({
      target,
      repoPath: 'odoo_sample_module_reports',
      moduleName,
      odooVersion: '19.0',
      stage: true,
    });
    await expect(stat(join(moduleDir, '__manifest__.py'))).resolves.toBeTruthy();

    await removeModuleFromSourceRepo({
      target,
      repoPath: 'odoo_sample_module_reports',
      moduleName,
      deleteFiles: false,
      stage: true,
    });
    await expect(stat(moduleDir)).resolves.toBeTruthy();

    await writeFile(join(target, 'moo'), '# stale moo script\n', 'utf8');
    await safeResetEnvironment({ target, stage: false });

    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module'))).resolves.toBeTruthy();
    await expect(stat(join(target, 'odoo/custom/src/private/odoo_sample_module_reports'))).resolves.toBeTruthy();
    await expect(stat(moduleDir)).resolves.toBeTruthy();
    await expect(readFile(join(target, 'moo'), 'utf8')).resolves.toContain('./scripts/up.sh');
    await expect(readFile(join(target, 'etc/odoo.conf'), 'utf8')).resolves.toContain('/mnt/wpmoo-addons');
    await expect(readFile(join(target, 'docker-compose_19.0.yml'), 'utf8')).resolves.toContain('odoo:19');
  });
});
