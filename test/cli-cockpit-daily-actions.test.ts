import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectDailyActionArgs, type DailyActionPromptDeps } from '../src/cockpit/daily-prompts.js';

type PromptAnswers = {
  select?: unknown[];
  text?: unknown[];
  list?: unknown[];
};

function promptDeps(answers: PromptAnswers): DailyActionPromptDeps {
  const selectAnswers = [...(answers.select ?? [])];
  const textAnswers = [...(answers.text ?? [])];
  const listAnswers = [...(answers.list ?? [])];

  return {
    async select() {
      return selectAnswers.shift();
    },
    async text(options) {
      const answer = textAnswers.shift();
      return answer ?? options.defaultValue ?? '';
    },
    async list(options) {
      const answer = listAnswers.shift();
      return answer ?? options.initialValue ?? '';
    },
  };
}

async function makeEnvironment(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), 'wpmoo-cockpit-daily-'));
  await mkdir(join(target, 'odoo/custom/src/private/source_repo/sale'), { recursive: true });
  await mkdir(join(target, 'odoo/custom/src/private/source_repo/stock'), { recursive: true });
  await writeFile(
    join(target, '.gitmodules'),
    '[submodule "odoo/custom/src/private/source_repo"]\n\tpath = odoo/custom/src/private/source_repo\n',
  );
  await writeFile(join(target, 'odoo/custom/src/private/source_repo/sale/__manifest__.py'), '{}');
  await writeFile(join(target, 'odoo/custom/src/private/source_repo/stock/__manifest__.py'), '{}');
  return target;
}

describe('cockpit daily action prompts', () => {
  it('returns no argv for no-arg commands', async () => {
    const target = await makeEnvironment();

    await expect(collectDailyActionArgs('start', target, promptDeps({}))).resolves.toEqual([]);
    await expect(collectDailyActionArgs('restart', target, promptDeps({}))).resolves.toEqual([]);
    await expect(collectDailyActionArgs('shell', target, promptDeps({}))).resolves.toEqual([]);
    await expect(collectDailyActionArgs('lint', target, promptDeps({}))).resolves.toEqual([]);
    await expect(collectDailyActionArgs('stop', target, promptDeps({}))).resolves.toEqual([]);
  });

  it('uses odoo as the default logs service', async () => {
    const target = await makeEnvironment();

    await expect(collectDailyActionArgs('logs', target, promptDeps({ text: [''] }))).resolves.toEqual(['odoo']);
  });

  it('uses postgres as the default psql database', async () => {
    const target = await makeEnvironment();

    await expect(collectDailyActionArgs('psql', target, promptDeps({ text: [''] }))).resolves.toEqual(['postgres']);
  });

  it('builds test argv from module, db, mode, and optional tags prompts', async () => {
    const target = await makeEnvironment();

    await expect(
      collectDailyActionArgs(
        'test',
        target,
        promptDeps({
          select: ['sale'],
          text: ['staging', '/sale'],
          list: ['init'],
        }),
      ),
    ).resolves.toEqual(['sale', '--db', 'staging', '--mode', 'init', '--tags', '/sale']);
  });

  it('defaults pot output from the selected module', async () => {
    const target = await makeEnvironment();

    await expect(
      collectDailyActionArgs(
        'pot',
        target,
        promptDeps({
          select: ['sale'],
          text: ['', ''],
        }),
      ),
    ).resolves.toEqual(['sale', 'devel', 'i18n/sale.pot']);
  });

  it('requires restore-snapshot snapshot name before db', async () => {
    const target = await makeEnvironment();

    await expect(
      collectDailyActionArgs('restore-snapshot', target, promptDeps({ text: ['pre-upgrade', 'prod'] })),
    ).resolves.toEqual(['pre-upgrade', 'prod']);
  });

  it('falls back to manual module entry when no modules are detected', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-cockpit-daily-empty-'));

    await expect(
      collectDailyActionArgs(
        'install',
        target,
        promptDeps({
          text: ['custom_addon,other_addon', ''],
        }),
      ),
    ).resolves.toEqual(['custom_addon,other_addon']);
  });
});
