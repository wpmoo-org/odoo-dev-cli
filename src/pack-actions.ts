import { execa } from 'execa';

import type { ScaffoldOptions } from './types.js';

export type PackActionStatus = 'installed' | 'skipped' | 'failed';

export type PackActionResult = {
  pack: 'agentic-stack';
  status: PackActionStatus;
  message: string;
};

export type PackCommandRunner = {
  run(cwd: string, command: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
};

export type PackApplyOptions = {
  platform?: NodeJS.Platform;
  promptInstallAgenticStack?: () => Promise<boolean>;
};

export const realPackRunner: PackCommandRunner = {
  async run(cwd, command, args) {
    const result = await execa(command, args, { cwd, stdio: 'pipe' });
    return { stdout: result.stdout, stderr: result.stderr };
  },
};

function isCommandMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function installAgenticStackWithHomebrew(target: string, runner: PackCommandRunner): Promise<void> {
  await runner.run(target, 'brew', ['tap', 'codejunkie99/agentic-stack', 'https://github.com/codejunkie99/agentic-stack']);
  await runner.run(target, 'brew', ['install', 'agentic-stack']);
}

async function hasHomebrew(target: string, runner: PackCommandRunner): Promise<boolean> {
  try {
    await runner.run(target, 'brew', ['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function applyDevelopmentPacks(
  options: ScaffoldOptions,
  runner: PackCommandRunner = realPackRunner,
  applyOptions: PackApplyOptions = {},
): Promise<PackActionResult[]> {
  if (!options.packs?.agenticStack) {
    return [];
  }

  try {
    await runner.run(options.target, 'agentic-stack', ['codex', '--yes']);
    return [
      {
        pack: 'agentic-stack',
        status: 'installed',
        message: 'Agentic Stack Codex adapter installed.',
      },
    ];
  } catch (error) {
    if (isCommandMissing(error)) {
      const platform = applyOptions.platform ?? process.platform;
      if (platform === 'win32') {
        return [
          {
            pack: 'agentic-stack',
            status: 'skipped',
            message:
              'Agentic Stack is not installed. On Windows, install it with the PowerShell installer from https://github.com/codejunkie99/agentic-stack, then rerun this command.',
          },
        ];
      }

      if (!(await hasHomebrew(options.target, runner))) {
        return [
          {
            pack: 'agentic-stack',
            status: 'skipped',
            message:
              'Agentic Stack is not installed and Homebrew is not available. Install Agentic Stack first: https://github.com/codejunkie99/agentic-stack',
          },
        ];
      }

      const shouldInstall = applyOptions.promptInstallAgenticStack
        ? await applyOptions.promptInstallAgenticStack()
        : false;
      if (shouldInstall) {
        try {
          await installAgenticStackWithHomebrew(options.target, runner);
          await runner.run(options.target, 'agentic-stack', ['codex', '--yes']);
          return [
            {
              pack: 'agentic-stack',
              status: 'installed',
              message: 'Agentic Stack installed with Homebrew and Codex adapter installed.',
            },
          ];
        } catch (installError) {
          return [
            {
              pack: 'agentic-stack',
              status: 'failed',
              message: `Agentic Stack Homebrew installation failed: ${errorMessage(installError)}`,
            },
          ];
        }
      }

      return [
        {
          pack: 'agentic-stack',
          status: 'skipped',
          message:
            'Agentic Stack is not installed. Install it with: brew tap codejunkie99/agentic-stack https://github.com/codejunkie99/agentic-stack && brew install agentic-stack',
        },
      ];
    }

    return [
      {
        pack: 'agentic-stack',
        status: 'failed',
        message: `Agentic Stack Codex adapter failed: ${errorMessage(error)}`,
      },
    ];
  }
}
