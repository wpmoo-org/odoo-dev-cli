import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runDoctor: vi.fn(async () => 'doctor report'),
  runDailyAction: vi.fn(async () => undefined),
  safeResetEnvironment: vi.fn(async () => undefined),
  scaffold: vi.fn(async () => ({
    plannedFiles: ['planned/file-a.txt'],
    plannedCommands: ['npm run example'],
  })),
  renderHelp: vi.fn(() => 'mock help output'),
  renderVersion: vi.fn(() => '@wpmoo/odoo 0.0.0-test'),
  renderBanner: vi.fn(() => 'mock banner'),
  installPromptCancelKeyTracker: vi.fn(),
  isUpdateCheckSkipped: vi.fn(() => false),
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

vi.mock('../src/doctor.js', () => ({
  runDoctor: mocks.runDoctor,
}));

vi.mock('../src/daily-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/daily-actions.js')>();
  return {
    ...actual,
    runDailyAction: mocks.runDailyAction,
  };
});

vi.mock('../src/safe-reset.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/safe-reset.js')>();
  return {
    ...actual,
    safeResetEnvironment: mocks.safeResetEnvironment,
  };
});

vi.mock('../src/scaffold.js', () => ({
  scaffold: mocks.scaffold,
}));

vi.mock('../src/help.js', () => ({
  renderHelp: mocks.renderHelp,
}));

vi.mock('../src/templates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/templates.js')>();
  return {
    ...actual,
    renderBanner: mocks.renderBanner,
  };
});

vi.mock('../src/version.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/version.js')>();
  return {
    ...actual,
    renderVersion: mocks.renderVersion,
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

describe('cli runCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints help for --help', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['--help'], '/tmp/example');

    expect(logSpy).toHaveBeenCalledWith('mock help output');
    expect(mocks.renderHelp).toHaveBeenCalledTimes(1);
    expect(mocks.installPromptCancelKeyTracker).toHaveBeenCalledTimes(1);
  });

  it('prints version for --version', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['--version'], '/tmp/example');

    expect(logSpy).toHaveBeenCalledWith('@wpmoo/odoo 0.0.0-test');
    expect(mocks.renderVersion).toHaveBeenCalledTimes(1);
  });

  it('runs doctor in the provided cwd', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['doctor'], '/tmp/example');

    expect(mocks.runDoctor).toHaveBeenCalledWith('/tmp/example');
    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(logSpy).toHaveBeenCalledWith('doctor report');
  });

  it('runs daily actions with argv and cwd', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['start'], '/tmp/example');

    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(mocks.runDailyAction).toHaveBeenCalledWith('start', [], '/tmp/example');
  });

  it('runs reset with parsed args', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['reset', '--target', '/tmp/example', '--stage=false'], '/tmp/ignored-cwd');

    expect(mocks.safeResetEnvironment).toHaveBeenCalledWith({
      target: '/tmp/example',
      stage: false,
    });
  });

  it('prints dry-run scaffold plan for create --dry-run', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.scaffold.mockResolvedValueOnce({
      plannedFiles: ['foo.txt', 'bar.txt'],
      plannedCommands: ['git add .', 'git status'],
    });
    const { runCli } = await loadCli();

    await runCli(
      [
        'create',
        '--product',
        'odoo_sample_module',
        '--dev-repo-url',
        'https://github.com/example-org/odoo_sample_module_dev.git',
        '--source-repo-url',
        'https://github.com/example-org/odoo_sample_module.git',
        '--dry-run',
      ],
      '/tmp/example',
    );

    expect(mocks.scaffold).toHaveBeenCalledTimes(1);

    const lines = logSpy.mock.calls.flatMap((args) => args.map(String));
    expect(lines).toContain('mock banner');
    expect(lines).toContain('Dry run: planned files');
    expect(lines).toContain('- foo.txt');
    expect(lines).toContain('- bar.txt');
    expect(lines).toContain('Dry run: planned commands');
    expect(lines).toContain('- git add .');
    expect(lines).toContain('- git status');
  });
});
