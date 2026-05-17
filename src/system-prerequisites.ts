import { execFile } from 'node:child_process';

export type SystemPrerequisiteTool = 'node' | 'git' | 'docker' | 'docker-compose' | 'docker-engine';
export type SystemPrerequisiteStatusValue = 'found' | 'missing' | 'not-running' | 'unsupported-version';
export type SystemPrerequisiteIssueReason = 'missing' | 'not-running' | 'unsupported-version';

export type SystemPrerequisiteCheck = {
  tool: SystemPrerequisiteTool;
  label: string;
  status: SystemPrerequisiteStatusValue;
  detail?: string;
};

export type SystemPrerequisiteIssue = {
  tool: SystemPrerequisiteTool;
  reason: SystemPrerequisiteIssueReason;
};

export type SystemPrerequisiteStatus = {
  ok: boolean;
  checks: SystemPrerequisiteCheck[];
  issues: SystemPrerequisiteIssue[];
};

export type SystemCommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

type GetStatusOptions = {
  runner?: SystemCommandRunner;
  env?: Record<string, string | undefined>;
  nodeVersion?: string;
};

const minimumNodeVersion = '20.17.0';
const ANSI_RESET = '\u001B[0m';
const ANSI_DEFAULT_FOREGROUND = '\u001B[39m';
const ANSI_DIM_YELLOW = '\u001B[2m\u001B[38;2;226;184;96m';
const ANSI_STRONG_YELLOW = '\u001B[38;2;226;184;96m';
const ANSI_CYAN = '\u001B[36m';
const ANSI_GREEN = '\u001B[32m';
const ANSI_LIGHT_GREEN = '\u001B[38;2;125;231;152m';
const ANSI_RED = '\u001B[38;2;224;92;120m';
const ANSI_DIM = '\u001B[2m';

export const realSystemCommandRunner: SystemCommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });

function parseVersionParts(value: string): [number, number, number] {
  const [major = '0', minor = '0', patch = '0'] = value.replace(/^v/u, '').split('.');
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
}

function isNodeVersionSupported(version: string): boolean {
  const current = parseVersionParts(version);
  const minimum = parseVersionParts(minimumNodeVersion);

  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }

  return true;
}

function forcedMissingTools(env: Record<string, string | undefined>): Set<string> {
  return new Set(
    (env.WPMOO_TEST_MISSING_TOOLS ?? '')
      .split(/[,\s]+/u)
      .map((tool) => tool.trim().toLowerCase())
      .filter(Boolean),
  );
}

function issueForCheck(check: SystemPrerequisiteCheck): SystemPrerequisiteIssue | undefined {
  if (check.status === 'found') return undefined;
  return { tool: check.tool, reason: check.status };
}

async function checkCommand(
  runner: SystemCommandRunner,
  tool: SystemPrerequisiteTool,
  label: string,
  command: string,
  args: string[],
  forcedMissing: Set<string>,
  missingAlias: string = tool,
): Promise<SystemPrerequisiteCheck> {
  if (forcedMissing.has(tool) || forcedMissing.has(missingAlias)) {
    return { tool, label, status: 'missing' };
  }

  try {
    const result = await runner(command, args);
    return {
      tool,
      label,
      status: 'found',
      detail: result.stdout.trim() || undefined,
    };
  } catch {
    return { tool, label, status: 'missing' };
  }
}

async function checkDockerEngine(
  runner: SystemCommandRunner,
  forcedMissing: Set<string>,
): Promise<SystemPrerequisiteCheck> {
  if (forcedMissing.has('docker-engine')) {
    return { tool: 'docker-engine', label: 'Docker Engine', status: 'not-running' };
  }

  try {
    const result = await runner('docker', ['info', '--format', '{{.ServerVersion}}']);
    return {
      tool: 'docker-engine',
      label: 'Docker Engine',
      status: 'found',
      detail: result.stdout.trim() || undefined,
    };
  } catch {
    return { tool: 'docker-engine', label: 'Docker Engine', status: 'not-running' };
  }
}

