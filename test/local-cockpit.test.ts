import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

import { runLocalCockpit } from '../src/local-cockpit.js';

function childProcess(exitCode: number | null) {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit('close', exitCode));
  return child;
}

describe('local cockpit runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the generated moo script from the environment folder', async () => {
    mocks.spawn.mockReturnValueOnce(childProcess(0));

    await runLocalCockpit('/tmp/moo_olympiad_dev');

    expect(mocks.spawn).toHaveBeenCalledWith(join('/tmp/moo_olympiad_dev', 'moo'), [], {
      cwd: '/tmp/moo_olympiad_dev',
      stdio: 'inherit',
    });
  });

  it('reports non-zero local cockpit exits', async () => {
    mocks.spawn.mockReturnValueOnce(childProcess(2));

    await expect(runLocalCockpit('/tmp/moo_olympiad_dev')).rejects.toThrow(
      /Local WPMoo cockpit exited with code 2/,
    );
  });
});
