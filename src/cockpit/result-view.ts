import type { DoctorReport, DoctorSection } from '../doctor.js';
import type { EnvironmentStatus } from '../status.js';

type KeyValueRow = readonly [string, string];
type CountRow = readonly [string, number, number, number];

const keyWidth = 18;
const valueWidth = 50;
const sectionWidth = 24;
const countWidth = 5;

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function pad(value: string, width: number): string {
  return truncate(value, width).padEnd(width, ' ');
}

function horizontal(widths: readonly number[]): string {
  return `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
}

function renderRow(values: readonly string[], widths: readonly number[]): string {
  return `| ${values.map((value, index) => pad(value, widths[index] ?? value.length)).join(' | ')} |`;
}

function renderKeyValueTable(title: string, rows: readonly KeyValueRow[]): string {
  const widths = [keyWidth, valueWidth] as const;
  return [
    title,
    horizontal(widths),
    renderRow(['Field', 'Value'], widths),
    horizontal(widths),
    ...rows.map(([key, value]) => renderRow([key, value], widths)),
    horizontal(widths),
  ].join('\n');
}

function renderSectionCountTable(sections: readonly DoctorSection[]): string {
  const widths = [sectionWidth, countWidth, countWidth, countWidth] as const;
  const rows: CountRow[] = sections.map((section) => [
    section.title,
    section.checks.length,
    section.warnings.length,
    section.errors.length,
  ]);

  return [
    'Doctor sections',
    horizontal(widths),
    renderRow(['Section', 'OK', 'Warn', 'Error'], widths),
    horizontal(widths),
    ...rows.map(([section, checks, warnings, errors]) =>
      renderRow([section, String(checks), String(warnings), String(errors)], widths),
    ),
    horizontal(widths),
  ].join('\n');
}

function joinList(values: readonly string[], empty = '(none)'): string {
  return values.length > 0 ? values.join(', ') : empty;
}

function statusRows(status: EnvironmentStatus): KeyValueRow[] {
  if (status.kind === 'no_environment') {
    return [
      ['Summary', 'No WPMoo environment detected.'],
      ['Metadata', `missing ${status.metadataPath}`],
      ['Next', status.recommendedNextAction],
    ];
  }

  if (status.kind === 'invalid_metadata') {
    return [
      ['Summary', 'Environment needs attention.'],
      ['Metadata', `invalid ${status.metadataPath}`],
      ['Error', status.metadataError],
      ['Next', status.recommendedNextAction],
    ];
  }

  const needsAttention =
    status.missingCoreFiles.length > 0 ||
    status.composeErrors.length > 0 ||
    status.invalidSourceRepoPaths.length > 0 ||
    status.moduleQuality.issues.length > 0;

  return [
    ['Summary', needsAttention ? 'Environment needs attention.' : 'Environment ready.'],
    ['Metadata', status.metadataPath],
    ['Odoo', status.odooVersion],
    ['Compose', joinList(status.composeFiles, '(missing)')],
    ['Source repos', String(status.sourceRepoCount)],
    ['Source paths', joinList(status.sourceRepoPaths, '(none configured)')],
    ['Invalid paths', joinList(status.invalidSourceRepoPaths)],
    ['Modules', String(status.moduleCandidateCount)],
    [
      'Module quality',
      `${status.moduleQuality.installableModules} installable, ${status.moduleQuality.nonInstallableModules} non-installable, ${status.moduleQuality.modulesMissingMenuActions} missing menus`,
    ],
    ['Core files', status.missingCoreFiles.length > 0 ? `missing ${status.missingCoreFiles.join(', ')}` : '(none missing)'],
    ['Next', status.recommendedNextAction],
  ];
}

function renderDetails(title: string, values: readonly string[]): string[] {
  if (values.length === 0) return [];
  return [title, ...values.map((value) => `- ${value}`)];
}

export function renderCockpitEnvironmentStatusResult(status: EnvironmentStatus): string {
  return renderKeyValueTable('Environment summary', statusRows(status));
}

export function renderCockpitDoctorResult(report: DoctorReport): string {
  const sections = report.sections ?? [];
  return [
    renderKeyValueTable('Doctor summary', [
      ['Result', report.ok ? 'OK' : 'Needs attention'],
      ['Target', report.target],
      ['Checks', String(report.checks.length)],
      ['Warnings', String(report.warnings.length)],
      ['Errors', String(report.errors.length)],
      ['Fixes', String(report.appliedFixes.length)],
    ]),
    sections.length > 0 ? renderSectionCountTable(sections) : undefined,
    ...renderDetails('Errors', report.errors),
    ...renderDetails('Warnings', report.warnings),
    ...renderDetails('Applied fixes', report.appliedFixes),
    ...renderDetails('Checks', report.checks),
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}
