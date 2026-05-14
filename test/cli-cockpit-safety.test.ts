import { describe, expect, it, vi } from 'vitest';

import { cockpitCommands } from '../src/cockpit/command-registry.js';
import { confirmCockpitCommandRisk, type CockpitRiskConfirmPrompt } from '../src/cockpit/safety.js';

function command(id: string) {
  const found = cockpitCommands.find((entry) => entry.id === id);
  expect(found).toBeDefined();
  return found!;
}

describe('cockpit command safety', () => {
  it('does not approve a risky command when confirmation is declined', async () => {
    const prompt: CockpitRiskConfirmPrompt = vi.fn(async () => false);

    await expect(confirmCockpitCommandRisk(command('resetdb'), { confirm: prompt })).resolves.toBe(false);

    expect(prompt).toHaveBeenCalledOnce();
    expect(vi.mocked(prompt).mock.calls[0]?.[0].message).toContain('/resetdb');
  });

  it('approves a risky command when confirmation is accepted', async () => {
    const prompt: CockpitRiskConfirmPrompt = vi.fn(async () => true);

    await expect(confirmCockpitCommandRisk(command('stop'), { confirm: prompt })).resolves.toBe(true);

    expect(prompt).toHaveBeenCalledOnce();
  });

  it('bypasses confirmation for non-risky commands', async () => {
    const prompt: CockpitRiskConfirmPrompt = vi.fn(async () => {
      throw new Error('confirm should not be called');
    });

    await expect(confirmCockpitCommandRisk(command('logs'), { confirm: prompt })).resolves.toBe(true);

    expect(prompt).not.toHaveBeenCalled();
  });
});
