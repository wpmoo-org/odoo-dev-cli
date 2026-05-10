import { describe, expect, it } from 'vitest';

import { applyDevelopmentPacks, type PackCommandRunner } from '../src/pack-actions.js';
import { emptyDevelopmentPacks } from '../src/packs.js';
import type { ScaffoldOptions } from '../src/types.js';

function options(packs = emptyDevelopmentPacks()): ScaffoldOptions {
  return {
    product: 'odoo_sample_module',
    odooVersion: '19.0',
    devRepo: 'odoo_sample_module_dev',
    devRepoUrl: 'https://github.com/example-org/odoo_sample_module_dev.git',
    sourceRepos: [
      {
        url: 'https://github.com/example-org/odoo_sample_module.git',
        path: 'odoo_sample_module',
        addons: ['odoo_sample_module'],
      },
    ],
    target: '/tmp/odoo_sample_module_dev',
    dryRun: false,
    initEmptyRepos: false,
    stage: false,
    packs,
  };
}

describe('development pack actions', () => {
  it('does nothing when no packs are selected', async () => {
    const calls: unknown[] = [];
    const runner: PackCommandRunner = {
      async run(cwd, command, args) {
        calls.push({ cwd, command, args });
        return { stdout: '', stderr: '' };
      },
    };

    await expect(applyDevelopmentPacks(options(), runner)).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it('installs the Agentic Stack Codex adapter inside the target environment', async () => {
    const calls: unknown[] = [];
    const runner: PackCommandRunner = {
      async run(cwd, command, args) {
        calls.push({ cwd, command, args });
        return { stdout: '', stderr: '' };
      },
    };

    await expect(
      applyDevelopmentPacks(
        options({
          ...emptyDevelopmentPacks(),
          agenticStack: true,
        }),
        runner,
      ),
    ).resolves.toEqual([
      {
        pack: 'agentic-stack',
        status: 'installed',
        message: 'Agentic Stack Codex adapter installed.',
      },
    ]);
    expect(calls).toEqual([
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'agentic-stack',
        args: ['codex', '--yes'],
      },
    ]);
  });

  it('skips Agentic Stack installation without failing when the command is missing', async () => {
    const runner: PackCommandRunner = {
      async run() {
        const error = new Error('spawn agentic-stack ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      },
    };

    await expect(
      applyDevelopmentPacks(
        options({
          ...emptyDevelopmentPacks(),
          agenticStack: true,
        }),
        runner,
      ),
    ).resolves.toEqual([
      {
        pack: 'agentic-stack',
        status: 'skipped',
        message:
          'Agentic Stack is not installed and Homebrew is not available. Install Agentic Stack first: https://github.com/codejunkie99/agentic-stack',
      },
    ]);
  });

  it('can install Agentic Stack with Homebrew and then retry the Codex adapter', async () => {
    const calls: Array<{ cwd: string; command: string; args: string[] }> = [];
    const runner: PackCommandRunner = {
      async run(cwd, command, args) {
        calls.push({ cwd, command, args });
        if (command === 'agentic-stack' && calls.filter((call) => call.command === 'agentic-stack').length === 1) {
          const error = new Error('spawn agentic-stack ENOENT') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
        return { stdout: '', stderr: '' };
      },
    };

    await expect(
      applyDevelopmentPacks(
        options({
          ...emptyDevelopmentPacks(),
          agenticStack: true,
        }),
        runner,
        {
          promptInstallAgenticStack: async () => true,
        },
      ),
    ).resolves.toEqual([
      {
        pack: 'agentic-stack',
        status: 'installed',
        message: 'Agentic Stack installed with Homebrew and Codex adapter installed.',
      },
    ]);
    expect(calls).toEqual([
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'agentic-stack',
        args: ['codex', '--yes'],
      },
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'brew',
        args: ['--version'],
      },
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'brew',
        args: ['tap', 'codejunkie99/agentic-stack', 'https://github.com/codejunkie99/agentic-stack'],
      },
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'brew',
        args: ['install', 'agentic-stack'],
      },
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'agentic-stack',
        args: ['codex', '--yes'],
      },
    ]);
  });

  it('continues without failing when Homebrew installation fails', async () => {
    const runner: PackCommandRunner = {
      async run(_cwd, command, args) {
        if (command === 'agentic-stack') {
          const error = new Error('spawn agentic-stack ENOENT') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
        if (command === 'brew' && args[0] === '--version') {
          return { stdout: 'Homebrew 4.0.0', stderr: '' };
        }
        throw new Error('brew failed');
      },
    };

    await expect(
      applyDevelopmentPacks(
        options({
          ...emptyDevelopmentPacks(),
          agenticStack: true,
        }),
        runner,
        {
          promptInstallAgenticStack: async () => true,
        },
      ),
    ).resolves.toEqual([
      {
        pack: 'agentic-stack',
        status: 'failed',
        message: 'Agentic Stack Homebrew installation failed: brew failed',
      },
    ]);
  });

  it('does not ask to install with Homebrew when Homebrew is missing', async () => {
    let prompted = false;
    const runner: PackCommandRunner = {
      async run(_cwd, command) {
        const error = new Error(`spawn ${command} ENOENT`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      },
    };

    await expect(
      applyDevelopmentPacks(
        options({
          ...emptyDevelopmentPacks(),
          agenticStack: true,
        }),
        runner,
        {
          promptInstallAgenticStack: async () => {
            prompted = true;
            return true;
          },
        },
      ),
    ).resolves.toEqual([
      {
        pack: 'agentic-stack',
        status: 'skipped',
        message:
          'Agentic Stack is not installed and Homebrew is not available. Install Agentic Stack first: https://github.com/codejunkie99/agentic-stack',
      },
    ]);
    expect(prompted).toBe(false);
  });

  it('uses Windows installation guidance instead of Homebrew prompts on Windows', async () => {
    let prompted = false;
    const runner: PackCommandRunner = {
      async run() {
        const error = new Error('spawn agentic-stack ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      },
    };

    await expect(
      applyDevelopmentPacks(
        options({
          ...emptyDevelopmentPacks(),
          agenticStack: true,
        }),
        runner,
        {
          platform: 'win32',
          promptInstallAgenticStack: async () => {
            prompted = true;
            return true;
          },
        },
      ),
    ).resolves.toEqual([
      {
        pack: 'agentic-stack',
        status: 'skipped',
        message:
          'Agentic Stack is not installed. On Windows, install it with the PowerShell installer from https://github.com/codejunkie99/agentic-stack, then rerun this command.',
      },
    ]);
    expect(prompted).toBe(false);
  });

  it('can install Homebrew Python and retry when Agentic Stack is running under unsupported Python', async () => {
    const calls: Array<{ cwd: string; command: string; args: string[] }> = [];
    const runner: PackCommandRunner = {
      async run(cwd, command, args) {
        calls.push({ cwd, command, args });
        if (command === 'agentic-stack' && calls.filter((call) => call.command === 'agentic-stack').length === 1) {
          throw new Error(
            "Command failed with exit code 1: agentic-stack codex --yes\nTypeError: unsupported operand type(s) for |: 'types.GenericAlias' and 'NoneType'",
          );
        }
        return { stdout: '', stderr: '' };
      },
    };

    await expect(
      applyDevelopmentPacks(
        options({
          ...emptyDevelopmentPacks(),
          agenticStack: true,
        }),
        runner,
        {
          promptInstallAgenticStackPython: async () => true,
        },
      ),
    ).resolves.toEqual([
      {
        pack: 'agentic-stack',
        status: 'installed',
        message: 'Agentic Stack Python runtime fixed with Homebrew and Codex adapter installed.',
      },
    ]);
    expect(calls).toEqual([
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'agentic-stack',
        args: ['codex', '--yes'],
      },
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'brew',
        args: ['--version'],
      },
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'brew',
        args: ['install', 'python'],
      },
      {
        cwd: '/tmp/odoo_sample_module_dev',
        command: 'agentic-stack',
        args: ['codex', '--yes'],
      },
    ]);
  });
});
