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
  moduleQuality: {
    totalModules: 0,
    installableModules: 0,
    nonInstallableModules: 0,
    modulesWithMenuActions: 0,
    modulesMissingMenuActions: 0,
    addons: [],
    issues: [],
  },
  composeFiles: ['compose.yaml', 'compose/dev.yaml'],
  composeErrors: [],
  missingCoreFiles: [],
};

describe('service runtime status', () => {
  it('renders runtime status lines for the cockpit banner', () => {
    expect(renderServiceRuntimeStatusLine({ kind: 'running' })).toBe('Status: ● Services running');
    expect(renderServiceRuntimeStatusLine({ kind: 'services-running' })).toBe('Status: ● Services running');
    expect(renderServiceRuntimeStatusLine({ kind: 'db-ready' })).toBe('Status: ● DB ready');
    expect(renderServiceRuntimeStatusLine({ kind: 'odoo-not-ready' })).toBe('Status: ● Odoo not ready');
    expect(renderServiceRuntimeStatusLine({ kind: 'fully-ready' })).toBe('Status: ● Fully ready');
    expect(renderServiceRuntimeStatusLine({ kind: 'stopped' })).toBe('Status: ● Services stopped');
    expect(renderServiceRuntimeStatusLine({ kind: 'docker-not-running' })).toBe('Status: ● Docker not running');
  });

  it('reports fully-ready when docker and compose services are healthy', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    const runner: ServiceRuntimeRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '24.0.0\n' })
      .mockResolvedValueOnce({ stdout: 'db\nodoo\n' })
      .mockResolvedValueOnce({ stdout: '' });

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'fully-ready',
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
    expect(runner).toHaveBeenNthCalledWith(
      3,
      'docker',
      [
        'compose',
        '-f',
        'compose.yaml',
        '-f',
        'compose/dev.yaml',
        'exec',
        '-T',
        'db',
        'pg_isready',
        '-U',
        'odoo',
        '-d',
        'postgres',
      ],
      { cwd: '/tmp/environment' },
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8069',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    global.fetch = originalFetch;
  });

  it('reports Odoo not ready when DB is ready but HTTP check fails', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    const runner: ServiceRuntimeRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '24.0.0\n' })
      .mockResolvedValueOnce({ stdout: 'db\nodoo\n' })
      .mockResolvedValueOnce({ stdout: '' });

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'odoo-not-ready',
    });
    global.fetch = originalFetch;
  });

  it('reports DB ready when Odoo HTTP check is not available after DB ready', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => {
      throw new Error('connection failed');
    }) as unknown as typeof fetch;
    const runner: ServiceRuntimeRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '24.0.0\n' })
      .mockResolvedValueOnce({ stdout: 'db\n' })
      .mockResolvedValueOnce({ stdout: '' });

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'db-ready',
    });
    global.fetch = originalFetch;
  });

  it('reports services running when Docker services are up but DB is not ready', async () => {
    const runner: ServiceRuntimeRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '24.0.0\n' })
      .mockResolvedValueOnce({ stdout: 'db\nodoo\n' })
      .mockRejectedValueOnce(new Error('DB probe failed'));

    await expect(getServiceRuntimeStatus('/tmp/environment', environmentStatus, runner)).resolves.toEqual({
      kind: 'services-running',
    });
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
