import type { CreateOptions } from './types.js';
import { packageName, packageVersion } from './version.js';

function fallbackPackageSpec(): string {
  return `${packageName()}@${packageVersion()}`;
}

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

function hasSourceRepos(options: CreateOptions): boolean {
  return options.sourceRepos.length > 0;
}

function sourceTypeOf(repo: CreateOptions['sourceRepos'][number]): string {
  return repo.sourceType ?? 'private';
}

function sourceRepoRelativePath(repo: CreateOptions['sourceRepos'][number]): string {
  return `odoo/custom/src/${sourceTypeOf(repo)}/${repo.path}`;
}

function repositoryLayout(options: CreateOptions): string {
  const sourceRepoRows = hasSourceRepos(options)
    ? options.sourceRepos
        .map((repo, index) => {
          const connector = index === options.sourceRepos.length - 1 ? '└──' : '├──';
          return `│       │   │   ${connector} ${repo.path}/              # Project-owned addon source repository`;
        })
        .join('\n')
    : '│       │   │   └── (add project-owned repos with ./moo add-repo)';

  return `${options.devRepo}/                          # Development environment root
├── compose.yaml                            # Base Docker Compose file
├── compose/                                # Compose overlays for each workflow
│   ├── dev.yaml                            # Local development services
│   ├── debug.yaml                          # Debug tooling and debug-friendly settings
│   ├── test.yaml                           # Test runner services and test database setup
│   ├── stage.yaml                          # Staging-like deployment overlay
│   ├── prod.yaml                           # Production deployment overlay
│   ├── proxy.yaml                          # Reverse proxy / edge routing overlay
│   └── tools.yaml                          # Optional maintenance and helper tools
├── config/                                 # Runtime configuration mounted into containers
│   ├── odoo/                               # Odoo server configuration
│   │   ├── odoo.conf                       # Main Odoo configuration file
│   │   └── requirements.txt                # Extra Python dependencies for the Odoo container
│   └── logrotate/                          # Log rotation configuration
│       └── odoo                            # Logrotate rules for Odoo logs
├── resources/                              # Container-side helper resources
│   └── odoo/                               # Resources specific to the Odoo service
│       └── entrypoint.sh                   # Container startup script that discovers addons
├── moo                                     # Local command hub shortcut
├── scripts/                                # Shell scripts used by the local command hub
├── odoo/                                   # Odoo workspace data and custom source tree
│   └── custom/                             # Custom addon layer for this environment
│       ├── src/                            # Source repository checkout root
│       │   ├── private/                    # Project-owned/private addon repositories
${sourceRepoRows}
│       │   ├── oca/                        # OCA addon repositories
│       │   └── external/                   # Non-OCA third-party addon repositories
│       ├── patches/                        # Local patches for upstream repositories
│       └── manifests/                      # Source manifests, locks, and pinned revisions
├── docs/                                   # Project-specific documentation
│   ├── appstore-release.md                 # Odoo App Store release checklist and notes
│   └── compose.md                          # Compose layout and operations reference
├── .env.example                            # Template for local environment variables
├── README.md                               # This environment overview
└── AGENTS.md                               # Agent instructions for this environment`;
}

function sourceRepoDocs(options: CreateOptions): string {
  if (!hasSourceRepos(options)) {
    return `This environment was scaffolded without source repository submodules.
Add source repositories later from the cockpit or with \`npx @wpmoo/toolkit add-repo\`.
They can be organized under:

\`odoo/custom/src/private\` for project-owned/private addon repositories,
\`odoo/custom/src/oca\` for OCA repositories, and
\`odoo/custom/src/external\` for non-OCA third-party repositories.

Pinned external manifests and local patches should live under
\`odoo/custom/manifests\` and \`odoo/custom/patches\` respectively.`;
  }

  return options.sourceRepos
    .map(
      (repo) => `### ${repo.path}

URL:

\`\`\`text
${repo.url}
\`\`\`

Submodule path:

\`\`\`text
${sourceRepoRelativePath(repo)}
\`\`\`

Source manifest entry:

\`\`\`text
odoo/custom/manifests/sources.yaml
\`\`\`

Expected addon layout:

\`\`\`text
${repo.path}/
${repo.addons.map((addon) => `├── ${addon}/`).join('\n')}
\`\`\``,
    )
    .join('\n\n');
}

function cloneDocs(options: CreateOptions): string {
  if (!hasSourceRepos(options)) {
    return `## Local Folder

This environment is ready in this folder:

\`\`\`bash
cd ${options.devRepo}
\`\`\`

If you later connect it to Git, commit the generated files after reviewing them.
`;
  }

  return `## Clone

Clone with submodules:

\`\`\`bash
git clone --recurse-submodules ${options.devRepoUrl}
cd ${options.devRepo}
\`\`\`

If already cloned:

\`\`\`bash
git submodule update --init --recursive
\`\`\`
`;
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
  return 'Keep source repositories under the relevant source directory (`private`, `oca`, or `external`); the Compose entrypoint exposes discovered addons through `/mnt/wpmoo-addons`.';
}

function verificationCommand(options: CreateOptions): string {
  const firstAddon = allAddons(options)[0] ?? options.product;
  return `./moo test ${firstAddon}`;
}

