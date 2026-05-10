import type { CreateOptions } from './types.js';

export function defaultCommunityAddons(product: string): string[] {
  return [product, `${product}_portal`, `${product}_demo`];
}

export function defaultProAddons(product: string): string[] {
  return [`${product}_payment`, `${product}_reports`, `${product}_analytics`, `${product}_pro`];
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
  return `# Addons activated from WPMoo source submodules.
#
# Source repos are managed as Git submodules under odoo/custom/src/private.
# Do not duplicate these same repos in repos.yaml.

private/${options.communityRepo}:
${yamlList(options.communityAddons)}

private/${options.proRepo}:
${yamlList(options.proAddons)}
`;
}

export function renderReposYaml(options: CreateOptions): string {
  return `# Doodba git-aggregator repositories.
#
# WPMoo product source repositories are intentionally not listed here because
# they are pinned as Git submodules:
#
# - private/${options.communityRepo}
# - private/${options.proRepo}
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

  return `# ${title} Development Environment

Private Doodba development environment for the ${title} product.

This repository owns the development environment only. Product source code lives
in submodules:

- \`odoo/custom/src/private/${options.communityRepo}\` - public community modules
- \`odoo/custom/src/private/${options.proRepo}\` - private paid/pro modules

## Repository Layout

\`\`\`text
${options.devRepo}/
├── odoo/
│   └── custom/
│       ├── src/
│       │   ├── private/
│       │   │   ├── ${options.communityRepo}/
│       │   │   └── ${options.proRepo}/
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
git clone --recurse-submodules https://github.com/${options.org}/${options.devRepo}.git
cd ${options.devRepo}
\`\`\`

If already cloned:

\`\`\`bash
git submodule update --init --recursive
\`\`\`

## Source Repositories

Community repository:

\`\`\`text
${options.org}/${options.communityRepo}
\`\`\`

Expected addon layout:

\`\`\`text
${options.communityRepo}/
${options.communityAddons.map((addon) => `├── ${addon}/`).join('\n')}
\`\`\`

Pro repository:

\`\`\`text
${options.org}/${options.proRepo}
\`\`\`

Expected addon layout:

\`\`\`text
${options.proRepo}/
${options.proAddons.map((addon) => `├── ${addon}/`).join('\n')}
\`\`\`

## Doodba Notes

The WPMoo product repositories are managed as Git submodules. Do not also add
them to \`odoo/custom/src/repos.yaml\`, otherwise the same source will be managed
by two different mechanisms.

\`odoo/custom/src/addons.yaml\` activates addons from the submodule paths.

The complete Doodba scaffold can be generated or refreshed from the official
template when \`copier\` is available:

\`\`\`bash
copier copy https://github.com/Tecnativa/doodba-copier-template .
\`\`\`

Run this only after reviewing conflicts because this repository already contains
WPMoo-specific source and documentation files.

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
modules=${[...options.communityAddons, ...options.proAddons].join(',')}
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
  return `# AGENTS.md

## Project

Private Doodba development environment for the ${titleizeProduct(options.product)} product.

## Repository Roles

- \`${options.devRepo}\`: environment/config only, private.
- \`${options.communityRepo}\`: community/public addon suite.
- \`${options.proRepo}\`: private paid addon suite.

## Source Layout

Product repositories are Git submodules:

\`\`\`text
odoo/custom/src/private/${options.communityRepo}
odoo/custom/src/private/${options.proRepo}
\`\`\`

Do not duplicate these repositories in \`repos.yaml\`.

## Addon Boundaries

Community addons belong in \`${options.communityRepo}\`:

${options.communityAddons.map((addon) => `- \`${addon}\``).join('\n')}

Pro addons belong in \`${options.proRepo}\`:

${options.proAddons.map((addon) => `- \`${addon}\``).join('\n')}

Community addons must not depend on pro addons. Pro addons may depend on
community addons.

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
docker compose run --rm odoo addons update --test --with ${options.communityAddons.join(',')}
docker compose run --rm odoo addons update --test --with ${options.proAddons.join(',')}
\`\`\`

Only report completion after the relevant update/test command exits cleanly.
`;
}

export function renderAppstoreRelease(options: CreateOptions): string {
  return `# Odoo Apps Release Notes

Paid addons can live together in \`${options.org}/${options.proRepo}\` during
development. Each paid addon still needs its own App Store metadata.

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

1. Develop in \`${options.proRepo}\`.
2. Update the addon manifest version.
3. Run update/test commands in this dev environment.
4. Tag the source commit.
5. Prepare an App Store publish package or publish mirror per paid addon.
6. Trigger Odoo Apps repository scan/update.

If App Store scan coupling becomes a problem, create separate private publish
mirror repositories for each paid addon. Keep development in
\`${options.proRepo}\`; mirrors should be generated artifacts, not hand-edited
source repositories.
`;
}

export function renderPlaceholder(title: string, body: string): string {
  return `# ${title}

${body}
`;
}

