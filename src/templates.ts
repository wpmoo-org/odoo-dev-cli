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

function repositoryLayout(options: CreateOptions): string {
  return `${options.devRepo}/
├── docker-compose_17.0.yml
├── docker-compose_18.0.yml
├── docker-compose_19.0.yml
├── moo
├── scripts/
├── etc/
├── odoo/
│   └── custom/
│       └── src/
│           └── private/
${options.sourceRepos.map((repo) => `│               ├── ${repo.path}/`).join('\n')}
├── docs/
├── README.md
└── AGENTS.md`;
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

function optionalAgentSkillsReadme(options: CreateOptions): string {
  if (!options.agentSkillsTemplateUrl) return '';

  return `
## Agent Skills

This environment is configured to install project-local Agent Skills from:

\`\`\`text
${options.agentSkillsTemplateUrl}${options.agentSkillsTemplateRef ? `#${options.agentSkillsTemplateRef}` : ''}
\`\`\`

After external resource installation, skills normally live under:

\`\`\`text
.agents/skills/
\`\`\`

Agents that support the Agent Skills standard can load them on demand.
`;
}

function optionalAgentSkillsAgentsSection(options: CreateOptions): string {
  if (!options.agentSkillsTemplateUrl) return '';

  return `
## Active Agent Skills

When using an agent that supports Agent Skills, prefer the project-local skills
installed under \`.agents/skills/\`. They are sourced from:

\`\`\`text
${options.agentSkillsTemplateUrl}${options.agentSkillsTemplateRef ? `#${options.agentSkillsTemplateRef}` : ''}
\`\`\`
`;
}

function environmentKind(): string {
  return 'Docker Compose';
}

function repoDuplicationNote(): string {
  return 'Keep these repositories under `odoo/custom/src/private`; the Compose entrypoint exposes discovered addons through `/mnt/wpmoo-addons`.';
}

function verificationCommand(options: CreateOptions): string {
  const firstAddon = allAddons(options)[0] ?? options.product;
  return `./moo test ${firstAddon}`;
}

function environmentUsageDocs(options: CreateOptions): string {
  return `## Docker Compose Notes

This environment uses the standalone WPMoo Odoo Compose resource. Compose files
are version-specific and static:

\`\`\`text
docker-compose_17.0.yml
docker-compose_18.0.yml
docker-compose_19.0.yml
\`\`\`

If copied from the standalone resource, additional compose documentation is kept
in \`docs/compose.md\`.

Source repositories stay under \`odoo/custom/src/private\`. At container startup,
\`entrypoint.sh\` scans those repositories for addons and exposes them through
\`/mnt/wpmoo-addons\`.

## Daily Command Hub (\`./moo\`)

\`./moo\` routes day-to-day service and module workflows to local scripts in
\`./scripts/\` (for example \`start\`, \`logs\`, \`update\`, \`test\`, \`snapshot\`).
\`./moo status\` and \`./moo doctor\` are package fallback commands that run via
\`npx --yes @wpmoo/odoo@latest ...\`.

### Start And Inspect Services

\`\`\`bash
cp .env.example .env
./moo start
./moo logs odoo
./moo shell
./moo psql postgres
./moo stop
\`\`\`

### Run, Update, And Test Modules

\`\`\`bash
./moo install ${allAddons(options)[0] ?? options.product}
./moo update ${allAddons(options)[0] ?? options.product}
./moo test ${allAddons(options)[0] ?? options.product}
\`\`\`

### Snapshot And Restore

\`\`\`bash
./moo snapshot devel before-update
./moo restore-snapshot before-update devel
\`\`\`

### Lint

\`\`\`bash
./moo lint
\`\`\`

### Export Translations

\`\`\`bash
./moo pot ${allAddons(options)[0] ?? options.product} devel i18n/${allAddons(options)[0] ?? options.product}.pot
\`\`\`

### Recover / Reset

\`\`\`bash
./moo doctor
./moo status
./moo resetdb devel ${allAddons(options)[0] ?? options.product}
\`\`\`
`;
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

░░░░░░░░░ Workflow Platform - Micro Object Oriented ░░░░░░░░░
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

# Local generated files
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

export function renderMooDelegationScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

usage() {
  case "$1" in
    "start") echo "Usage: ./moo start" ;;
    "stop") echo "Usage: ./moo stop" ;;
    "logs") echo "Usage: ./moo logs [service]" ;;
    "restart") echo "Usage: ./moo restart" ;;
    "shell") echo "Usage: ./moo shell" ;;
    "psql") echo "Usage: ./moo psql [db]" ;;
    "install") echo "Usage: ./moo install <module[,module]> [db]" ;;
    "update") echo "Usage: ./moo update <module[,module]> [db]" ;;
    "test") echo "Usage: ./moo test <module[,module]> [--db <db>] [--mode init|update] [--tags <tags>]" ;;
    "resetdb") echo "Usage: ./moo resetdb [db] [module[,module]]" ;;
    "snapshot") echo "Usage: ./moo snapshot [db] [snapshot-name]" ;;
    "restore-snapshot") echo "Usage: ./moo restore-snapshot <snapshot-name> [db]" ;;
    "lint") echo "Usage: ./moo lint" ;;
    "pot") echo "Usage: ./moo pot <module[,module]> [db] [output]" ;;
  esac
}

