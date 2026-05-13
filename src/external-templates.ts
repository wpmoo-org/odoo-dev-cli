import type { ExternalAssetOptions } from './external-assets.js';
import type { ScaffoldOptions } from './types.js';

export const defaultComposeTemplateUrl = 'gh:wpmoo-org/odoo-docker-compose';
export const defaultAgentSkillsTemplateUrl = 'gh:wpmoo-org/odoo-skills';

function odooMajorVersion(odooVersion: string): string {
  return odooVersion.split('.', 1)[0] || odooVersion;
}

export function defaultPostgresVersion(odooVersion: string): string {
  const major = odooMajorVersion(odooVersion);
  if (major === '19') return '18';
  if (major === '18') return '17';
  if (major === '17') return '15';
  if (major === '16') return '14';
  return '17';
}

export function defaultHttpPort(odooVersion: string): string {
  const major = odooMajorVersion(odooVersion).padStart(2, '0');
  return `100${major}`;
}

export function defaultGeventPort(odooVersion: string): string {
  const major = odooMajorVersion(odooVersion).padStart(2, '0');
  return `200${major}`;
}

export function defaultTestModule(options: ScaffoldOptions): string {
  return options.sourceRepos.flatMap((repo) => repo.addons)[0] ?? options.product;
}

export function renderComposeEnvExample(options: ScaffoldOptions): string {
  return [
    '# Copy to .env and edit for local development.',
    `ODOO_VERSION=${options.odooVersion}`,
    `ODOO_IMAGE=odoo:${odooMajorVersion(options.odooVersion)}`,
    `POSTGRES_IMAGE=postgres:${options.postgresVersion ?? defaultPostgresVersion(options.odooVersion)}`,
    `HTTP_PORT=${options.httpPort ?? defaultHttpPort(options.odooVersion)}`,
    `GEVENT_PORT=${options.geventPort ?? defaultGeventPort(options.odooVersion)}`,
    'POSTGRES_PASSWORD=odoo',
    'ODOO_MASTER_PASSWORD=admin',
    `ODOO_TEST_MODULE=${defaultTestModule(options)}`,
    '',
  ].join('\n');
}

export function composeTemplateOptions(options: ScaffoldOptions): ExternalAssetOptions {
  return {
    label: 'compose',
    source: options.composeTemplateUrl ?? defaultComposeTemplateUrl,
    destination: options.target,
    ref: options.composeTemplateRef,
    exclude: ['README.md', 'README-template.md', '.gitignore', 'LICENSE', 'package.json', 'package-lock.json'],
    readmeDestination: 'docs/compose.md',
  };
}

export function agentSkillsTemplateOptions(options: ScaffoldOptions): ExternalAssetOptions | undefined {
  if (!options.agentSkillsTemplateUrl) {
    return undefined;
  }

  return {
    label: 'agent-skills',
    source: options.agentSkillsTemplateUrl,
    destination: options.target,
    ref: options.agentSkillsTemplateRef,
    sourceSubdir: 'skills',
    destinationSubdir: '.agents/skills',
    exclude: ['package.json', 'package-lock.json'],
  };
}

export function plannedExternalAssetOptions(options: ScaffoldOptions): ExternalAssetOptions[] {
  return [composeTemplateOptions(options), agentSkillsTemplateOptions(options)].filter(
    (assetOptions): assetOptions is ExternalAssetOptions => Boolean(assetOptions),
  );
}
