import { describe, expect, it, vi } from 'vitest';

import type { ServiceRuntimeStatus } from '../src/service-runtime-status.js';
import { selectCockpitTopLevelMenu, type CockpitMenuSelectPrompt } from '../src/cockpit/menu.js';
import { cockpitCommands } from '../src/cockpit/command-registry.js';

type CockpitMenuChoice = {
  value?: unknown;
  disabled?: unknown;
};

type CockpitMenuConfig = {
  choices?: ReadonlyArray<CockpitMenuChoice>;
  disabledError?: unknown;
};

function menuChoiceDisabledValue(config: CockpitMenuConfig, commandId: string): string | undefined {
  const match = config.choices?.find((choice) => (choice.value as { id?: string } | undefined)?.id === commandId);
  if (typeof match?.disabled === 'string') {
    return match.disabled;
  }

  return undefined;
}

function renderDisabledError(config: CockpitMenuConfig, reason: string): unknown {
  return typeof config.disabledError === 'function'
    ? (config.disabledError as (reason: string | undefined) => string)(reason)
    : config.disabledError;
}

describe('Cockpit top-level menu disabled next-step notes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const disabledReasonCases: Array<{
    description: string;
    serviceStatus: ServiceRuntimeStatus | undefined;
    moduleCount: number | undefined;
    sourceRepoCount: number | undefined;
    commandId: string;
    expected: string;
    fallback: string;
  }> = [
    {
      description: 'already running services',
      serviceStatus: { kind: 'running' },
      moduleCount: undefined,
      sourceRepoCount: undefined,
      commandId: 'start',
      expected: 'Already running.',
      fallback: 'Next: choose "Stop services" or "Restart services".',
    },
    {
      description: 'services are stopped',
      serviceStatus: { kind: 'stopped' },
      moduleCount: undefined,
      sourceRepoCount: undefined,
      commandId: 'stop',
      expected: 'Services stopped.',
      fallback: 'Next: choose "Start services" first.',
    },
    {
      description: 'docker is not running',
      serviceStatus: { kind: 'docker-not-running' },
      moduleCount: undefined,
      sourceRepoCount: undefined,
      commandId: 'logs',
      expected: 'Docker not running.',
      fallback: 'Next: start Docker, then choose "Start services".',
    },
    {
      description: 'no modules are present',
      serviceStatus: undefined,
      moduleCount: 0,
      sourceRepoCount: 1,
      commandId: 'test',
      expected: 'No modules found.',
      fallback: 'Next: choose "Add module" first.',
    },
    {
      description: 'no source repos are present',
      serviceStatus: undefined,
      moduleCount: 1,
      sourceRepoCount: 0,
      commandId: 'add-module',
      expected: 'No source repos found.',
      fallback: 'Next: choose "Add source repo" first.',
    },
  ];

  it.each(disabledReasonCases)('annotates disabled "$description" reason with next-step guidance', async (caseConfig) => {
    const selectDefault = cockpitCommands.find((command) => command.id === 'status');
    expect(selectDefault).toBeDefined();
    const prompt: CockpitMenuSelectPrompt = vi.fn(async (config) => {
      const disabledValue = menuChoiceDisabledValue(config as CockpitMenuConfig, caseConfig.commandId);
      expect(disabledValue).toBe(caseConfig.expected);
      expect(renderDisabledError(config as CockpitMenuConfig, caseConfig.expected)).toBe(
        `This option is disabled and cannot be selected.\nReason: ${caseConfig.expected}\n${caseConfig.fallback}`,
      );
      return selectDefault;
    });

    await selectCockpitTopLevelMenu({
      select: prompt,
      serviceStatus: caseConfig.serviceStatus,
      moduleCount: caseConfig.moduleCount,
      sourceRepoCount: caseConfig.sourceRepoCount,
    });

    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
