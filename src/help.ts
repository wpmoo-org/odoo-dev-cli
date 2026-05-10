export function renderHelp(): string {
  return `@wpmoo/create-odoo-dev

Create a Doodba-ready Odoo development environment overlay.

Usage:
  npx @wpmoo/create-odoo-dev
  npx @wpmoo/create-odoo-dev --product <slug> --dev-repo-url <url> --source-repo-url <url>

Options:
  --product <slug>             Product slug, for example my_odoo_module.
  --odoo-version <branch>      Odoo branch to pin submodules to. Default: 19.0.
  --dev-repo-url <url>         Development environment repository URL for docs.
  --target <path>              Target dev repo directory. Default: ./<product>_dev.
  --source-repo-url <url>      Source module repo URL. Repeat for multiple repos.
  --source-path <path>         Advanced: local folder for the preceding source repo.
  --source-addons <list>       Advanced: comma-separated addons for the preceding source repo.
  --init-empty-repos           Initialize empty source repos with the selected branch.
  --dry-run                    Print planned files and commands without writing.
  --stage=false                Do not run git add .
  --help, -h                   Show this help.

Example:
  npx @wpmoo/create-odoo-dev \\
    --product odoo_sample_module \\
    --odoo-version 19.0 \\
    --dev-repo-url https://github.com/example-org/odoo_sample_module_dev.git \\
    --source-repo-url https://github.com/example-org/odoo_sample_module.git
`;
}