fail_usage() {
  usage "$1" >&2
  exit 2
}

require_no_args() {
  local command="$1"
  shift
  if [[ "$#" -ne 0 ]]; then
    fail_usage "$command"
  fi
}

optional_single_arg() {
  local command="$1"
  local fallback="$2"
  shift 2
  if [[ "$#" -gt 1 ]]; then
    fail_usage "$command"
  fi
  printf '%s\\n' "\${1:-$fallback}"
}

require_module_args() {
  local command="$1"
  shift
  if [[ "$#" -lt 1 || "\${1:-}" == -* || "$#" -gt 2 ]]; then
    fail_usage "$command"
  fi
}

positional_args() {
  local command="$1"
  local min="$2"
  local max="$3"
  shift 3
  if [[ "$#" -lt "$min" || "$#" -gt "$max" ]]; then
    fail_usage "$command"
  fi
  for arg in "$@"; do
    if [[ "$arg" == -* ]]; then
      fail_usage "$command"
    fi
  done
}

validate_test_args() {
  if [[ "$#" -lt 1 || "\${1:-}" == -* ]]; then
    fail_usage "test"
  fi

  shift
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      "--db"|"--tags")
        if [[ "$#" -lt 2 || "\${2:-}" == --* ]]; then
          echo "Missing value for $1" >&2
          exit 2
        fi
        shift 2
        ;;
      "--mode")
        if [[ "$#" -lt 2 || "\${2:-}" == --* ]]; then
          echo "Missing value for --mode" >&2
          exit 2
        fi
        if [[ "$2" != "init" && "$2" != "update" ]]; then
          echo "Invalid value for --mode: expected init or update" >&2
          exit 2
        fi
        shift 2
        ;;
      *)
        echo "Unknown option for ./moo test: $1" >&2
        exit 2
        ;;
    esac
  done
}

run_script() {
  local script="$1"
  shift
  if [[ ! -x "$script" ]]; then
    echo "Missing daily action script: \${script#./}" >&2
    exit 1
  fi
  exec "$script" "$@"
}