export async function getSystemPrerequisiteStatus(
  options: GetStatusOptions = {},
): Promise<SystemPrerequisiteStatus> {
  const runner = options.runner ?? realSystemCommandRunner;
  const env = options.env ?? process.env;
  const forcedMissing = forcedMissingTools(env);
  const checks: SystemPrerequisiteCheck[] = [];

  const nodeVersion = options.nodeVersion ?? process.versions.node;
  checks.push({
    tool: 'node',
    label: 'Node.js 20+',
    status: isNodeVersionSupported(nodeVersion) ? 'found' : 'unsupported-version',
    detail: `v${nodeVersion}`,
  });

  checks.push(await checkCommand(runner, 'git', 'Git', 'git', ['--version'], forcedMissing));

  const dockerCheck = await checkCommand(
    runner,
    'docker',
    'Docker Desktop',
    'docker',
    ['--version'],
    forcedMissing,
    'docker-desktop',
  );
  checks.push(dockerCheck);

  if (dockerCheck.status === 'found') {
    checks.push(
      await checkCommand(
        runner,
        'docker-compose',
        'Docker Compose',
        'docker',
        ['compose', 'version'],
        forcedMissing,
        'compose',
      ),
    );
    checks.push(await checkDockerEngine(runner, forcedMissing));
  }

  const issues = checks.map(issueForCheck).filter((issue): issue is SystemPrerequisiteIssue => Boolean(issue));
  return {
    ok: issues.length === 0,
    checks,
    issues,
  };
}

function statusLabel(check: SystemPrerequisiteCheck): string {
  if (check.status === 'found') return 'ok';
  if (check.status === 'not-running') return 'Not running';
  if (check.status === 'unsupported-version') return 'Unsupported version';
  return 'Missing';
}

function hasIssue(status: SystemPrerequisiteStatus, tool: SystemPrerequisiteTool): boolean {
  return status.issues.some((issue) => issue.tool === tool);
}

function supportsAnsi(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
}

function ansi(value: string, open: string, close = ANSI_DEFAULT_FOREGROUND): string {
  if (!supportsAnsi()) return value;
  return `${open}${value}${close}`;
}

function dim(value: string): string {
  return ansi(value, ANSI_DIM, ANSI_RESET);
}

function cyan(value: string): string {
  return ansi(value, ANSI_CYAN);
}

function green(value: string): string {
  return ansi(value, ANSI_GREEN);
}

function red(value: string): string {
  return ansi(value, ANSI_RED);
}

function mutedWarning(value: string): string {
  return ansi(value, ANSI_DIM_YELLOW, ANSI_RESET);
}

function yellow(value: string): string {
  return ansi(value, ANSI_STRONG_YELLOW);
}

function okText(): string {
  return ansi('ok', ANSI_LIGHT_GREEN);
}

function downloadUrlForCheck(check: SystemPrerequisiteCheck): string | undefined {
  if (check.status === 'found') {
    return undefined;
  }
  if (check.tool === 'node') {
    return 'https://nodejs.org/en/download';
  }
  if (check.tool === 'git') {
    return 'https://git-scm.com/downloads';
  }
  if (check.tool === 'docker' || check.tool === 'docker-compose') {
    return 'https://www.docker.com/products/docker-desktop/';
  }
  return undefined;
}

function renderStatusLine(check: SystemPrerequisiteCheck): string {
  const symbol = check.status === 'found' ? green('✓') : red('✕');
  const url = downloadUrlForCheck(check);
  const status = check.status === 'found' ? okText() : url ? `${yellow('↗')} ${cyan(url)}` : dim(statusLabel(check));
  return `${symbol} ${cyan(check.label.padEnd(18))} ${status}`;
}

export function renderSystemPrerequisiteGuidance(status: SystemPrerequisiteStatus): string {
  if (status.ok) {
    return 'All required system prerequisites are available.';
  }

  const lines = [
    'Required tools before environment setup starts',
    '',
    ...status.checks.map(renderStatusLine),
    '',
  ];

  if (hasIssue(status, 'docker-engine')) {
    lines.push(mutedWarning('Docker Desktop is installed, but Docker Engine is not running.'));
    lines.push(mutedWarning('Start Docker Desktop, then check again.'));
  } else {
    lines.push(mutedWarning('Environment setup has not started yet.'));
    lines.push(mutedWarning('Install the missing tools, restart your terminal if PATH changed,'));
    lines.push(mutedWarning('start Docker Desktop, then run WPMoo Toolkit again.'));
  }

  return lines.join('\n');
}
