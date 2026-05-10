export function renderHelp(): string {
  return `@wpmoo/odoo-dev

Create a Doodba-ready Odoo development environment overlay.

Usage:
  npx @wpmoo/odoo-dev
  npx @wpmoo/odoo-dev create --product <slug> --dev-repo-url <url> --source-repo-url <url>
  npx @wpmoo/odoo-dev add-repo --repo-url <url>
  npx @wpmoo/odoo-dev remove-repo --repo <name>
  npx @wpmoo/odoo-dev add-module --repo <source-repo> --module <module-name>
  npx @wpmoo/odoo-dev remove-module --repo <source-repo> --module <module-name>
  npx @wpmoo/odoo-dev reset

Options:
  --product <slug>             Product slug, for example my_odoo_module.
  --odoo-version <branch>      Odoo branch to pin submodules to. Default: 19.0.
  --dev-repo-url <url>         Development environment repository URL for docs.
  --target <path>              Target dev repo directory. Default: ./<product>_dev.
  --repo-url <url>             Source repo URL for add-repo.
  --repo <name>                Source repo folder name for repo/module actions.
  --module <name>              Odoo module technical name for module actions.
  --delete-files               Also delete module files in remove-module. Default: false.
  --source-repo-url <url>      Source repo URL. Repeat for multiple repos.
  --source-path <path>         Advanced: local folder for the preceding source repo.
  --source-addons <list>       Advanced: comma-separated addons for the preceding source repo.
  --create-missing-repos       Create inaccessible GitHub repos with gh CLI.
  --repo-visibility <value>    Visibility for created repos: private or public. Default: private.
  --init-empty-repos           Initialize empty source repos with the selected branch.
  --dry-run                    Print planned files and commands without writing.
  --stage=false                Do not run git add .
  --version, -v                Show the package version.
  --help, -h                   Show this help.

Example:
  npx @wpmoo/odoo-dev create \\
    --product odoo_sample_module \\
    --odoo-version 19.0 \\
    --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \\
    --source-repo-url https://github.com/example-org/odoo_sample_module.git
`;
}
