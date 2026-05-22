import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  moduleBrowserChoices,
  searchModuleBrowserChoices,
  selectModuleFromBrowser,
  type ModuleBrowserSearchPrompt,
  type ModuleBrowserSelectPrompt,
} from '../src/cockpit/module-browser.js';
import type { ListedModule } from '../src/module-actions.js';

type BrowserChoice = ReturnType<typeof moduleBrowserChoices>[number];

function isSeparator(choice: BrowserChoice): choice is Extract<BrowserChoice, { separator: string }> {
  return 'separator' in choice;
}

function isChoice(choice: BrowserChoice): choice is Extract<BrowserChoice, { value: ListedModule }> {
  return 'value' in choice;
}

function rgb(red: number, green: number, blue: number, value: string): string {
  return `\u001B[38;2;${red};${green};${blue}m${value}\u001B[39m`;
}

function dim(value: string): string {
  return `\u001B[2m${value}\u001B[22m`;
}

function moduleLabel(moduleName: string, repoPath: string, width: number): string {
  return `${rgb(226, 184, 96, ` ${moduleName.padEnd(width)}`)}${dim(`  ${repoPath}`)}`;
}

function moduleHeading(repoPath: string, repoContext: string, width: number): string {
  const repoLabel = `${repoPath.padEnd(width)}`;
  return `\u001B[1D${rgb(143, 211, 255, `📁 ${repoLabel}`)}${dim(`    ${repoContext}`)}`;
}

describe('cockpit module browser', () => {
  it('filters large module lists by module, repo, and source terms', () => {
    const modules: ListedModule[] = [
      { moduleName: 'account_batch_payment', repoPath: 'account-payment', sourceType: 'oca', repoSlug: 'OCA/account-payment' },
      { moduleName: 'moo_test', repoPath: 'custom_repo', sourceType: 'private', repoSlug: 'wpmoo-org/custom_repo' },
      { moduleName: 'stock_connector', repoPath: 'vendor_tools', sourceType: 'external', repoUrl: 'https://example.org/vendor-tools.git' },
    ];

    expect(searchModuleBrowserChoices(modules, 'oca account').map((choice) => choice.value.moduleName)).toEqual([
      'account_batch_payment',
    ]);
    expect(searchModuleBrowserChoices(modules, 'moo').map((choice) => choice.value.moduleName)).toEqual(['moo_test']);
    expect(searchModuleBrowserChoices(modules, 'vendor').map((choice) => choice.value.moduleName)).toEqual([
      'stock_connector',
    ]);
  });

  it('groups modules by source category with compact source context labels', () => {
    const modules: ListedModule[] = [
      {
        moduleName: 'sale_order_queue',
        repoPath: 'server-tools',
        sourceType: 'oca',
        repoSlug: 'OCA/server-tools',
      },
      { moduleName: 'purchase', repoPath: 'server-tools', sourceType: 'oca', repoSlug: 'OCA/server-tools' },
      { moduleName: 'moo_olympiad', repoPath: 'moo_olympiad', sourceType: 'private', repoSlug: 'wpmoo-org/moo_olympiad' },
      { moduleName: 'connector_x', repoPath: 'vendor_tools', sourceType: 'external', repoUrl: 'https://example.org/vendor-tools.git' },
    ];

    const choices = moduleBrowserChoices(modules);

    const moduleWidth = Math.max(...modules.map((module) => module.moduleName.length), 1);
    const repoWidth = Math.max(...modules.map((module) => module.repoPath.length), 1);
    expect(choices.map((choice) => (isSeparator(choice) ? choice.separator : choice.name))).toEqual([
      '\u001B[1D' + rgb(143, 211, 255, 'Private'),
      moduleHeading('moo_olympiad', 'wpmoo-org/moo_olympiad', repoWidth),
      moduleLabel('moo_olympiad', 'private/moo_olympiad', moduleWidth),
      ' ',
      '\u001B[1D' + rgb(143, 211, 255, 'OCA'),
      moduleHeading('server-tools', 'OCA/server-tools', repoWidth),
      moduleLabel('purchase', 'oca/server-tools', moduleWidth),
      moduleLabel('sale_order_queue', 'oca/server-tools', moduleWidth),
      ' ',
      '\u001B[1D' + rgb(143, 211, 255, 'External'),
      moduleHeading('vendor_tools', 'vendor_tools', repoWidth),
      moduleLabel('connector_x', 'external/vendor_tools', moduleWidth),
    ]);
  });

  it('uses hidden back-navigation select help and returns the selected module with source context', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-browser-'));
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/manifests/sources.yaml'),
      [
        'sources:',
        '  - type: "private"',
        '    path: "moo_olympiad"',
        '    url: "https://github.com/wpmoo-org/moo_olympiad.git"',
        '    addons:',
        '      - "moo_olympiad"',
        '',
      ].join('\n'),
      'utf8',
    );
    await mkdir(join(target, 'odoo/custom/src/private/moo_olympiad/moo_olympiad'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/src/private/moo_olympiad/moo_olympiad/__manifest__.py'),
      '{}\n',
      'utf8',
    );

    const select: ModuleBrowserSelectPrompt = vi.fn(async (options) => {
      const choice = options.choices.find(isChoice);
      expect(options).toMatchObject({
        message: '',
        hideMessage: true,
        navigationHelp: 'back',
        loop: false,
      });
      expect(choice?.value).toMatchObject({
        moduleName: 'moo_olympiad',
        repoPath: 'moo_olympiad',
        sourceType: 'private',
      });
      return choice?.value;
    });

    await expect(selectModuleFromBrowser(target, { select })).resolves.toMatchObject({
      moduleName: 'moo_olympiad',
      repoPath: 'moo_olympiad',
      sourceType: 'private',
    });
  });

  it('uses searchable selection for large module lists', async () => {
    const target = await mkdtemp(join(tmpdir(), 'wpmoo-module-browser-search-'));
    await mkdir(join(target, 'odoo/custom/manifests'), { recursive: true });
    await writeFile(
      join(target, 'odoo/custom/manifests/sources.yaml'),
      [
        'sources:',
        '  - type: "private"',
        '    path: "custom_repo"',
        '    url: "https://github.com/wpmoo-org/custom_repo.git"',
        '    addons:',
        ...Array.from({ length: 21 }, (_, index) => `      - "module_${index.toString().padStart(2, '0')}"`),
        '      - "moo_test"',
        '',
      ].join('\n'),
      'utf8',
    );
    const moduleNames = [
      ...Array.from({ length: 21 }, (_, index) => `module_${index.toString().padStart(2, '0')}`),
      'moo_test',
    ];
    for (const moduleName of moduleNames) {
      await mkdir(join(target, 'odoo/custom/src/private/custom_repo', moduleName), { recursive: true });
      await writeFile(join(target, 'odoo/custom/src/private/custom_repo', moduleName, '__manifest__.py'), '{}\n', 'utf8');
    }

    const search: ModuleBrowserSearchPrompt = vi.fn(async (options) => {
      const choices = (await options.source('moo', {
        signal: new AbortController().signal,
      })) as ReturnType<typeof searchModuleBrowserChoices>;
      expect(options.message).toBe('Search modules');
      expect(choices.map((choice) => choice.value.moduleName)).toEqual(['moo_test']);
      return choices[0]?.value;
    });
    const select: ModuleBrowserSelectPrompt = vi.fn();

    await expect(selectModuleFromBrowser(target, { search, select })).resolves.toMatchObject({
      moduleName: 'moo_test',
      repoPath: 'custom_repo',
      sourceType: 'private',
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });
});