function environmentUsageDocs(options: CreateOptions): string {
  return `## Docker Compose Notes

This environment uses the compact WPMoo Compose layout:

\`\`\`text
compose.yaml
compose/dev.yaml
compose/stage.yaml
compose/prod.yaml
config/odoo/odoo.conf
resources/odoo/entrypoint.sh
\`\`\`

Development uses compose.yaml plus compose/dev.yaml by default.
Set WPMOO_ENV=stage or WPMOO_ENV=prod only after providing production-grade secrets and volumes.
In WPMOO_ENV=stage, lifecycle commands such as install, update, stop, and
restart require WPMOO_ALLOW_STAGE_LIFECYCLE=1. In WPMOO_ENV=prod, lifecycle
commands such as install, update, test, stop, and restart require
WPMOO_ALLOW_PROD_LIFECYCLE=1. Destructive database commands such as
resetdb and real restore-snapshot require WPMOO_ALLOW_DESTRUCTIVE=1 in stage
and prod. restore-snapshot --dry-run remains available for preview.
For short-lived local approvals, add JSONL entries to \`.wpmoo/approvals.jsonl\`;
generated \`.gitignore\` keeps that ledger out of Git.

If copied from the standalone resource, additional compose notes are in
\`docs/compose.md\`.

Source repositories stay under \`odoo/custom/src/{private,oca,external}\` when
configured. At
container startup, \`entrypoint.sh\` scans those repositories for addons and
exposes them through \`/mnt/wpmoo-addons\`.

## Daily Command Hub (\`./moo\`)

\`./moo\` routes day-to-day service and module workflows to local scripts in
\`./scripts/\` (for example \`start\`, \`logs\`, \`update\`, \`test\`, \`snapshot\`).
\`./moo status\` runs local offline metadata checks without needing network access.
\`./moo doctor\` runs local checks first and uses the package fallback only for
advanced usage (for example \`--help\`) via \`npx --yes ${fallbackPackageSpec()} doctor\`.

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
./moo restore-snapshot --dry-run before-update devel
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
const ANSI_DIM = '\u001B[2m';
const ANSI_INFO = '\u001B[38;2;139;166;190m';
const ANSI_TAGLINE = '\u001B[38;2;120;157;181m';
const ANSI_META = '\u001B[38;2;218;236;246m';
const ANSI_SUCCESS = '\u001B[32m';
const ANSI_ERROR = '\u001B[31m';
const ANSI_WARNING = '\u001B[33m';
const ANSI_DEFAULT_FOREGROUND = '\u001B[39m';
const ANSI_RESET = '\u001B[0m';
const BANNER_TAGLINE = 'Development, staging and production workflows for Odoo projects.';

type BannerOptions = {
  version?: string;
  color?: boolean;
};

function shouldRenderBannerColor(options: BannerOptions): boolean {
  return options.color ?? process.env.NO_COLOR === undefined;
}

function gradientColor(column: number, width: number): string {
  const ratio = width <= 1 ? 0 : column / (width - 1);
  const [startR, startG, startB] = BANNER_GRADIENT_START;
  const [endR, endG, endB] = BANNER_GRADIENT_END;
  const r = Math.round(startR + (endR - startR) * ratio);
  const g = Math.round(startG + (endG - startG) * ratio);
  const b = Math.round(startB + (endB - startB) * ratio);

  return `\u001B[38;2;${r};${g};${b}m`;
}

function applyBannerGradient(banner: string, color: boolean): string {
  if (!color) {
    return banner;
  }

  const lines = banner.split('\n');

  return lines
    .map((line) => {
      const width = line.length;
      return Array.from(line)
        .map((character, column) => `${gradientColor(column, width)}${character}`)
        .join('');
    })
    .join('\n');
}

function renderDimInfo(value: string, color: boolean): string {
  if (!color) return value;
  return `${ANSI_DIM}${ANSI_INFO}${value}${ANSI_RESET}`;
}

function renderMetaInfo(value: string, color: boolean): string {
  if (!color) return value;
  return `${ANSI_META}${value}${ANSI_RESET}`;
}

function renderSuccessInfo(value: string, color: boolean): string {
  if (!color) return value;
  return `${ANSI_SUCCESS}${value}${ANSI_DEFAULT_FOREGROUND}`;
}

function renderErrorInfo(value: string, color: boolean): string {
  if (!color) return value;
  return `${ANSI_ERROR}${value}${ANSI_DEFAULT_FOREGROUND}`;
}

function renderWarningInfo(value: string, color: boolean): string {
  if (!color) return value;
  return `${ANSI_WARNING}${value}${ANSI_DEFAULT_FOREGROUND}`;
}

function renderTaglineInfo(value: string, color: boolean): string {
  if (!color) return value;
  return `${ANSI_TAGLINE}${value}${ANSI_RESET}`;
}

function renderBannerDetail(value: string, color: boolean): string {
  const match = /^(Environment|Status|Last):(.*)$/u.exec(value);
  if (!match) {
    return renderDimInfo(value, color);
  }

  const label = match[1];
  const detail = match[2] ?? '';

  if (label === 'Status') {
    const statusMatch = /^ (●) (.*)$/u.exec(detail);
    if (statusMatch) {
      const marker = statusMatch[1] ?? '';
      const message = statusMatch[2] ?? '';
      const renderMarker = message === 'Services running' ? renderSuccessInfo : renderWarningInfo;
      return `${renderMetaInfo(`${label}:`, color)} ${renderMarker(marker, color)}${renderTaglineInfo(` ${message}`, color)}`;
    }
  }

  if (label === 'Last') {
    const completedMatch = /^(.*?)( ✓ completed)$/u.exec(detail);
    if (completedMatch) {
      return `${renderMetaInfo(`${label}:`, color)}${renderDimInfo(completedMatch[1] ?? '', color)}${renderSuccessInfo(completedMatch[2] ?? '', color)}`;
    }

    const errorMatch = /^(.*?)( ✗ Error)(: .*)?$/u.exec(detail);
    if (errorMatch) {
      return [
        renderMetaInfo(`${label}:`, color),
        renderDimInfo(errorMatch[1] ?? '', color),
        renderErrorInfo(errorMatch[2] ?? '', color),
        renderTaglineInfo(errorMatch[3] ?? '', color),
      ].join('');
    }
  }

  return `${renderMetaInfo(`${label}:`, color)}${renderDimInfo(detail, color)}`;
}

export function renderBanner(details: readonly string[] = [], options: BannerOptions = {}): string {
  const color = shouldRenderBannerColor(options);
  const title = `${applyBannerGradient('WPMoo Toolkit', color)}${options.version ? `  ${renderDimInfo(options.version, color)}` : ''}`;
  const header = [
    title,
    applyBannerGradient('Workflow Platform · Micro Object Oriented', color),
    renderTaglineInfo(BANNER_TAGLINE, color),
    applyBannerGradient('━'.repeat(BANNER_TAGLINE.length), color),
  ].join('\n');
  const detailsBlock = details.length > 0 ? `\n${details.map((line) => renderBannerDetail(line, color)).join('\n')}` : '';

  return color ? `\n${ANSI_BOLD}${header}${ANSI_RESET}${detailsBlock}` : `\n${header}${detailsBlock}`;
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
.wpmoo/approvals.jsonl

# Local generated files
*.code-workspace
addons/
auto/
backups/
data/
filestore/
postgresql/
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
    "logs") echo "Usage: ./moo logs [service] [tail-lines]" ;;
    "restart") echo "Usage: ./moo restart" ;;
    "shell") echo "Usage: ./moo shell" ;;
    "psql") echo "Usage: ./moo psql [db]" ;;
    "install") echo "Usage: ./moo install <module[,module]> [db]" ;;
    "update") echo "Usage: ./moo update <module[,module]> [db]" ;;
    "test") echo "Usage: ./moo test <module[,module]> [--db <db>] [--mode auto|init|update] [--tags <tags>]" ;;
    "resetdb") echo "Usage: ./moo resetdb [db] [module[,module]]" ;;
    "snapshot") echo "Usage: ./moo snapshot [--list] [db] [snapshot-name]" ;;
    "restore-snapshot") echo "Usage: ./moo restore-snapshot [--dry-run] <snapshot-name> [db]" ;;
    "lint") echo "Usage: ./moo lint" ;;
    "pot") echo "Usage: ./moo pot <module[,module]> [db] [output]" ;;
  esac
}

show_help() {
  cat <<'HELP'
Usage: ./moo <command> [args]

Daily commands:
  start, stop, logs, restart, shell, psql
  install, update, test, resetdb, snapshot, restore-snapshot, lint, pot

Management commands:
  source, add-repo, remove-repo, add-module, remove-module, reset, doctor

Local diagnostics:
  status [--json]

Run ./moo <command> with invalid arguments to see command-specific usage.
HELP
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
        if [[ "$2" != "auto" && "$2" != "init" && "$2" != "update" ]]; then
          echo "Invalid value for --mode: expected auto, init, or update" >&2
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

env_file_value() {
  local key="$1"
  if [[ -f ".env" ]]; then
    grep -E "^[[:space:]]*\${key}[[:space:]]*=" ".env" | tail -n 1 | sed -E "s/^[[:space:]]*\${key}[[:space:]]*=[[:space:]]*//; s/[[:space:]]*(#.*)?$//; s/^[\\"']//; s/[\\"']$//"
  fi
}

selected_env() {
  local value="\${WPMOO_ENV:-$(env_file_value WPMOO_ENV)}"
  printf '%s\\n' "\${value:-dev}"
}

approval_active() {
  local scope="$1"
  local command="$2"
  local env_name="$3"
  [[ -f .wpmoo/approvals.jsonl ]] || return 1

  node --input-type=module - "$scope" "$command" "$env_name" <<'NODE'
import { readFileSync } from 'node:fs';

const [scope, command, envName] = process.argv.slice(2);

try {
  const content = readFileSync('.wpmoo/approvals.jsonl', 'utf8');
  for (const rawLine of content.split(/\\r?\\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!entry || typeof entry !== 'object') continue;
    if (entry.scope !== scope || entry.environment !== envName) continue;
    if (typeof entry.command === 'string' && entry.command !== command) continue;

    const expiresAt = Date.parse(entry.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      process.exit(0);
    }
  }
} catch {
}

process.exit(1);
NODE
}

allow_destructive() {
  local command="$1"
  local env_name="\${2:-$(selected_env)}"
  local value="\${WPMOO_ALLOW_DESTRUCTIVE:-$(env_file_value WPMOO_ALLOW_DESTRUCTIVE)}"
  [[ "$value" == "1" ]] || approval_active "destructive" "$command" "$env_name"
}

require_destructive_allowed() {
  local command="$1"
  local env_name
  env_name="$(selected_env)"
  if [[ "$env_name" == "stage" || "$env_name" == "prod" ]]; then
    if ! allow_destructive "$command" "$env_name"; then
      echo "Refusing destructive command '$command' in WPMOO_ENV=$env_name. Set WPMOO_ALLOW_DESTRUCTIVE=1 to run it intentionally." >&2
      exit 1
    fi
  fi
}

allow_prod_lifecycle() {
  local command="$1"
  local env_name="\${2:-$(selected_env)}"
  local value="\${WPMOO_ALLOW_PROD_LIFECYCLE:-$(env_file_value WPMOO_ALLOW_PROD_LIFECYCLE)}"
  [[ "$value" == "1" ]] || approval_active "prod-lifecycle" "$command" "$env_name"
}

allow_stage_lifecycle() {
  local command="$1"
  local env_name="\${2:-$(selected_env)}"
  local value="\${WPMOO_ALLOW_STAGE_LIFECYCLE:-$(env_file_value WPMOO_ALLOW_STAGE_LIFECYCLE)}"
  [[ "$value" == "1" ]] || approval_active "stage-lifecycle" "$command" "$env_name"
}

allow_no_recent_snapshot() {
  local command="$1"
  local env_name="\${2:-$(selected_env)}"
  local value="\${WPMOO_ALLOW_NO_RECENT_SNAPSHOT:-$(env_file_value WPMOO_ALLOW_NO_RECENT_SNAPSHOT)}"
  [[ "$value" == "1" ]] || approval_active "no-recent-snapshot" "$command" "$env_name"
}

allow_migrations() {
  local command="$1"
  local env_name="\${2:-$(selected_env)}"
  local value="\${WPMOO_ALLOW_MIGRATIONS:-$(env_file_value WPMOO_ALLOW_MIGRATIONS)}"
  [[ "$value" == "1" ]] || approval_active "migration-risk" "$command" "$env_name"
}

has_recent_snapshot() {
  local dir
  for dir in backups/snapshots backups backup snapshots; do
    [[ -d "$dir" ]] || continue
    if find "$dir" -type f \\( -name "*.dump" -o -name "*.sql" -o -name "*.sql.gz" -o -name "*.zip" -o -name "*.tar" -o -name "*.tar.gz" \\) -mtime -1 -print -quit 2>/dev/null | grep -q .; then
      return 0
    fi
  done
  return 1
}

snapshot_stem() {
  local file="$1"
  file="\${file##*/}"
  file="\${file%.filestore.tar.gz}"
  file="\${file%.sql.gz}"
  file="\${file%.tar.gz}"
  file="\${file%.dump}"
  file="\${file%.sql}"
  file="\${file%.zip}"
  file="\${file%.tar}"
  printf '%s' "$file"
}

json_string_value() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/.*\\"$key\\"[[:space:]]*:[[:space:]]*\\"\\([^\\"]*\\)\\".*/\\1/p" "$file" | head -n 1
}

list_snapshots() {
  local found=0 dir dump stem manifest database created filestore
  for dir in backups/snapshots backups backup snapshots; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r dump; do
      [[ -n "$dump" ]] || continue
      found=1
      stem="$(snapshot_stem "$dump")"
      manifest="$dir/$stem.json"
      database="$(json_string_value database "$manifest")"
      created="$(json_string_value created_at "$manifest")"
      filestore="$dir/$stem.filestore.tar.gz"
      echo "- $stem"
      [[ -n "$created" ]] && echo "  Created: $created"
      echo "  Database: \${database:-unknown}"
      echo "  Dump: $dump"
      if [[ -f "$filestore" ]]; then
        echo "  Filestore: $filestore (found)"
      else
        echo "  Filestore: missing (missing)"
      fi
    done < <(find "$dir" -maxdepth 1 -type f \\( -name "*.dump" -o -name "*.sql" -o -name "*.sql.gz" \\) | sort)
  done

  if [[ "$found" -eq 0 ]]; then
    echo "No database snapshots found."
    echo "Next: run ./moo snapshot [db] [snapshot-name]."
  fi
}

list_snapshots_json() {
  node --input-type=module <<'NODE'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const directories = ['backups/snapshots', 'backups', 'backup', 'snapshots'];
const extensions = ['.dump', '.sql', '.sql.gz', '.zip', '.tar', '.tar.gz'];
const now = Date.now();

function snapshotStem(file) {
  return file
    .replace(/\\.filestore\\.tar\\.gz$/, '')
    .replace(/\\.sql\\.gz$/, '')
    .replace(/\\.tar\\.gz$/, '')
    .replace(/\\.dump$/, '')
    .replace(/\\.sql$/, '')
    .replace(/\\.zip$/, '')
    .replace(/\\.tar$/, '');
}

function hasSnapshotExtension(file) {
  return extensions.some((extension) => file.endsWith(extension));
}

function readManifest(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function manifestString(manifest, key) {
  return manifest && typeof manifest[key] === 'string' ? manifest[key] : undefined;
}

const snapshots = [];
for (const directory of directories) {
  if (!existsSync(directory)) continue;

  for (const file of readdirSync(directory).sort()) {
    if (file.endsWith('.filestore.tar.gz') || !hasSnapshotExtension(file)) continue;

    const dumpPath = join(directory, file);
    const stats = statSync(dumpPath);
    if (!stats.isFile()) continue;

    const name = snapshotStem(file);
    const manifestPath = join(directory, name + '.json');
    const manifest = readManifest(manifestPath);
    const manifestDump = manifestString(manifest, 'dump');
    const manifestFilestore = manifestString(manifest, 'filestore');
    const filestorePath = join(directory, manifestFilestore || name + '.filestore.tar.gz');
    const createdAtMs = Date.parse(manifestString(manifest, 'created_at') || '');
    const effectiveCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : stats.mtimeMs;

    snapshots.push({
      name: manifestString(manifest, 'name') || name,
      path: dumpPath,
      dumpPath: manifestDump ? join(directory, manifestDump) : dumpPath,
      ...(existsSync(manifestPath) ? { manifestPath } : {}),
      ...(manifestString(manifest, 'database') ? { databaseName: manifestString(manifest, 'database') } : {}),
      createdAtMs: effectiveCreatedAtMs,
      createdAt: new Date(effectiveCreatedAtMs).toISOString(),
      mtimeMs: stats.mtimeMs,
      ageMs: Math.max(0, now - effectiveCreatedAtMs),
      filestorePath,
      filestoreStatus: existsSync(filestorePath) ? 'found' : 'missing',
    });
  }
}

snapshots.sort((left, right) => right.createdAtMs - left.createdAtMs || left.path.localeCompare(right.path));
console.log(JSON.stringify({ schemaVersion: 1, command: 'snapshot list', ok: true, snapshots }, null, 2));
NODE
}

require_recent_snapshot_or_override() {
  local command="$1"
  local env_name
  env_name="$(selected_env)"
  if [[ "$env_name" == "stage" || "$env_name" == "prod" ]]; then
    if ! allow_no_recent_snapshot "$command" "$env_name" && ! has_recent_snapshot; then
      echo "Refusing destructive command '$command' in WPMOO_ENV=$env_name without a recent database snapshot. Create a snapshot first or set WPMOO_ALLOW_NO_RECENT_SNAPSHOT=1 to run it intentionally." >&2
      exit 1
    fi
  fi
}

has_migration_risk() {
  local base
  for base in odoo/custom/src/private odoo/custom/src/oca odoo/custom/src/external; do
    [[ -d "$base" ]] || continue
    if find "$base" -type f \\( -path "*/migrations/*/pre-migration.py" -o -path "*/migrations/*/post-migration.py" -o -path "*/migrations/*/end-migration.py" -o -path "*/migration/*/pre-migration.py" -o -path "*/migration/*/post-migration.py" -o -path "*/migration/*/end-migration.py" -o -path "*/scripts/migrate.py" -o -path "*/scripts/migration.py" \\) -print -quit 2>/dev/null | grep -q .; then
      return 0
    fi
  done
  return 1
}

require_migrations_allowed() {
  local command="$1"
  local env_name
  env_name="$(selected_env)"
  if [[ "$env_name" == "stage" || "$env_name" == "prod" ]]; then
    if ! allow_migrations "$command" "$env_name" && has_migration_risk; then
      echo "Refusing migration-risk command '$command' in WPMOO_ENV=$env_name. Review detected migration scripts or set WPMOO_ALLOW_MIGRATIONS=1 to run it intentionally." >&2
      exit 1
    fi
  fi
}

require_stage_lifecycle_allowed() {
  local command="$1"
  local env_name
  env_name="$(selected_env)"
  if [[ "$env_name" == "stage" ]]; then
    if ! allow_stage_lifecycle "$command" "$env_name"; then
      echo "Refusing stage lifecycle command '$command' in WPMOO_ENV=stage. Set WPMOO_ALLOW_STAGE_LIFECYCLE=1 to run it intentionally." >&2
      exit 1
    fi
  fi
}

require_prod_lifecycle_allowed() {
  local command="$1"
  local env_name
  env_name="$(selected_env)"
  if [[ "$env_name" == "prod" ]]; then
    if ! allow_prod_lifecycle "$command" "$env_name"; then
      echo "Refusing production lifecycle command '$command' in WPMOO_ENV=prod. Set WPMOO_ALLOW_PROD_LIFECYCLE=1 to run it intentionally." >&2
      exit 1
    fi
  fi
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

run_package_command() {
  exec npx --yes ${fallbackPackageSpec()} "$@"
}

command="\${1:-}"
case "$command" in
  "")
    run_package_command "$@"
    ;;
  "--help"|"-h"|"help")
    show_help
    ;;
  "--version"|"-v"|"version")
    run_package_command "$@"
    ;;
  "status")
    shift
    if [[ -x ./scripts/status.sh ]]; then
      run_script ./scripts/status.sh "$@"
    fi
    run_package_command "$command" "$@"
    ;;
  "doctor")
    shift
    if [[ "$#" -eq 0 && -x ./scripts/doctor.sh ]]; then
      run_script ./scripts/doctor.sh
    fi
    run_package_command "$command" "$@"
    ;;
  "create"|"add-repo"|"remove-repo"|"add-module"|"remove-module"|"source"|"reset")
    run_package_command "$@"
    ;;
  "start")
    shift
    require_no_args "$command" "$@"
    run_script ./scripts/up.sh
    ;;
  "stop")
    shift
    require_no_args "$command" "$@"
    require_stage_lifecycle_allowed "$command"
    require_prod_lifecycle_allowed "$command"
    run_script ./scripts/down.sh
    ;;
  "logs")
    shift
    if [[ "$#" -gt 2 || "\${1:-}" == -* || "\${2:-}" == -* ]]; then
      fail_usage "$command"
    fi
    service="\${1:-odoo}"
    if [[ "$#" -eq 2 ]]; then
      if [[ ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Invalid logs tail count: expected a positive integer." >&2
        exit 2
      fi
      run_script ./scripts/logs.sh "$service" "$2"
    fi
    run_script ./scripts/logs.sh "$service"
    ;;
  "restart")
    shift
    require_no_args "$command" "$@"
    require_stage_lifecycle_allowed "$command"
    require_prod_lifecycle_allowed "$command"
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
    require_stage_lifecycle_allowed "$command"
    require_prod_lifecycle_allowed "$command"
    require_migrations_allowed "$command"
    run_script ./scripts/install.sh "$@"
    ;;
  "update")
    shift
    require_module_args "$command" "$@"
    require_stage_lifecycle_allowed "$command"
    require_prod_lifecycle_allowed "$command"
    require_migrations_allowed "$command"
    run_script ./scripts/update.sh "$@"
    ;;
  "test")
    shift
    validate_test_args "$@"
    require_prod_lifecycle_allowed "$command"
    require_migrations_allowed "$command"
    run_script ./scripts/test.sh "$@"
    ;;
  "resetdb")
    shift
    positional_args "$command" 0 2 "$@"
    require_destructive_allowed "$command"
    require_recent_snapshot_or_override "$command"
    run_script ./scripts/resetdb.sh "$@"
    ;;
  "snapshot")
    shift
    if [[ "\${1:-}" == "--list" || "\${1:-}" == "--json" ]]; then
      list_requested=0
      json_requested=0
      while [[ "$#" -gt 0 ]]; do
        case "$1" in
          "--list")
            list_requested=1
            shift
            ;;
          "--json")
            json_requested=1
            shift
            ;;
          *)
            fail_usage "$command"
            ;;
        esac
      done
      if [[ "$list_requested" -ne 1 ]]; then
        fail_usage "$command"
      fi
      if [[ "$json_requested" -eq 1 ]]; then
        list_snapshots_json
      else
        list_snapshots
      fi
      exit 0
    fi
    positional_args "$command" 0 2 "$@"
    run_script ./scripts/snapshot.sh "$@"
    ;;
  "restore-snapshot")
    shift
    restore_args=()
    if [[ "\${1:-}" == "--dry-run" ]]; then
      restore_args+=("--dry-run")
      shift
    fi
    positional_args "$command" 1 2 "$@"
    restore_args+=("$@")
    if [[ "\${restore_args[0]:-}" != "--dry-run" ]]; then
      require_destructive_allowed "$command"
      require_recent_snapshot_or_override "$command"
    fi
    run_script ./scripts/restore-snapshot.sh "\${restore_args[@]}"
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
    echo "Unknown ./moo command: $command" >&2
    echo "Run ./moo --help to see supported commands." >&2
    exit 2
    ;;
esac
`;
}

export function renderDoctorScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd -- "$script_dir/.." && pwd)"
cd "$root_dir"

