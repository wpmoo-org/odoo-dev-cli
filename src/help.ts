export function renderHelp(): string {
  return `@wpmoo/odoo

WPMoo Odoo lifecycle tooling.

Usage:
  npx @wpmoo/odoo
  npx @wpmoo/odoo create --product <slug> [--target <path>] --dev-repo-url <url> --source-repo-url <url>
  npx @wpmoo/odoo status
  npx @wpmoo/odoo add-repo --repo-url <url> [--source-type private|oca|external]
  npx @wpmoo/odoo remove-repo --repo <name>
  npx @wpmoo/odoo source list
  npx @wpmoo/odoo source sync
  npx @wpmoo/odoo source add --repo-url <url> [--source-type private|oca|external]
  npx @wpmoo/odoo source remove --repo <name> [--source-type private|oca|external]
  npx @wpmoo/odoo add-module --repo <source-repo> --module <module-name>
  npx @wpmoo/odoo remove-module --repo <source-repo> --module <module-name>
  npx @wpmoo/odoo reset [--dry-run]
  npx @wpmoo/odoo doctor [--fix]
  npx @wpmoo/odoo start
  npx @wpmoo/odoo stop
  npx @wpmoo/odoo logs [service]
  npx @wpmoo/odoo restart
  npx @wpmoo/odoo shell
  npx @wpmoo/odoo psql [db]
  npx @wpmoo/odoo install <module[,module]> [db]
  npx @wpmoo/odoo update <module[,module]> [db]
  npx @wpmoo/odoo test <module[,module]> [--db <db>] [--mode init|update] [--tags <tags>]
  npx @wpmoo/odoo resetdb [db] [module[,module]]
  npx @wpmoo/odoo snapshot [db] [snapshot-name]
  npx @wpmoo/odoo restore-snapshot <snapshot-name> [db]
  npx @wpmoo/odoo lint
  npx @wpmoo/odoo pot <module[,module]> [db] [output]

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
  --repo-url <url>             Source repo URL for add-repo.
  --source-type <category>     Source repo category for add-repo/remove-repo. One of private, oca, external. Default: private.
  --repo <name>                Source repo folder name for repo/module actions.
  --module <name>              Odoo module technical name for module actions.
  --delete-files               Also delete module files in remove-module. Default: false.
  --odoo-version <branch>      Override the environment Odoo branch for add-repo/add-module.
  --source-repo-url <url>      Source repo URL. Repeat for multiple repos.
  --source-path <path>         Advanced: local folder for the preceding source repo.
  --source-addons <list>       Advanced: comma-separated addons for the preceding source repo.
  --create-missing-repos       Create inaccessible GitHub repos with gh CLI.
  --repo-visibility <value>    Visibility for created repos: private or public. Default: private.
  --init-empty-repos           Initialize empty source repos with the selected branch.
  --dry-run                    Print planned files and commands without writing.
  --stage=false                Do not run git add .
  --no-update-check            Skip the startup npm update check.
  --version, -v                Show the package version.
  --help, -h                   Show this help.

Daily actions:
  Daily actions must be run from a generated environment root containing .wpmoo/odoo.json.
  They delegate to the fixed scripts copied from the compose resource under ./scripts.
  Generated environments also include ./moo for local compose commands such as ./moo start.
  Use ./moo or npx @wpmoo/odoo with the same daily action arguments.

Cockpit:
  Run npx @wpmoo/odoo inside a generated environment to open the cockpit.
  Use Command palette / to search slash commands across services, modules, database,
  diagnostics, repositories, and maintenance categories.
  Direct commands such as npx @wpmoo/odoo status and npx @wpmoo/odoo test remain available.

Wizard local-only path:
  Run npx @wpmoo/odoo from a workspace directory to open the create wizard.
  Choose any environment folder; the default is ./<product>_dev.
  Skip Git/GitHub connection to create a local-only environment.
  Add source repos later from the cockpit or with add-repo.

Status and doctor:
  status: fast and offline. Reads local environment metadata and files only.
  doctor: deeper health check. May check Docker CLI access and GitHub workflows.
  doctor --fix: applies safe file-level repairs. Runs doctor again after fixes.

Task recipes:
  Create environment:
    npx @wpmoo/odoo
    npx @wpmoo/odoo create --product <slug> --dev-repo-url <url> --source-repo-url <url>
  Create local-only environment:
    npx @wpmoo/odoo
  Add source repo:
    npx @wpmoo/odoo add-repo --repo-url <url> --source-type oca
  Inspect and sync source manifest:
    npx @wpmoo/odoo source list
    npx @wpmoo/odoo source sync
  Add module:
    npx @wpmoo/odoo add-module --repo <source-repo> --module <module-name>
  Run tests:
    npx @wpmoo/odoo test <module[,module]> [--db <db>] [--mode init|update] [--tags <tags>]
  Safe reset and recover:
    npx @wpmoo/odoo snapshot [db] [snapshot-name]
    npx @wpmoo/odoo reset --dry-run
    npx @wpmoo/odoo reset
    npx @wpmoo/odoo restore-snapshot <snapshot-name> [db]
  Daily command checks:
    npx @wpmoo/odoo status
    npx @wpmoo/odoo doctor
    npx @wpmoo/odoo doctor --fix
    npx @wpmoo/odoo logs [service]
    npx @wpmoo/odoo restart

Example:
  npx @wpmoo/odoo create \\
    --product odoo_sample_module \\
    --odoo-version 19.0 \\
    --target ./custom_odoo_dev \\
    --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \\
    --source-repo-url https://github.com/example-org/odoo_sample_module.git

Compose resource example:
  npx @wpmoo/odoo create \\
    --engine compose \\
    --product odoo_sample_module \\
    --source-repo-url https://github.com/example-org/odoo_sample_module.git \\
    --agent-skills-template
`;
}
