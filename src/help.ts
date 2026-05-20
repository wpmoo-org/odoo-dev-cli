export function renderHelp(): string {
  return `@wpmoo/toolkit

WPMoo Toolkit for Odoo lifecycle workflows.

Usage:
  npx @wpmoo/toolkit
  npx wpmoo
  npx @wpmoo/toolkit create --product <slug> [--target <path>] --dev-repo-url <url> --source-repo-url <url>
  npx @wpmoo/toolkit status
  npx @wpmoo/toolkit status --json
  npx @wpmoo/toolkit add-repo --repo-url <url> [--source-type private|oca|external]
  npx @wpmoo/toolkit remove-repo --repo <name>
  npx @wpmoo/toolkit source list
  npx @wpmoo/toolkit source list --json
  npx @wpmoo/toolkit source sync
  npx @wpmoo/toolkit source sync --json
  npx @wpmoo/toolkit source add --repo-url <url> [--source-type private|oca|external]
  npx @wpmoo/toolkit source remove --repo <name> [--source-type private|oca|external]
  npx @wpmoo/toolkit add-module --repo <source-repo> --module <module-name> [--source-type <category>]
  npx @wpmoo/toolkit remove-module --repo <source-repo> --module <module-name> [--source-type <category>]
  npx @wpmoo/toolkit reset [--dry-run]
  npx @wpmoo/toolkit doctor [--fix] [--postgres]
  npx @wpmoo/toolkit doctor --json [--postgres]
  npx @wpmoo/toolkit start
  npx @wpmoo/toolkit stop
  npx @wpmoo/toolkit logs [service]
  npx @wpmoo/toolkit restart
  npx @wpmoo/toolkit shell
  npx @wpmoo/toolkit psql [db]
  npx @wpmoo/toolkit install <module[,module]> [db]
  npx @wpmoo/toolkit update <module[,module]> [db]
  npx @wpmoo/toolkit test <module[,module]> [--db <db>] [--mode auto|init|update] [--tags <tags>]
  npx @wpmoo/toolkit resetdb [db] [module[,module]]
  npx @wpmoo/toolkit snapshot [db] [snapshot-name]
  npx @wpmoo/toolkit restore-snapshot [--dry-run] <snapshot-name> [db]
  npx @wpmoo/toolkit lint
  npx @wpmoo/toolkit pot <module[,module]> [db] [output]

Options:
  --product <slug>             Product slug, for example my_odoo_module.
  --odoo-version <branch>      Odoo branch to pin submodules to. Default: 19.0.
  --dev-repo-url <url>         Optional development environment repository URL for docs.
  --target <path>              Target dev repo directory. Default: ./<product>_dev.
  --engine <value>             Environment engine: compose. Default: compose.
  --compose-template-url <url> Standalone compose resource source. Default: gh:wpmoo-org/odoo-docker-compose.
  --compose-template-ref <ref> Git ref for the compose resource.
  --agent-skills-template      Install project Agent Skills from a standalone skills resource.
  --agent-skills-template-url <url>
                               Agent Skills resource source. Default: gh:wpmoo-org/odoo-skills.
  --agent-skills-template-ref <ref>
                               Git ref for the Agent Skills resource.
  --postgres-version <value>   PostgreSQL image version written to compose .env.example.
  --http-port <port>           Host HTTP port written to .env.example.
  --gevent-port <port>         Host gevent/live chat port written to .env.example.
  --json                      Emit machine-readable JSON. Human-readable output remains the default.
  --repo-url <url>             Source repo URL for add-repo.
  --source-type <category>     Source repo category for add-repo/remove-repo/add-module/remove-module. One of private, oca, external. Default: private.
  --repo <name>                Source repo folder name for repo/module actions.
  --module <name>              Odoo module technical name for module actions.
                               Must be lower snake_case; use letters, numbers, and underscores only.
  --delete-files               Also delete module files in remove-module. Default: false.
  --odoo-version <branch>      Override the environment Odoo branch for add-repo/add-module.
  --source-repo-url <url>      Source repo URL. Repeat for multiple repos.
  --source-path <path>         Advanced: local folder for the preceding source repo.
  --source-addons <list>       Advanced: comma-separated addons for the preceding source repo.
  --create-missing-repos       Create inaccessible GitHub repos with gh CLI.
  --repo-visibility <value>    Visibility for created repos: private or public. Default: private.
  --init-empty-repos           Initialize empty source repos with the selected branch.
  --dry-run                    Print planned files and commands without writing.
  --postgres                   Include read-only PostgreSQL health/performance diagnostics in doctor.
  --stage=false                Do not run git add .
  --no-update-check            Skip the startup npm update check.
  --version, -v                Show the package version.
  --help, -h                   Show this help.

Package aliases:
  npx @wpmoo/toolkit is the official package path.
  npx wpmoo is the short alias.
  npx @wpmoo/odoo and npx @wpmoo/odoo-dev remain deprecated compatibility aliases.

Daily actions:
  Daily actions must be run from a generated environment root containing .wpmoo/odoo.json.
  They delegate to the fixed scripts copied from the compose resource under ./scripts.
  Generated environments also include ./moo for local compose commands such as ./moo start.
  Use ./moo or npx @wpmoo/toolkit with the same daily action arguments.

Cockpit:
  Run npx @wpmoo/toolkit inside a generated environment to open the cockpit.
  Use Command palette / to search slash commands across services, modules, database,
  diagnostics, repositories, and maintenance categories.
  Direct commands such as npx @wpmoo/toolkit status and npx @wpmoo/toolkit test remain available.

Wizard local-only path:
  Run npx @wpmoo/toolkit from a workspace directory to open the create wizard.
  Before setup starts, WPMoo checks Git, Docker, Docker Compose, and Docker Engine.
  If required tools are missing, WPMoo offers installer guidance before writing files.
  Choose any environment folder; the default is ./<product>_dev.
  Skip Git/GitHub connection to create a local-only environment.
  Add source repos later from the cockpit or with add-repo.

Status and doctor:
  status: fast and offline. Reads local environment metadata and files only.
  doctor: deeper health check. May check Docker CLI access and GitHub workflows.
  doctor --fix: applies safe file-level repairs. Runs doctor again after fixes.
  doctor --postgres: adds read-only PostgreSQL diagnostics such as database size,
    active connections, slow-query readiness, extension visibility, and settings.

Task recipes:
  Create environment:
    npx @wpmoo/toolkit
    npx @wpmoo/toolkit create --product <slug> --dev-repo-url <url> --source-repo-url <url>
  Create local-only environment:
    npx @wpmoo/toolkit
  Add source repo:
    npx @wpmoo/toolkit add-repo --repo-url <url> --source-type oca
  Inspect and sync source manifest:
    npx @wpmoo/toolkit source list
    npx @wpmoo/toolkit source sync
  Add module:
    npx @wpmoo/toolkit add-module --repo <source-repo> --module <module-name> --source-type private|oca|external
    Creates a minimal skeleton: __init__.py, __manifest__.py, models/<module>.py, models/__init__.py, security/ir.model.access.csv, and views/<module>_menus.xml.
    The menu XML adds a basic Odoo action and menu entry for the generated model.
    Module names must be lower snake_case; use letters, numbers, and underscores only.
  Remove module:
    npx @wpmoo/toolkit remove-module --repo <source-repo> --module <module-name> --source-type private|oca|external
  Add OCA module:
    npx @wpmoo/toolkit add-module --repo sale-workflow --module sale_order_line_no_discount --source-type oca
  Run tests:
    npx @wpmoo/toolkit test <module[,module]> [--db <db>] [--mode auto|init|update] [--tags <tags>]
  Safe reset and recover:
    npx @wpmoo/toolkit snapshot [db] [snapshot-name]
    npx @wpmoo/toolkit reset --dry-run
    npx @wpmoo/toolkit reset
    npx @wpmoo/toolkit restore-snapshot --dry-run <snapshot-name> [db]
    npx @wpmoo/toolkit restore-snapshot <snapshot-name> [db]
  Daily command checks:
    npx @wpmoo/toolkit status
    npx @wpmoo/toolkit doctor
    npx @wpmoo/toolkit doctor --fix
    npx @wpmoo/toolkit logs [service]
    npx @wpmoo/toolkit restart

Machine-readable JSON output:
  for automation and VS Code cockpit integration while keeping default human-readable output.
    npx @wpmoo/toolkit status --json
    npx @wpmoo/toolkit source list --json
    npx @wpmoo/toolkit source sync --json
    npx @wpmoo/toolkit doctor --json

Example:
  npx @wpmoo/toolkit create \\
    --product odoo_sample_module \\
    --odoo-version 19.0 \\
    --target ./custom_odoo_dev \\
    --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \\
    --source-repo-url https://github.com/example-org/odoo_sample_module.git

Compose resource example:
  npx @wpmoo/toolkit create \\
    --engine compose \\
    --product odoo_sample_module \\
    --source-repo-url https://github.com/example-org/odoo_sample_module.git \\
    --agent-skills-template
`;
}
