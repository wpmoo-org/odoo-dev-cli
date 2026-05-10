import type { CreateOptions } from './types.js';

export function defaultCommunityAddons(product: string): string[] {
  return [product];
}

export function defaultProAddons(product: string): string[] {
  return [`${product}_pro`];
}

function titleizeProduct(product: string): string {
  return product
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function yamlList(items: string[]): string {
  return items.map((item) => `  - ${item}`).join('\n');
}

function allAddons(options: CreateOptions): string[] {
  return options.sourceRepos.flatMap((repo) => repo.addons);
}

function repoTree(options: CreateOptions): string {
  return options.sourceRepos.map((repo) => `│       │   │   ├── ${repo.path}/`).join('\n');
}

function sourceRepoDocs(options: CreateOptions): string {
  return options.sourceRepos
    .map(
      (repo) => `### ${repo.path}

URL:

\`\`\`text
${repo.url}
\`\`\`

Submodule path:

\`\`\`text
odoo/custom/src/private/${repo.path}
\`\`\`

Expected addon layout:

\`\`\`text
${repo.path}/
${repo.addons.map((addon) => `├── ${addon}/`).join('\n')}
\`\`\``,
    )
    .join('\n\n');
}

const BANNER_GRADIENT_START = [31, 151, 231] as const;
const BANNER_GRADIENT_END = [209, 95, 127] as const;
const ANSI_BOLD = '\u001B[1m';
const ANSI_RESET = '\u001B[0m';

function gradientColor(column: number, width: number): string {
  const ratio = width <= 1 ? 0 : column / (width - 1);
  const [startR, startG, startB] = BANNER_GRADIENT_START;
  const [endR, endG, endB] = BANNER_GRADIENT_END;
  const r = Math.round(startR + (endR - startR) * ratio);
  const g = Math.round(startG + (endG - startG) * ratio);
  const b = Math.round(startB + (endB - startB) * ratio);

  return `\u001B[38;2;${r};${g};${b}m`;
}

function applyBannerGradient(banner: string): string {
  const lines = banner.split('\n');
  const width = Math.max(...lines.map((line) => line.length));

  return lines
    .map((line) =>
      Array.from(line)
        .map((character, column) => `${gradientColor(column, width)}${character}`)
        .join(''),
    )
    .join('\n');
}

export function renderBanner(): string {
  const banner = String.raw`

░██       ░██ ░█████████  ░███     ░███
░██       ░██ ░██     ░██ ░████   ░████
░██  ░██  ░██ ░██     ░██ ░██░██ ░██░██  ░███████   ░███████
░██ ░████ ░██ ░█████████  ░██ ░████ ░██ ░██    ░██ ░██    ░██
░██░██ ░██░██ ░██         ░██  ░██  ░██ ░██    ░██ ░██    ░██
░████   ░████ ░██         ░██       ░██ ░██    ░██ ░██    ░██
░███     ░███ ░██         ░██       ░██  ░███████   ░███████

░░░░░░ WPMoo - Workflow Platform Micro Object Oriented ░░░░░░
`;

  return `${ANSI_BOLD}${applyBannerGradient(banner)}${ANSI_RESET}`;
}

export function renderGitignore(): string {
  return `# macOS/editor noise
.DS_Store
.idea/
.vscode/*.log

# Node/local package files
node_modules/
dist/
coverage/
*.log

# Python/cache files
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Local environment files
.env
.env.*
!.env.example
*.local

# Doodba/local generated files
*.code-workspace
auto/
data/
filestore/
sessions/
odoo/custom/auto/
odoo/custom/src/*/.git-aggregate-cache/

# Backups and archives
*.bak
*.backup
*.dump
*.sql
*.zip
*.tar
*.tar.gz
`;
}

export function renderAddonsYaml(options: CreateOptions): string {
  return `# Addons activated from source submodules.
#
# Source repos are managed as Git submodules under odoo/custom/src/private.
# Do not duplicate these same repos in repos.yaml.

${options.sourceRepos.map((repo) => `private/${repo.path}:\n${yamlList(repo.addons)}`).join('\n\n')}
`;
}

export function renderReposYaml(options: CreateOptions): string {
  return `# Doodba git-aggregator repositories.
#
# Project source repositories are intentionally not listed here because
# they are pinned as Git submodules:
#
${options.sourceRepos.map((repo) => `# - private/${repo.path}`).join('\n')}
#
# Keep this file for upstream/OCA repositories that Doodba should aggregate.

odoo:
  defaults:
    depth: $DEPTH_MERGE
  remotes:
    origin: https://github.com/OCA/OCB.git
    odoo: https://github.com/odoo/odoo.git
  target: origin $ODOO_VERSION
  merges:
    - origin $ODOO_VERSION
`;
}

export function renderReadme(options: CreateOptions): string {
  const title = titleizeProduct(options.product);
  const modules = allAddons(options).join(',');

  return `# ${title} Development Environment

Private Doodba development environment for the ${title} product.

This repository owns the development environment only. Product source code lives
in source repository submodules under \`odoo/custom/src/private\`.

## Repository Layout

\`\`\`text
${options.devRepo}/
├── odoo/
│   └── custom/
│       ├── src/
│       │   ├── private/
${repoTree(options)}
│       │   ├── repos.yaml
│       │   └── addons.yaml
│       ├── dependencies/
│       ├── conf.d/
│       ├── entrypoint.d/
│       └── build.d/
├── docs/
├── README.md
└── AGENTS.md
\`\`\`

## Clone

Clone with submodules:

\`\`\`bash
git clone --recurse-submodules ${options.devRepoUrl}
cd ${options.devRepo}
\`\`\`

If already cloned:

\`\`\`bash
git submodule update --init --recursive
\`\`\`

## Source Repositories

${sourceRepoDocs(options)}

## Doodba Notes

The product source repositories are managed as Git submodules. Do not also add
them to \`odoo/custom/src/repos.yaml\`, otherwise the same source will be managed
by two different mechanisms.

\`odoo/custom/src/addons.yaml\` activates addons from the submodule paths.

The complete Doodba scaffold can be generated or refreshed from the official
template when \`copier\` is available:

\`\`\`bash
copier copy https://github.com/Tecnativa/doodba-copier-template .
\`\`\`

Run this only after reviewing conflicts because this repository already contains
project-specific source and documentation files.

## Common Commands

After the Doodba scaffold is generated:

\`\`\`bash
invoke develop
invoke img-build --pull
invoke git-aggregate
invoke resetdb
invoke start
\`\`\`

Run tests for all planned product addons:

\`\`\`bash
modules=${modules}
docker compose run --rm odoo addons update --test --with $modules
\`\`\`

## Branching

Use Odoo major-version branches in source repositories:

\`\`\`text
${options.odooVersion}
\`\`\`

This dev repository can stay on \`main\` and pin exact source commits through
submodule references.
`;
}

export function renderAgents(options: CreateOptions): string {
  const repoList = options.sourceRepos
    .map((repo) => `- \`${repo.path}\`: \`${repo.url}\``)
    .join('\n');
  const addonList = options.sourceRepos
    .map((repo) => `\`${repo.path}\` addons:\n${repo.addons.map((addon) => `- \`${addon}\``).join('\n')}`)
    .join('\n\n');

  return `# AGENTS.md

## Project

Private Doodba development environment for the ${titleizeProduct(options.product)} product.

## Repository Roles

- \`${options.devRepo}\`: environment/config only, private.
${repoList}

## Source Layout

Product repositories are Git submodules:

\`\`\`text
${options.sourceRepos.map((repo) => `odoo/custom/src/private/${repo.path}`).join('\n')}
\`\`\`

Do not duplicate these repositories in \`repos.yaml\`.

## Addon Boundaries

${addonList}

Public/community addons must not depend on private paid addons. Private paid
addons may depend on public/community addons.

## Odoo 19 Rules

- Use \`<list>\` instead of \`<tree>\`.
- Use direct view expressions such as \`invisible="..."\` instead of \`attrs\`.
- Use \`models.Constraint\` instead of \`_sql_constraints\`.
- Use \`@api.ondelete(at_uninstall=False)\` for delete validation.
- Avoid \`default_*\` field names in \`res.config.settings\`.
- Keep core/community installable without any pro modules.

## Verification

After Doodba scaffold generation, use Doodba addon commands:

\`\`\`bash
docker compose run --rm odoo addons update --test --with ${allAddons(options).join(',')}
\`\`\`

Only report completion after the relevant update/test command exits cleanly.
`;
}

export function renderAppstoreRelease(options: CreateOptions): string {
  return `# Odoo Apps Release Notes

Paid addons can live together in a private source repository during development.
Each paid addon still needs its own App Store metadata.

Per addon checklist:

- \`__manifest__.py\` has correct \`name\`, \`summary\`, \`version\`, \`depends\`,
  \`license\`, \`price\`, \`currency\`, and \`support\`.
- \`license\` is appropriate for paid distribution, typically \`OPL-1\`.
- \`static/description/icon.png\` exists.
- \`static/description/index.html\` exists.
- Screenshots are stored under \`static/description/\`.
- Community dependency versions are compatible with the target Odoo major
  version.

Recommended release flow:

1. Develop in the relevant private source repository.
2. Update the addon manifest version.
3. Run update/test commands in this dev environment.
4. Tag the source commit.
5. Prepare an App Store publish package or publish mirror per paid addon.
6. Trigger Odoo Apps repository scan/update.

If App Store scan coupling becomes a problem, create separate private publish
mirror repositories for each paid addon. Keep development in
\`odoo/custom/src/private\`; mirrors should be generated artifacts, not
hand-edited source repositories.
`;
}

export function renderPlaceholder(title: string, body: string): string {
  return `# ${title}

${body}
`;
}
