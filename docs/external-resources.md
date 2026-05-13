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

`wpmoo-org/odoo-docker-compose` uses static version-specific files:

```text
docker-compose_17.0.yml
docker-compose_18.0.yml
docker-compose_19.0.yml
```

Standalone usage:

```bash
git clone https://github.com/wpmoo-org/odoo-docker-compose
cd odoo-docker-compose
cp .env.example .env
docker compose -f docker-compose_19.0.yml up -d
```

WPMoo CLI usage with the default remote source:

```bash
npx @wpmoo/odoo-dev create \
  --engine compose \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git
```

During resource development, use a local clone:

```bash
git clone https://github.com/wpmoo-org/odoo-docker-compose ../odoo-docker-compose

npx @wpmoo/odoo-dev create \
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
npx @wpmoo/odoo-dev create \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git \
  --agent-skills-template
```

During skill development, use a local clone:

```bash
git clone https://github.com/wpmoo-org/odoo-skills ../odoo-skills

npx @wpmoo/odoo-dev create \
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
npx @wpmoo/odoo-dev create \
  --engine compose \
  --compose-template-ref v0.1.0 \
  --agent-skills-template \
  --agent-skills-template-ref v0.1.0 \
  --product my_product \
  --source-repo-url https://github.com/example-org/my_product.git
```

The CLI supports local directories and Git-style resource sources such as
`gh:owner/repo`, HTTPS Git URLs, and SSH Git URLs.
