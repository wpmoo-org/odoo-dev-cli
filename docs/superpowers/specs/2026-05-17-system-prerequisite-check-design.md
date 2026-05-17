# System Prerequisite Check Design

## Goal

Before WPMoo starts creating an Odoo development environment, it should verify that the host has the system tools required for the generated environment workflow: Git and Docker Desktop/Docker Compose.

## User Experience

The check runs at the beginning of the create flow, after the startup banner and before product slug, environment folder, GitHub, Odoo version, or Agent Skills prompts.

If every tool is available, setup continues without adding another prompt.

If required tools are missing, WPMoo shows an Inquirer-style prerequisite note and asks:

- `Check again`

The page uses the normal Inquirer bottom help for exit guidance instead of a separate page title, item hint, or extra action line. `Exit setup` is not a select option. The prompt message is `If you have installed the prerequisites`, the bottom Inquirer help line stays `↑↓ navigate • ⏎ select • Ctrl+C exit`, and the action row is `Check again (Enter to re-check again)` with `Check again` emphasized in the WPMoo action color and the parenthetical rendered dim.

The note uses a small light-green `ok` status for available tools. It includes official Git and Docker Desktop download links inline on the missing tool rows, replacing the `Missing` status text because the `✕` symbol already communicates that the tool is unavailable. WPMoo does not run package-manager installer commands in this version. Links use an external-link marker (`↗`).

All product-facing copy is English.

## Detection

WPMoo checks:

- `git --version`
- `docker --version`
- `docker compose version`
- `docker info --format {{.ServerVersion}}`

Git is required for repository cloning/submodules. Docker CLI and Compose are required for generated runtime commands. A stopped Docker Desktop installation should be reported as Docker installed but not running.

For local manual QA, `WPMOO_TEST_MISSING_TOOLS=git,docker` can force missing-tool behavior without uninstalling tools.

## Platform Guidance

Show official download links instead of package-manager commands:

- Git: `https://git-scm.com/downloads`
- Node.js: `https://nodejs.org/en/download`
- Docker Desktop: `https://www.docker.com/products/docker-desktop/`

## Architecture

Create `src/system-prerequisites.ts` for detection and rendering. Keep command execution injectable so tests can simulate missing tools without touching the developer machine.

Integrate from `src/cli.ts` before interactive create prompts. Keep the non-interactive create command guarded before GitHub repository checks and scaffold writes.

## Testing

Add focused tests for detection/rendering and create-flow behavior:

- Missing prerequisites stop scaffold.
- Missing prerequisites appear before the product slug prompt.
- Exit path prints restart guidance.
- Check-again path reruns detection.
- All prerequisites present leaves existing create behavior unchanged.
- Forced missing tools environment variable works for local QA.
