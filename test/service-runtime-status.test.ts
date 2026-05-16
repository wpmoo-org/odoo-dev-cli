import { describe, expect, it, vi } from 'vitest';

import {
  getServiceRuntimeStatus,
  renderServiceRuntimeStatusLine,
  type ServiceRuntimeRunner,
} from '../src/service-runtime-status.js';
import type { EnvironmentStatus } from '../src/status.js';

const environmentStatus: EnvironmentStatus = {
  kind: 'environment',
  target: '/tmp/environment',
  metadataPath: '.wpmoo/odoo.json',
  recommendedNextAction: 'Run ./moo.',
  odooVersion: '19.0',
  sourceRepoCount: 1,
  sourceRepoPaths: ['odoo/custom/src/private/moo_olympiad'],
  invalidSourceRepoPaths: [],
  moduleCandidateCount: 0,
  composeFiles: ['compose.yaml', 'compose/dev.yaml'],
  composeErrors: [],
  missingCoreFiles: [],
};

describe('service runtime status', () => {
  it('renders runtime status lines for the cockpit banner', () => {
    expect(renderServiceRuntimeStatusLine({ kind: 'running' })).toBe('Status: ● Services running');
    expect(renderServiceRuntimeStatusLine({ kind: 'stopped' })).toBe('Status: ● Services stopped');
    expect(renderServiceRuntimeStatusLine({ kind: 'docker-not-running' })).toBe('Status: ● Docker not running');
  });

  it('reports running services when Docker is available and compose has running services', async () => {
    const runner: ServiceRuntimeRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '24.0.0\n' })
      .mockResolvedValueOnce({ stdout: 'odoo\npostgres\n' });

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'running',
    });
    expect(runner).toHaveBeenNthCalledWith(1, 'docker', ['info', '--format', '{{.ServerVersion}}'], {
      cwd: '/tmp/environment',
    });
    expect(runner).toHaveBeenNthCalledWith(
      2,
      'docker',
      ['compose', '-f', 'compose.yaml', '-f', 'compose/dev.yaml', 'ps', '--services', '--filter', 'status=running'],
      { cwd: '/tmp/environment' },
    );
  });

  it('reports stopped services when Docker is available but compose has no running services', async () => {
    const runner: ServiceRuntimeRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '24.0.0\n' })
      .mockResolvedValueOnce({ stdout: '' });

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'stopped',
    });
  });

  it('reports stopped services when compose status cannot be read after Docker is available', async () => {
    const runner: ServiceRuntimeRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '24.0.0\n' })
      .mockRejectedValueOnce(new Error('compose file missing'));

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'stopped',
    });
  });

  it('reports Docker as not running when Docker daemon checks fail', async () => {
    const runner: ServiceRuntimeRunner = vi.fn().mockRejectedValueOnce(new Error('Cannot connect to Docker daemon'));

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'docker-not-running',
    });
  });
});
