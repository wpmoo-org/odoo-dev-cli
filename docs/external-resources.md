# External Resources

WPMoo does not embed large Docker Compose resources or Agent Skill text inside
the TypeScript CLI. The CLI copies standalone external resources from their own
repositories/packages into generated environments, while those resources can also
be used independently.

## Repositories/packages

```text
gh:wpmoo-org/odoo-docker-compose
npm:@wpmoo/odoo-skills
gh:wpmoo-org/odoo-skills
```

## Compose resource

`wpmoo-org/odoo-docker-compose` now exposes a compact generated-environment payload
under `resources/generated-env/`:

```text
compose.yaml
compose/dev.yaml
compose/stage.yaml
compose/prod.yaml
config/odoo/odoo.conf
resources/odoo/entrypoint.sh
```

`@wpmoo/toolkit` prefers that compact payload first when copying compose assets.
For pinned older refs that do not provide `resources/generated-env/`, the CLI
falls back to the legacy repository-root layout (`docker-compose_<version>.yml`
and related files) for compatibility.

Standalone usage with the compact payload:

```bash
git clone https://github.com/wpmoo-org/odoo-docker-compose
cd odoo-docker-compose
mkdir -p ../my_product_dev
cp -R resources/generated-env/. ../my_product_dev/
cp .env.example ../my_product_dev/.env
cd ../my_product_dev
./scripts/up.sh
```

WPMoo CLI usage with the default remote source:

```bash
npx @wpmoo/toolkit create \
  --engine compose \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git
```

During resource development, use a local clone:

```bash
git clone https://github.com/wpmoo-org/odoo-docker-compose ../odoo-docker-compose

npx @wpmoo/toolkit create \
  --engine compose \
  --compose-template-url ../odoo-docker-compose \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git
```

## Agent Skills resource

`@wpmoo/odoo-skills` is generic and intentionally not project-specific:

```text
skills/odoo-oca/SKILL.md
skills/odoo-open-core/SKILL.md
skills/odoo-porting/SKILL.md
```

Standalone Pi package usage:

```bash
pi install npm:@wpmoo/odoo-skills
```

Standalone npx project-local install:

```bash
npx @wpmoo/odoo-skills --target /path/to/project
```

WPMoo CLI can also copy those skills into generated environments from the default
remote source:

```bash
npx @wpmoo/toolkit create \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git \
  --agent-skills-template
```

During skill development, use a local clone:

```bash
git clone https://github.com/wpmoo-org/odoo-skills ../odoo-skills

npx @wpmoo/toolkit create \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git \
  --agent-skills-template \
  --agent-skills-template-url ../odoo-skills
```

Generated project-local skills are placed under:

```text
.agents/skills/
```

Project or module-specific guidance should live in that project/module's own
`AGENTS.md` or custom skill files.

## References and pins

Remote Git sources can be pinned with refs:

```bash
npx @wpmoo/toolkit create \
  --engine compose \
  --compose-template-ref v0.1.0 \
  --agent-skills-template \
  --agent-skills-template-ref v0.1.0 \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git
```

The CLI supports local directories and Git-style resource sources such as
`gh:owner/repo`, HTTPS Git URLs, and SSH Git URLs.