command="\${1:-}"
case "$command" in
  "start")
    shift
    require_no_args "$command" "$@"
    run_script ./scripts/up.sh
    ;;
  "stop")
    shift
    require_no_args "$command" "$@"
    run_script ./scripts/down.sh
    ;;
  "logs")
    shift
    service="$(optional_single_arg "$command" "odoo" "$@")"
    run_script ./scripts/logs.sh "$service"
    ;;
  "restart")
    shift
    require_no_args "$command" "$@"
    run_script ./scripts/restart.sh
    ;;
  "shell")
    shift
    require_no_args "$command" "$@"
    run_script ./scripts/shell.sh
    ;;
  "psql")
    shift
    db="$(optional_single_arg "$command" "postgres" "$@")"
    run_script ./scripts/psql.sh "$db"
    ;;
  "install")
    shift
    require_module_args "$command" "$@"
    run_script ./scripts/install.sh "$@"
    ;;
  "update")
    shift
    require_module_args "$command" "$@"
    run_script ./scripts/update.sh "$@"
    ;;
  "test")
    shift
    validate_test_args "$@"
    run_script ./scripts/test.sh "$@"
    ;;
  "resetdb")
    shift
    positional_args "$command" 0 2 "$@"
    run_script ./scripts/resetdb.sh "$@"
    ;;
  "snapshot")
    shift
    positional_args "$command" 0 2 "$@"
    run_script ./scripts/snapshot.sh "$@"
    ;;
  "restore-snapshot")
    shift
    positional_args "$command" 1 2 "$@"
    run_script ./scripts/restore-snapshot.sh "$@"
    ;;
  "lint")
    shift
    require_no_args "$command" "$@"
    run_script ./scripts/lint.sh
    ;;
  "pot")
    shift
    positional_args "$command" 1 3 "$@"
    run_script ./scripts/pot.sh "$@"
    ;;
  *)
    exec npx --yes @wpmoo/odoo@latest "$@"
    ;;
esac
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
  return `# git-aggregator repositories.
#
# Project source repositories are intentionally not listed here because
# they are pinned as Git submodules:
#
${options.sourceRepos.map((repo) => `# - private/${repo.path}`).join('\n')}
#
# Keep this file for upstream/OCA repositories that should be aggregated.

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

Private ${environmentKind()} development environment for the ${title} product.

This repository owns the development environment only. Product source code lives
in source repository submodules under \`odoo/custom/src/private\`.

## Repository Layout

\`\`\`text
${repositoryLayout(options)}
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

## WPMoo CLI Shortcut

This environment includes a local \`moo\` shortcut script. From the repository
root:

\`\`\`bash
./moo
./moo start
./moo stop
./moo restart
./moo doctor
./moo add-module
\`\`\`

Optionally, if this repository root is on your \`PATH\`, you can run \`moo ...\`
from anywhere and the script will return to this environment root first.
${optionalAgentSkillsReadme(options)}
## Source Repositories

${sourceRepoDocs(options)}

${environmentUsageDocs(options)}
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

Private ${environmentKind()} development environment for the ${titleizeProduct(options.product)} product.

## Repository Roles

- \`${options.devRepo}\`: environment/config only, private.
${repoList}

## Source Layout

Product repositories are Git submodules:

\`\`\`text
${options.sourceRepos.map((repo) => `odoo/custom/src/private/${repo.path}`).join('\n')}
\`\`\`

${repoDuplicationNote()}
${optionalAgentSkillsAgentsSection(options)}
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

Use the environment's addon test/update command:

\`\`\`bash
${verificationCommand(options)}
\`\`\`

Useful maintenance commands:

\`\`\`bash
./moo lint
./moo resetdb [db] [module[,module]]
./moo snapshot [db] [snapshot-name]
./moo restore-snapshot <snapshot-name> [db]
./moo pot <module[,module]> [db] [output]
\`\`\`

Daily script delegation vs package fallback:
- \`./moo start\`, \`logs\`, \`install\`, \`update\`, \`test\`, \`snapshot\`, and related runtime tasks delegate to local \`./scripts/*.sh\`.
- \`./moo status\` and \`./moo doctor\` are package fallback commands routed to \`npx --yes @wpmoo/odoo@latest ...\`.

Only report completion after the relevant update/test/lint command exits cleanly.
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
