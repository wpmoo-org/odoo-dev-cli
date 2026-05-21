import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runDoctor: vi.fn(async () => 'doctor report'),
  runDailyAction: vi.fn(async () => undefined),
  safeResetEnvironment: vi.fn(async () => undefined),
  renderSafeResetPreview: vi.fn(() => 'safe reset preview'),
  scaffold: vi.fn(async () => ({
    plannedFiles: ['planned/file-a.txt'],
    plannedCommands: ['npm run example'],
  })),
  renderHelp: vi.fn(() => 'mock help output'),
  renderVersion: vi.fn(() => '@wpmoo/toolkit 0.0.0-test'),
  renderBanner: vi.fn(() => 'mock banner'),
  installPromptCancelKeyTracker: vi.fn(),
  isUpdateCheckSkipped: vi.fn(() => false),
}));

vi.mock('../src/prompts/index.js', () => {
  const confirm = vi.fn(async () => false);
  const intro = vi.fn();
  const isPromptCancel = vi.fn(() => false);
  const note = vi.fn();
  const outro = vi.fn();
  const promptSeparator = vi.fn((label: string) => ({ type: 'separator', separator: label }));
  const select = vi.fn();
  const text = vi.fn();
  return {
    confirm,
    confirmPrompt: confirm,
    intro,
    introPrompt: intro,
    isCancel: isPromptCancel,
    isPromptCancel,
    note,
    notePrompt: note,
    outro,
    outroPrompt: outro,
    promptSeparator,
    select,
    selectPrompt: select,
    text,
    textPrompt: text,
  };
});

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
    renderSafeResetPreview: mocks.renderSafeResetPreview,
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

  it('normalizes CLI error messages before printing from the entrypoint', async () => {
    const { formatCliErrorMessage } = await loadCli();

    expect(formatCliErrorMessage(new Error('  Something failed.  '))).toBe('Something failed.');
    expect(formatCliErrorMessage('')).toBe('Unknown WPMoo Toolkit error');
  });

  it('prints version for --version', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['--version'], '/tmp/example');

    expect(logSpy).toHaveBeenCalledWith('@wpmoo/toolkit 0.0.0-test');
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

  it('runs doctor with --fix in the provided cwd', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.runDoctor.mockResolvedValueOnce('doctor fixed report');
    const { runCli } = await loadCli();

    await runCli(['doctor', '--fix'], '/tmp/example');

    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(logSpy).toHaveBeenCalledWith('doctor fixed report');
    expect(mocks.runDoctor).toHaveBeenCalledWith('/tmp/example', { fix: true });
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

  it('runs reset dry-run and prints a deterministic preview', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { runCli } = await loadCli();

    await runCli(['reset', '--target', '/tmp/example', '--stage=false', '--dry-run'], '/tmp/ignored-cwd');

    expect(logSpy).toHaveBeenCalledWith('mock banner');
    expect(logSpy).toHaveBeenCalledWith('safe reset preview');
    expect(mocks.renderSafeResetPreview).toHaveBeenCalledWith('/tmp/example', false);
    expect(mocks.safeResetEnvironment).not.toHaveBeenCalled();
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
