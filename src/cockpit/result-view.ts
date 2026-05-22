import type { DoctorReport, DoctorSection } from '../doctor.js';
import type { EnvironmentStatus } from '../status.js';

type ResultRow = readonly [string, string];

function supportsAnsi(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
}

function green(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[32m${value}\u001B[39m`;
}

function orange(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[38;2;245;166;35m${value}\u001B[39m`;
}

function red(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[31m${value}\u001B[39m`;
}

function dim(value: string): string {
  if (!supportsAnsi()) return value;
  return `\u001B[2m${value}\u001B[22m`;
}

function detailText(value: string): string {
  return dim(value);
}

function joinList(values: readonly string[], empty = '(none)'): string {
  return values.length > 0 ? values.join(', ') : empty;
}

function plural(value: number, singular: string, pluralValue = `${singular}s`): string {
  return value === 1 ? singular : pluralValue;
}

function okToken(): string {
  return green('✓ OK');
}

function readyText(value: string): string {
  return green(`✓ ${value}`);
}

function attentionText(value: string): string {
  return orange(value);
}

function warningText(count: number, options: { compact?: boolean } = {}): string {
  const value = options.compact ? String(count) : `${count} ${plural(count, 'warning')}`;
  return count > 0 ? orange(value) : dim(value);
}

function errorText(count: number, options: { compact?: boolean } = {}): string {
  const value = options.compact ? String(count) : `${count} ${plural(count, 'error')}`;
  return count > 0 ? red(value) : dim(value);
}

function renderStatusText(value: string): string {
  if (value === 'OK') {
    return okToken();
  }

  if (value.startsWith('OK ')) {
    return `${okToken()} ${value.slice(3)}`;
  }

  return value;
}

function renderWarningText(value: string): string {
  return `${orange('WARN')} ${value}`;
}

function renderErrorText(value: string): string {
  return `${red('ERROR')} ${value}`;
}

function renderRows(rows: readonly ResultRow[], options: { alignValues?: boolean } = {}): string[] {
  if (!options.alignValues) {
    return rows.map(([label, value]) => `${label}: ${value}`);
  }

  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${label}:${' '.repeat(labelWidth - label.length + 2)}${value}`);
}

function renderDetails(
  title: string,
  values: readonly string[],
  options: { formatStatus?: boolean; severity?: 'warning' | 'error' } = {},
): string[] {
  if (values.length === 0) return [];
  const formatValue = (value: string): string => {
    if (options.formatStatus) return renderStatusText(value);
    if (options.severity === 'warning') return renderWarningText(value);
    if (options.severity === 'error') return renderErrorText(value);
    return value;
  };

  return [
    '',
    title,
    ...values.map((value) => `- ${formatValue(value)}`),
  ];
}

function renderSectionSummaries(sections: readonly DoctorSection[]): string[] {
  const titleWidth = Math.max(...sections.map((section) => section.title.length));
  return sections.map((section) => renderSectionSummary(section, titleWidth));
}

function renderSectionSummary(section: DoctorSection, titleWidth: number): string {
  const warnings = warningText(section.warnings.length);
  const errors = errorText(section.errors.length);
  return `- ${section.title}:${' '.repeat(titleWidth - section.title.length + 2)}${section.checks.length} ${okToken()}, ${warnings}, ${errors}`;
}

function issueListText(values: readonly string[], severity: 'warning' | 'error', empty = '(none)'): string {
  if (values.length === 0) return dim(empty);
  const value = values.join(', ');
  return severity === 'error' ? red(value) : orange(value);
}

function moduleQualityText(status: Extract<EnvironmentStatus, { kind: 'environment' }>): string {
  const nonInstallable = status.moduleQuality.nonInstallableModules;
  const missingMenus = status.moduleQuality.modulesMissingMenuActions;
  const installableText = detailText(`${status.moduleQuality.installableModules} installable`);
  const nonInstallableText =
    nonInstallable > 0
      ? orange(`${nonInstallable} non-installable`)
      : dim(`${nonInstallable} non-installable`);
  const missingMenusText =
    missingMenus > 0
      ? orange(`${missingMenus} ${plural(missingMenus, 'missing menu', 'missing menus')}`)
      : dim(`${missingMenus} missing menus`);

  return `${installableText}, ${nonInstallableText}, ${missingMenusText}`;
}

function moduleIssuesText(status: Extract<EnvironmentStatus, { kind: 'environment' }>): string {
  return status.moduleQuality.issues
    .map((issue) => {
      const text = `${issue.path}: ${issue.issue}`;
      return issue.severity === 'error' ? red(text) : orange(text);
    })
    .join('; ');
}

function environmentNeedsAttention(status: Extract<EnvironmentStatus, { kind: 'environment' }>): boolean {
  return (
    status.missingCoreFiles.length > 0 ||
    status.composeErrors.length > 0 ||
    status.invalidSourceRepoPaths.length > 0 ||
    status.moduleQuality.issues.length > 0
  );
}

function statusRows(status: EnvironmentStatus): ResultRow[] {
  if (status.kind === 'no_environment') {
    return [
      ['Summary', attentionText('No WPMoo environment detected.')],
      ['Metadata', attentionText(`missing ${status.metadataPath}`)],
      ['Next', detailText(status.recommendedNextAction)],
    ];
  }

  if (status.kind === 'invalid_metadata') {
    return [
      ['Summary', red('Environment metadata is invalid.')],
      ['Metadata', red(`invalid ${status.metadataPath}`)],
      ['Error', red(status.metadataError)],
      ['Next', detailText(status.recommendedNextAction)],
    ];
  }

  const needsAttention = environmentNeedsAttention(status);

  return [
    ['Summary', needsAttention ? attentionText('Environment needs attention.') : readyText('Environment ready.')],
    ['Metadata', detailText(status.metadataPath)],
    ['Odoo', detailText(status.odooVersion)],
    ['Compose', status.composeFiles.length > 0 ? detailText(joinList(status.composeFiles)) : dim('(missing)')],
    ...(status.composeErrors.length > 0
      ? ([['Compose errors', issueListText(status.composeErrors, 'error')]] satisfies ResultRow[])
      : []),
    ['Source repos', detailText(String(status.sourceRepoCount))],
    ['Source paths', detailText(joinList(status.sourceRepoPaths, '(none configured)'))],
    ['Invalid paths', issueListText(status.invalidSourceRepoPaths, 'warning')],
    ['Modules', detailText(String(status.moduleCandidateCount))],
    ['Module quality', moduleQualityText(status)],
    ...(status.moduleQuality.issues.length > 0
      ? ([['Module issues', moduleIssuesText(status)]] satisfies ResultRow[])
      : []),
    [
      'Core files',
      status.missingCoreFiles.length > 0
        ? red(`missing ${status.missingCoreFiles.join(', ')}`)
        : dim('(none missing)'),
    ],
    ['Next', detailText(status.recommendedNextAction)],
  ];
}

export function renderCockpitEnvironmentStatusResult(status: EnvironmentStatus): string {
  return renderRows(statusRows(status), { alignValues: true }).join('\n');
}

export function renderCockpitDoctorResult(report: DoctorReport): string {
  const sections = report.sections ?? [];
  return [
    ...renderRows([
      ['Result', report.ok ? okToken() : 'Needs attention'],
      ['Target', report.target],
      ['Checks', String(report.checks.length)],
      ['Warnings', warningText(report.warnings.length, { compact: true })],
      ['Errors', errorText(report.errors.length, { compact: true })],
      ['Fixes', String(report.appliedFixes.length)],
    ], { alignValues: true }),
    ...(sections.length > 0 ? ['', 'Sections', ...renderSectionSummaries(sections)] : []),
    ...renderDetails('Errors', report.errors, { severity: 'error' }),
    ...renderDetails('Warnings', report.warnings, { severity: 'warning' }),
    ...renderDetails('Applied fixes', report.appliedFixes),
    ...renderDetails('Checks', report.checks, { formatStatus: true }),
  ].join('\n');
}