echo "WPMoo doctor"

issues=()
warnings=()

required_files=(
  "moo"
)

required_scripts=(
  "up.sh"
  "down.sh"
  "logs.sh"
  "restart.sh"
  "shell.sh"
  "psql.sh"
  "install.sh"
  "update.sh"
  "test.sh"
  "resetdb.sh"
  "snapshot.sh"
  "restore-snapshot.sh"
  "lint.sh"
  "pot.sh"
  "status.sh"
)

for file in "\${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    issues+=("missing required file: $file")
  fi
done

for script in "\${required_scripts[@]}"; do
  script_path="scripts/$script"
  if [[ ! -f "$script_path" ]]; then
    issues+=("missing required script: $script_path")
    continue
  fi
  if [[ ! -x "$script_path" ]]; then
    issues+=("not executable: $script_path")
  fi
done

if [[ ! -d scripts ]]; then
  issues+=("missing scripts directory")
fi

if [[ ! -d odoo/custom/src ]]; then
  warnings+=("odoo/custom/src is missing; add source repositories before running module workflows.")
fi

if [[ ! -f .wpmoo/odoo.json ]]; then
  warnings+=("missing .wpmoo/odoo.json; run ./moo reset to initialize environment metadata.")
fi

if (( \${#issues[@]} > 0 )); then
  echo "Doctor checks found issues."
  for issue in "\${issues[@]}"; do
    echo " - $issue"
  done
  if (( \${#warnings[@]} > 0 )); then
    for warning in "\${warnings[@]}"; do
      echo " - warning: $warning"
    done
  fi
  exit 1
fi

echo "Doctor checks passed."
if (( \${#warnings[@]} > 0 )); then
  for warning in "\${warnings[@]}"; do
    echo " - warning: $warning"
  done
fi
`;
}

export function renderStatusScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd -- "$script_dir/.." && pwd)"
cd "$root_dir"

node --input-type=module - "$@" <<'NODE'
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';

const args = process.argv.slice(2);
function parseJsonOption(argv) {
  let json = false;
  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('--json=')) {
      const value = arg.slice('--json='.length).toLowerCase().trim();
      if (['true', '1', 'yes', 'y'].includes(value)) {
        json = true;
        continue;
      }
      if (['false', '0', 'no', 'n'].includes(value)) {
        json = false;
        continue;
      }
      console.error('Invalid boolean value for --json: ' + arg.slice('--json='.length));
      process.exit(2);
    }

    console.error('Usage: ./moo status [--json]');
    process.exit(2);
  }
  return json;
}

const json = parseJsonOption(args);
const target = process.cwd();
const metadataPath = '.wpmoo/odoo.json';
const validSourceTypes = new Set(['private', 'oca', 'external']);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidPathSegment(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return Boolean(
    normalized &&
      normalized !== '.' &&
      normalized !== '..' &&
      !normalized.includes('/') &&
      !normalized.includes('\\\\') &&
      !normalized.includes('\\0') &&
      !normalized.includes(':') &&
      !isAbsolute(normalized) &&
      !/^[a-zA-Z]:/.test(normalized),
  );
}

function normalizeSourceType(sourceType) {
  return typeof sourceType === 'string' && validSourceTypes.has(sourceType) ? sourceType : 'private';
}

function emptyModuleQuality() {
  return {
    totalModules: 0,
    installableModules: 0,
    nonInstallableModules: 0,
    modulesWithMenuActions: 0,
    modulesMissingMenuActions: 0,
    issues: [],
  };
}

function manifestIsInstallable(content) {
  return !/["']installable["']\\s*:\\s*(?:False|false)\\b/.test(content);
}

function menuXmlHasAction(content, moduleName) {
  const actionId = 'action_' + moduleName;
  return (
    content.includes('id="' + actionId + '"') &&
    content.includes('model="ir.actions.act_window"') &&
    content.includes('action="' + actionId + '"')
  );
}

async function readMenuXmlFiles(modulePath) {
  try {
    const entries = await readdir(join(modulePath, 'views'), { withFileTypes: true });
    return Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('_menus.xml'))
        .map((entry) => readFile(join(modulePath, 'views', entry.name), 'utf8')),
    );
  } catch {
    return [];
  }
}

async function analyzeModule(modulePath) {
  const moduleName = basename(modulePath);
  const moduleRelativePath = relative(target, modulePath);
  const issues = [];
  let installable = false;
  try {
    installable = manifestIsInstallable(await readFile(join(modulePath, '__manifest__.py'), 'utf8'));
  } catch {
    installable = false;
  }
  if (!installable) {
    issues.push({
      moduleName,
      path: moduleRelativePath,
      issue: 'installable is false in __manifest__.py',
    });
  }

  const menuXml = await readMenuXmlFiles(modulePath);
  const hasMenuAction = menuXml.some((content) => menuXmlHasAction(content, moduleName));
  if (!hasMenuAction) {
    issues.push({
      moduleName,
      path: moduleRelativePath,
      issue: 'missing actionable menu XML',
    });
  }

  return { installable, hasMenuAction, issues };
}

function addModuleQuality(summary, result) {
  return {
    totalModules: summary.totalModules + 1,
    installableModules: summary.installableModules + (result.installable ? 1 : 0),
    nonInstallableModules: summary.nonInstallableModules + (result.installable ? 0 : 1),
    modulesWithMenuActions: summary.modulesWithMenuActions + (result.hasMenuAction ? 1 : 0),
    modulesMissingMenuActions: summary.modulesMissingMenuActions + (result.hasMenuAction ? 0 : 1),
    issues: [...summary.issues, ...result.issues],
  };
}

function mergeModuleQuality(left, right) {
  return {
    totalModules: left.totalModules + right.totalModules,
    installableModules: left.installableModules + right.installableModules,
    nonInstallableModules: left.nonInstallableModules + right.nonInstallableModules,
    modulesWithMenuActions: left.modulesWithMenuActions + right.modulesWithMenuActions,
    modulesMissingMenuActions: left.modulesMissingMenuActions + right.modulesMissingMenuActions,
    issues: [...left.issues, ...right.issues],
  };
}

async function scanModuleQuality(root) {
  if (!(await isDirectory(root))) return emptyModuleQuality();
  const stack = [root];
  let summary = emptyModuleQuality();

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    let hasManifest = false;

    for (const entry of entries) {
      if (entry.isFile() && entry.name === '__manifest__.py') {
        hasManifest = true;
      } else if (entry.isDirectory()) {
        stack.push(join(current, entry.name));
      }
    }

    if (hasManifest) {
      summary = addModuleQuality(summary, await analyzeModule(current));
    }
  }

  return summary;
}

function parseEnvContent(content) {
  const values = new Map();
  for (const rawLine of content.split(/\\r?\\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

async function readEnvFile() {
  if (!(await exists(join(target, '.env')))) return undefined;
  return parseEnvContent(await readFile(join(target, '.env'), 'utf8'));
}

function selectedComposeEnvironment(env) {
  const envName = env?.get('WPMOO_ENV')?.trim();
  return envName || 'dev';
}

function isValidComposeEnvironmentName(value) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function isValidOdooVersion(value) {
  return /^\\d+\\.\\d+$/.test(value);
}

function compactOverlayError(envName, overlayFile) {
  if (envName === 'dev') return 'Missing compact compose overlay: ' + overlayFile;
  return 'Missing compact compose overlay for WPMOO_ENV=' + envName + ': ' + overlayFile;
}

async function detectComposeLayout(odooVersion) {
  const envName = selectedComposeEnvironment(await readEnvFile());
  if (!isValidComposeEnvironmentName(envName)) {
    return {
      files: [],
      missingFiles: [],
      errors: ['Invalid WPMOO_ENV in .env: expected a simple compose overlay name, got ' + envName],
    };
  }

  const compactBase = 'compose.yaml';
  const compactOverlay = 'compose/' + envName + '.yaml';
  const hasCompactBase = await exists(join(target, compactBase));
  const hasCompactOverlay = await exists(join(target, compactOverlay));

  if (hasCompactBase && hasCompactOverlay) {
    return { files: [compactBase, compactOverlay], missingFiles: [], errors: [] };
  }

  if (hasCompactBase || hasCompactOverlay) {
    const errors = [];
    const missingFiles = [];
    if (!hasCompactBase) {
      missingFiles.push(compactBase);
      errors.push('Missing compact compose base: ' + compactBase);
    }
    if (!hasCompactOverlay) {
      missingFiles.push(compactOverlay);
      errors.push(compactOverlayError(envName, compactOverlay));
    }
    return { files: [], missingFiles, errors };
  }

  if (!isValidOdooVersion(odooVersion)) {
    return {
      files: [],
      missingFiles: [],
      errors: ['Invalid Odoo version for compose file: ' + odooVersion],
    };
  }

  const legacyFile = 'docker-compose_' + odooVersion + '.yml';
  if (await exists(join(target, legacyFile))) {
    return { files: [legacyFile], missingFiles: [], errors: [] };
  }

  return {
    files: [],
    missingFiles: [legacyFile],
    errors: ['Missing compose file: ' + legacyFile],
  };
}

async function coreFileIssues(odooVersion) {
  const missing = [];
  for (const check of [
    { label: 'moo', path: 'moo' },
    { label: 'README.md', path: 'README.md' },
    { label: 'AGENTS.md', path: 'AGENTS.md' },
  ]) {
    if (!(await exists(join(target, check.path)))) missing.push(check.label);
  }
  if (!(await isDirectory(join(target, 'scripts')))) missing.push('scripts/');

  const composeLayout = await detectComposeLayout(odooVersion);
  missing.push(...composeLayout.missingFiles);
  return { missing, composeFiles: composeLayout.files, composeErrors: composeLayout.errors };
}

function summaryText(status) {
  if (status.kind === 'no_environment') return 'No WPMoo environment detected.';
  if (status.kind === 'invalid_metadata') return 'Environment metadata is invalid.';
  const needsAttention =
    status.missingCoreFiles.length > 0 ||
    status.invalidSourceRepoPaths.length > 0 ||
    status.composeErrors.length > 0;
  const prefix = needsAttention ? 'Environment needs attention' : 'Environment ready';
  return (
    prefix +
    ': Odoo ' +
    status.odooVersion +
    ', source repos ' +
    status.sourceRepoCount +
    ', module candidates ' +
    status.moduleCandidateCount +
    '.'
  );
}

function isHealthy(status) {
  return (
    status.kind === 'environment' &&
    status.missingCoreFiles.length === 0 &&
    status.invalidSourceRepoPaths.length === 0 &&
    status.composeErrors.length === 0
  );
}

function renderStatus(status) {
  const lines = ['Status: ' + summaryText(status)];
  if (status.kind === 'no_environment') {
    lines.push('Metadata: missing ' + status.metadataPath);
    lines.push('Next: ' + status.recommendedNextAction);
    return lines.join('\\n');
  }
  if (status.kind === 'invalid_metadata') {
    lines.push('Metadata: invalid ' + status.metadataPath);
    lines.push('Error: ' + status.metadataError);
    lines.push('Next: ' + status.recommendedNextAction);
    return lines.join('\\n');
  }
  lines.push('Metadata: ' + status.metadataPath);
  lines.push('Odoo: ' + status.odooVersion);
  lines.push('Compose files: ' + (status.composeFiles.length > 0 ? status.composeFiles.join(', ') : '(missing)'));
  if (status.composeErrors.length > 0) lines.push('Compose errors: ' + status.composeErrors.join(', '));
  lines.push('Source repos: ' + status.sourceRepoCount);
  lines.push('Source repo paths: ' + (status.sourceRepoPaths.length > 0 ? status.sourceRepoPaths.join(', ') : '(none configured)'));
  if (status.invalidSourceRepoPaths.length > 0) {
    lines.push('Invalid source repo paths: ' + status.invalidSourceRepoPaths.join(', '));
  }
  lines.push('Module candidates: ' + status.moduleCandidateCount);
  lines.push(
    'Module quality: ' +
      status.moduleQuality.installableModules +
      ' installable, ' +
      status.moduleQuality.nonInstallableModules +
      ' non-installable, ' +
      status.moduleQuality.modulesMissingMenuActions +
      ' missing menu actions.',
  );
  if (status.moduleQuality.issues.length > 0) {
    lines.push(
      'Module quality issues: ' +
        status.moduleQuality.issues.map((issue) => issue.path + ': ' + issue.issue).join('; '),
    );
  }
  lines.push('Missing core files: ' + (status.missingCoreFiles.length > 0 ? status.missingCoreFiles.join(', ') : '(none)'));
  lines.push('Next: ' + status.recommendedNextAction);
  return lines.join('\\n');
}

async function getStatus() {
  if (!(await exists(join(target, metadataPath)))) {
    return {
      kind: 'no_environment',
      target,
      metadataPath,
      recommendedNextAction: 'Run npx @wpmoo/toolkit create ...',
    };
  }

  let metadata;
  try {
    const parsed = JSON.parse(await readFile(join(target, metadataPath), 'utf8'));
    if (!isRecord(parsed)) throw new Error('metadata is not an object');
    metadata = parsed;
  } catch (error) {
    return {
      kind: 'invalid_metadata',
      target,
      metadataPath,
      metadataError: error instanceof Error ? error.message : String(error),
      recommendedNextAction: 'Fix .wpmoo/odoo.json or run ./moo reset from a valid environment.',
    };
  }

  const odooVersion =
    typeof metadata.odooVersion === 'string' && metadata.odooVersion.trim() ? metadata.odooVersion.trim() : '19.0';
  const sourceRepoPaths = [];
  const sourceRepoLocations = [];
  const invalidSourceRepoPaths = [];

  for (const repo of Array.isArray(metadata.sourceRepos) ? metadata.sourceRepos : []) {
    const path = isRecord(repo) && typeof repo.path === 'string' ? repo.path.trim() : '';
    if (!path) continue;
    if (!isValidPathSegment(path)) {
      invalidSourceRepoPaths.push(path);
      continue;
    }
    const sourceType = normalizeSourceType(isRecord(repo) ? repo.sourceType : undefined);
    sourceRepoPaths.push(path);
    sourceRepoLocations.push({ sourceType, path });
  }

  let moduleQuality = emptyModuleQuality();
  for (const repo of sourceRepoLocations) {
    moduleQuality = mergeModuleQuality(
      moduleQuality,
      await scanModuleQuality(join(target, 'odoo/custom/src', repo.sourceType, repo.path)),
    );
  }
  const moduleCandidateCount = moduleQuality.totalModules;

  const { missing, composeFiles, composeErrors } = await coreFileIssues(odooVersion);
  let recommendedNextAction = 'Run ./moo doctor for deep checks or ./moo start.';
  if (invalidSourceRepoPaths.length > 0) {
    recommendedNextAction = 'Fix invalid source repo paths in .wpmoo/odoo.json, then run ./moo doctor.';
  } else if (missing.length > 0) {
    recommendedNextAction = 'Run ./moo reset, then ./moo doctor.';
  } else if (composeErrors.length > 0) {
    recommendedNextAction = 'Fix compose layout errors, then run ./moo doctor.';
  } else if (sourceRepoPaths.length === 0) {
    recommendedNextAction = 'Run ./moo add-repo ...';
  }

  return {
    kind: 'environment',
    target,
    metadataPath,
    odooVersion,
    sourceRepoCount: sourceRepoPaths.length,
    sourceRepoPaths,
    invalidSourceRepoPaths,
    moduleCandidateCount,
    moduleQuality,
    composeFiles,
    composeErrors,
    missingCoreFiles: missing,
    recommendedNextAction,
  };
}

const status = await getStatus();
if (json) {
  console.log(JSON.stringify({ schemaVersion: 1, command: 'status', ok: isHealthy(status), status }, null, 2));
} else {
  console.log(renderStatus(status));
}
NODE
`;
}

export function renderAddonsYaml(options: CreateOptions): string {
  return `# Addons activated from source submodules.
#
# Source repos are managed as Git submodules under odoo/custom/src/private.
# Do not duplicate these same repos in repos.yaml.

${options.sourceRepos.map((repo) => `${sourceTypeOf(repo)}/${repo.path}:\n${yamlList(repo.addons)}`).join('\n\n')}
`;
}

export function renderReposYaml(options: CreateOptions): string {
  return `# git-aggregator repositories.
#
# Project source repositories are intentionally not listed here because
# they are pinned as Git submodules:
#
${options.sourceRepos.map((repo) => `# - ${sourceTypeOf(repo)}/${repo.path}`).join('\n')}
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

This folder owns the development environment only. Product source code lives
in source repository submodules under \`odoo/custom/src/private\`,
\`odoo/custom/src/oca\`, or \`odoo/custom/src/external\` when source
repositories are connected.

## Repository Layout

\`\`\`text
${repositoryLayout(options)}
\`\`\`

${cloneDocs(options)}

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

Use Odoo major-version branches in source repositories when you add them:

\`\`\`text
${options.odooVersion}
\`\`\`

If this environment is connected to Git, the dev repository can stay on \`main\`
and pin exact source commits through submodule references.
`;
}

export function renderAgents(options: CreateOptions): string {
  const repoList = hasSourceRepos(options)
    ? options.sourceRepos.map((repo) => `- \`${repo.path}\`: \`${repo.url}\``).join('\n')
    : '- No source repositories are configured yet.';
  const sourceLayout = hasSourceRepos(options)
    ? `Product repositories are Git submodules. They are listed under the private
source directory below for this environment:

\`\`\`text
${options.sourceRepos.map(sourceRepoRelativePath).join('\n')}
\`\`\`

${repoDuplicationNote()}`
    : 'No source repositories are configured yet. Use `./moo add-repo` or the cockpit Repositories menu before module-specific work.';
  const addonList = hasSourceRepos(options)
    ? options.sourceRepos
        .map((repo) => `\`${repo.path}\` addons:\n${repo.addons.map((addon) => `- \`${addon}\``).join('\n')}`)
        .join('\n\n')
    : 'No addon boundaries are known yet. Add source repositories before module-specific implementation.';

  return `# AGENTS.md

## Project

Private ${environmentKind()} development environment for the ${titleizeProduct(options.product)} product.

## Repository Roles

- \`${options.devRepo}\`: environment/config only, private.
${repoList}

## Source Layout

${sourceLayout}
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
./moo snapshot [--list] [db] [snapshot-name]
./moo restore-snapshot [--dry-run] <snapshot-name> [db]
./moo pot <module[,module]> [db] [output]
\`\`\`

Daily script delegation vs package fallback:
- \`./moo start\`, \`logs\`, \`install\`, \`update\`, \`test\`, \`snapshot\`, and related runtime tasks delegate to local \`./scripts/*.sh\`.
- \`./moo status\` runs local offline metadata checks through \`./scripts/status.sh\`.
- \`./moo doctor\` runs local checks first and uses package fallback for advanced usage, routed via \`npx --yes ${fallbackPackageSpec()} doctor\`.

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
