export function renderHelp(): string {
  return `@wpmoo/create-odoo-dev

Create a Doodba-ready Odoo development environment overlay.

Usage:
  npx @wpmoo/create-odoo-dev
  npx @wpmoo/create-odoo-dev --product <slug> --source-repo-url <url> --source-addons <addons>

Options:
  --product <slug>             Product slug, for example moo_olympiad.
  --odoo-version <branch>      Odoo branch to pin submodules to. Default: 19.0.
  --dev-repo-url <url>         Development environment repository URL for docs.
  --target <path>              Target dev repo directory. Default: current directory.
  --source-repo-url <url>      Source module repo URL. Repeat for multiple repos.
  --source-path <path>         Optional local folder for the preceding source repo.
  --source-addons <list>       Comma-separated addons for the preceding source repo.
  --init-empty-repos           Initialize empty source repos with the selected branch.
  --dry-run                    Print planned files and commands without writing.
  --stage=false                Do not run git add .
  --help, -h                   Show this help.

Example:
  npx @wpmoo/create-odoo-dev \\
    --product moo_olympiad \\
    --odoo-version 19.0 \\
    --dev-repo-url https://github.com/cangir/moo_olympiad_dev.git \\
    --source-repo-url https://github.com/wpmoo-org/moo_olympiad.git \\
    --source-addons moo_olympiad,moo_olympiad_portal,moo_olympiad_demo
`;
}
