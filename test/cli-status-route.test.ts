import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEnvironmentStatus: vi.fn(async () => ({ kind: 'environment', target: '/tmp/example-environment' })),
  environmentStatusJson: vi.fn((status: unknown) => ({
    schemaVersion: 1,
    command: 'status',
    ok: true,
    status,
  })),
  renderBanner: vi.fn(() => 'mock banner'),
  renderEnvironmentStatusForTarget: vi.fn(async () => 'full status report'),
  getDoctorReport: vi.fn(async () => ({
    schemaVersion: 1,
    command: 'doctor',
    ok: true,
    target: '/tmp/example-environment',
    checks: ['OK metadata .wpmoo/odoo.json'],
    warnings: [],
    errors: [],
    appliedFixes: [],
  })),
  runDoctor: vi.fn(async () => 'doctor report'),
  getGitHubAccounts: vi.fn(async () => [{ login: 'example-org', type: 'organization' }]),
  installPromptCancelKeyTracker: vi.fn(),
  isUpdateCheckSkipped: vi.fn(() => true),
}));

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => false),
  intro: vi.fn(),
  isCancel: vi.fn(() => false),
  note: vi.fn(),
  outro: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
}));

vi.mock('../src/templates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/templates.js')>();
  return {
    ...actual,
    renderBanner: mocks.renderBanner,
  };
});

vi.mock('../src/status.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/status.js')>();
  return {
    ...actual,
    getEnvironmentStatus: mocks.getEnvironmentStatus,
    environmentStatusJson: mocks.environmentStatusJson,
    renderEnvironmentStatusForTarget: mocks.renderEnvironmentStatusForTarget,
  };
});

vi.mock('../src/doctor.js', () => ({
  getDoctorReport: mocks.getDoctorReport,
  runDoctor: mocks.runDoctor,
}));

vi.mock('../src/github.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/github.js')>();
  return {
    ...actual,
    getGitHubAccounts: mocks.getGitHubAccounts,
  };
});

vi.mock('../src/menu-navigation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/menu-navigation.js')>();
  return {
    ...actual,
    installPromptCancelKeyTracker: mocks.installPromptCancelKeyTracker,
  };
});

vi.mock('../src/update-check.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/update-check.js')>();
  return {
    ...actual,
    isUpdateCheckSkipped: mocks.isUpdateCheckSkipped,
  };
});

async function loadCli() {
  vi.resetModules();
  return import('../src/cli.js');
}

describe('cli status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints banner and full status report for cwd', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['status'], '/tmp/example-environment');

    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(logSpy).toHaveBeenCalledWith('full status report');
    expect(mocks.renderEnvironmentStatusForTarget).toHaveBeenCalledWith('/tmp/example-environment');
    expect(mocks.runDoctor).not.toHaveBeenCalled();
    expect(mocks.getGitHubAccounts).not.toHaveBeenCalled();
  });

  it('prints machine-readable status JSON without banner', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();
    const status = { kind: 'environment', target: '/tmp/example-environment' };
    mocks.getEnvironmentStatus.mockResolvedValueOnce(status);

    await runCli(['status', '--json'], '/tmp/example-environment');

    expect(mocks.getEnvironmentStatus).toHaveBeenCalledWith('/tmp/example-environment');
    expect(mocks.environmentStatusJson).toHaveBeenCalledWith(status);
    expect(mocks.renderEnvironmentStatusForTarget).not.toHaveBeenCalled();
    expect(mocks.renderBanner).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        schemaVersion: 1,
        command: 'status',
        ok: true,
        status,
      }),
    );
  });

  it('rejects unexpected status args with usage message', async () => {
    const { runCli } = await loadCli();

    await expect(runCli(['status', '--unexpected'], '/tmp/example')).rejects.toThrow('Usage: wpmoo status');
    expect(mocks.renderEnvironmentStatusForTarget).not.toHaveBeenCalled();
    expect(mocks.runDoctor).not.toHaveBeenCalled();
    expect(mocks.getGitHubAccounts).not.toHaveBeenCalled();
  });

  it('prints machine-readable doctor JSON without banner', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['doctor', '--json'], '/tmp/example-environment');

    expect(mocks.getDoctorReport).toHaveBeenCalledWith('/tmp/example-environment', {});
    expect(mocks.runDoctor).not.toHaveBeenCalled();
    expect(mocks.renderBanner).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        schemaVersion: 1,
        command: 'doctor',
        ok: true,
        target: '/tmp/example-environment',
        checks: ['OK metadata .wpmoo/odoo.json'],
        warnings: [],
        errors: [],
        appliedFixes: [],
      }),
    );
  });
});
