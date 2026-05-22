import { describe, expect, it, vi } from 'vitest';

import { cockpitCommands, searchCockpitCommands } from '../src/cockpit/command-registry.js';
import { selectCockpitCommandFromPalette, type CockpitSearchPrompt } from '../src/cockpit/command-palette.js';

describe('cockpit command palette search', () => {
  it('keeps top-level command descriptions compact', () => {
    for (const command of cockpitCommands) {
      expect(command.description.length).toBeLessThanOrEqual(48);
    }
  });

  it('ranks exact /test slash alias match first', () => {
    expect(searchCockpitCommands('/test')[0]?.id).toBe('test');
  });

  it('ranks slash term matches for key flows first', () => {
    expect(searchCockpitCommands('/module')[0]?.id).toBe('list-modules');
    expect(searchCockpitCommands('/modules')[0]?.id).toBe('list-modules');
    expect(searchCockpitCommands('/install-module')[0]?.id).toBe('install');
    expect(searchCockpitCommands('/rm-module')[0]?.id).toBe('remove-module');
    expect(searchCockpitCommands('/tests')[0]?.id).toBe('test');
    expect(searchCockpitCommands('/db')[0]?.id).toBe('psql');
    expect(searchCockpitCommands('/test')[0]?.id).toBe('test');
    expect(searchCockpitCommands('/snapshot')[0]?.id).toBe('snapshot');
    expect(searchCockpitCommands('/safe')[0]?.id).toBe('safe-reset');
  });

  it('ranks exact test id match first', () => {
    expect(searchCockpitCommands('test')[0]?.id).toBe('test');
  });

  it('matches partial terms against command metadata', () => {
    expect(searchCockpitCommands('log').map((command) => command.id)).toContain('logs');
  });

  it('matches category terms against command metadata', () => {
    expect(searchCockpitCommands('database').map((command) => command.id)).toEqual(
      expect.arrayContaining(['psql', 'snapshot', 'resetdb']),
    );
  });

  it('returns no commands for unknown terms', () => {
    expect(searchCockpitCommands('not-a-real-command')).toEqual([]);
  });

  it('returns curated defaults for an empty term', () => {
    expect(searchCockpitCommands('').map((command) => command.id)).toEqual(
      expect.arrayContaining(['start', 'logs', 'test', 'status', 'doctor', 'exit']),
    );
  });
});

describe('selectCockpitCommandFromPalette', () => {
  it('calls the injected search prompt with a source that returns matches and resolves the selected command', async () => {
    const selected = cockpitCommands.find((command) => command.id === 'logs');
    expect(selected).toBeDefined();

    const prompt: CockpitSearchPrompt = vi.fn(async (config: Parameters<CockpitSearchPrompt>[0]) => {
      const choices = await config.source('log', { signal: new AbortController().signal });
      expect(choices.map((choice) => choice.value.id)).toContain('logs');
      return selected!;
    });

    const command = await selectCockpitCommandFromPalette({ prompt });

    expect(prompt).toHaveBeenCalledOnce();
    expect(command.id).toBe('logs');
  });
});
