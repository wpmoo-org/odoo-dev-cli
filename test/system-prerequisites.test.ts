import { describe, expect, it, vi } from 'vitest';

import {
  getSystemPrerequisiteStatus,
  renderSystemPrerequisiteGuidance,
  type SystemCommandRunner,
} from '../src/system-prerequisites.js';

function runnerFromResponses(responses: Record<string, { stdout?: string; error?: Error }>): SystemCommandRunner {
  return vi.fn(async (command: string, args: string[]) => {
    const key = [command, ...args].join(' ');
    const response = responses[key];
    if (!response) {
      throw new Error(`Unexpected command: ${key}`);
    }
    if (response.error) {
      throw response.error;
    }
    return { stdout: response.stdout ?? '', stderr: '' };
  });
}

describe('system prerequisites', () => {
  it('passes when Git, Docker, Compose, and Docker Engine are available', async () => {
    const runner = runnerFromResponses({
      'git --version': { stdout: 'git version 2.54.0\n' },
      'docker --version': { stdout: 'Docker version 28.5.1, build e180ab8\n' },
      'docker compose version': { stdout: 'Docker Compose version v2.40.2\n' },
      'docker info --format {{.ServerVersion}}': { stdout: '28.5.1\n' },
    });

    const status = await getSystemPrerequisiteStatus({ runner });

    expect(status.ok).toBe(true);
    expect(status.issues).toEqual([]);
    expect(status.checks.find((check) => check.tool === 'git')?.status).toBe('found');
    expect(status.checks.find((check) => check.tool === 'docker-engine')?.status).toBe('found');
  });

  it('reports Git as missing without starting setup guidance', async () => {
    const runner = runnerFromResponses({
      'git --version': { error: new Error('git not found') },
      'docker --version': { stdout: 'Docker version 28.5.1, build e180ab8\n' },
      'docker compose version': { stdout: 'Docker Compose version v2.40.2\n' },
      'docker info --format {{.ServerVersion}}': { stdout: '28.5.1\n' },
    });

    const status = await getSystemPrerequisiteStatus({ runner });

    expect(status.ok).toBe(false);
    expect(status.issues).toContainEqual({ tool: 'git', reason: 'missing' });
    const guidance = renderSystemPrerequisiteGuidance(status);
    expect(guidance).toContain('Environment setup has not started yet.');
    expect(guidance).toContain('✓ Node.js 20+        ok');
    expect(guidance).not.toContain('Node.js 20+        Found');
    expect(guidance).toContain('✕ Git                ↗ https://git-scm.com/downloads');
  });

  it('reports Docker CLI as missing and skips Compose and Engine checks', async () => {
    const runner = runnerFromResponses({
      'git --version': { stdout: 'git version 2.54.0\n' },
      'docker --version': { error: new Error('docker not found') },
    });

    const status = await getSystemPrerequisiteStatus({ runner });

    expect(status.ok).toBe(false);
    expect(status.issues).toContainEqual({ tool: 'docker', reason: 'missing' });
    expect(runner).not.toHaveBeenCalledWith('docker', ['compose', 'version']);
    const guidance = renderSystemPrerequisiteGuidance(status);
    expect(guidance).toContain('start Docker Desktop, then run WPMoo Toolkit again.');
    expect(guidance).toContain('✕ Docker Desktop     ↗ https://www.docker.com/products/docker-desktop/');
  });

  it('reports Docker Engine as not running when Docker CLI exists but docker info fails', async () => {
    const runner = runnerFromResponses({
      'git --version': { stdout: 'git version 2.54.0\n' },
      'docker --version': { stdout: 'Docker version 28.5.1, build e180ab8\n' },
      'docker compose version': { stdout: 'Docker Compose version v2.40.2\n' },
      'docker info --format {{.ServerVersion}}': { error: new Error('Cannot connect to Docker daemon') },
    });

    const status = await getSystemPrerequisiteStatus({ runner });

    expect(status.ok).toBe(false);
    expect(status.issues).toContainEqual({ tool: 'docker-engine', reason: 'not-running' });
    expect(renderSystemPrerequisiteGuidance(status)).toContain('Docker Desktop is installed, but Docker Engine is not running');
  });

  it('supports local QA overrides without uninstalling tools', async () => {
    const runner = runnerFromResponses({
      'docker compose version': { stdout: 'Docker Compose version v2.40.2\n' },
      'docker info --format {{.ServerVersion}}': { stdout: '28.5.1\n' },
    });

    const status = await getSystemPrerequisiteStatus({
      runner,
      env: { WPMOO_TEST_MISSING_TOOLS: 'git,docker' },
    });

    expect(status.ok).toBe(false);
    expect(status.issues).toContainEqual({ tool: 'git', reason: 'missing' });
    expect(status.issues).toContainEqual({ tool: 'docker', reason: 'missing' });
  });

  it('does not include package-manager install commands in user guidance', async () => {
    const runner = runnerFromResponses({
      'git --version': { error: new Error('git not found') },
      'docker --version': { error: new Error('docker not found') },
    });

    const guidance = renderSystemPrerequisiteGuidance(await getSystemPrerequisiteStatus({ runner }));

    expect(guidance).not.toContain('winget install');
    expect(guidance).not.toContain('brew install');
    expect(guidance).not.toContain('Download Links');
  });

  it('renders download links next to missing tool status rows', async () => {
    const runner = runnerFromResponses({
      'git --version': { error: new Error('git not found') },
      'docker --version': { error: new Error('docker not found') },
    });

    const guidance = renderSystemPrerequisiteGuidance(await getSystemPrerequisiteStatus({ runner }));

    expect(guidance).toContain('Required tools before environment setup starts');
    expect(guidance).toContain('✕ Git                ↗ https://git-scm.com/downloads');
    expect(guidance).toContain('✕ Docker Desktop     ↗ https://www.docker.com/products/docker-desktop/');
    expect(guidance).not.toContain('Git                Missing');
    expect(guidance).not.toContain('Docker Desktop     Missing');
  });

  it('renders found tools with a small light-green ok status in TTYs', async () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.NO_COLOR;

    const runner = runnerFromResponses({
      'git --version': { error: new Error('git not found') },
      'docker --version': { error: new Error('docker not found') },
    });

    try {
      const guidance = renderSystemPrerequisiteGuidance(await getSystemPrerequisiteStatus({ runner }));

      expect(guidance).toContain('\u001B[38;2;125;231;152mok\u001B[39m');
      expect(guidance).not.toContain('\u001B[42m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalIsTTY });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    }
  });
});
