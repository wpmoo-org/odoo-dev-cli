export function renderHelp(): string {
  return `@wpmoo/odoo

WPMoo Odoo lifecycle tooling.

Usage:
  npx @wpmoo/odoo
  npx @wpmoo/odoo create --product <slug> --dev-repo-url <url> --source-repo-url <url>
  npx @wpmoo/odoo add-repo --repo-url <url>
  npx @wpmoo/odoo remove-repo --repo <name>
  npx @wpmoo/odoo add-module --repo <source-repo> --module <module-name>
  npx @wpmoo/odoo remove-module --repo <source-repo> --module <module-name>
  npx @wpmoo/odoo reset
  npx @wpmoo/odoo logs [service]
  npx @wpmoo/odoo restart
  npx @wpmoo/odoo shell
  npx @wpmoo/odoo psql [db]
  npx @wpmoo/odoo install <module[,module]> [db]
  npx @wpmoo/odoo update <module[,module]> [db]
  npx @wpmoo/odoo test <module[,module]> [--db <db>] [--mode init|update] [--tags <tags>]

Options:
  --product <slug>             Product slug, for example my_odoo_module.
  --odoo-version <branch>      Odoo branch to pin submodules to. Default: 19.0.
  --dev-repo-url <url>         Development environment repository URL for docs.
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

Example:
  npx @wpmoo/odoo create \\
    --product odoo_sample_module \\
    --odoo-version 19.0 \\
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
