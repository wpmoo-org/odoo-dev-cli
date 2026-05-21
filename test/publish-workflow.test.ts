import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');

describe('publish workflow', () => {
  it('uses npm trusted publishing with release verification gates', () => {
    const requiredPackageBlock = workflow.match(/package_specs=\([\s\S]*?\n\s*\)/)?.[0] ?? '';

    expect(workflow).toContain('name: Publish');
    expect(workflow).not.toContain('workflow_dispatch:');
    expect(workflow).toContain('tags:');
    expect(workflow).toContain("'v*'");
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('actions/setup-node@v6');
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain("registry-url: 'https://registry.npmjs.org'");
    expect(workflow).toContain('package-manager-cache: false');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('expected_tag="v$VERSION"');
    expect(workflow).toContain('if [[ "${GITHUB_REF_NAME}" != "$expected_tag" ]]');
    expect(workflow).toContain('node scripts/sync-alias-packages.mjs --check');
    expect(workflow).toContain('"@wpmoo/toolkit@$VERSION"');
    expect(requiredPackageBlock).not.toContain('"wpmoo@$VERSION"');
    expect(workflow).toContain('"@wpmoo/odoo@$VERSION"');
    expect(workflow).toContain('"@wpmoo/odoo-dev@$VERSION"');
    expect(workflow).toContain('Check optional short alias publish state');
    expect(workflow).toContain('Checking optional short alias artifact (best-effort):');
    expect(workflow).toContain('spec="wpmoo@$VERSION"');
    expect(workflow).toContain('keep scoped artifacts valid');
    expect(workflow).toContain('[optional]');
    expect(workflow).toContain('[required]');
    expect(workflow).toContain('already exists on npm; skipping publish');
    expect(workflow).toContain('npm publish --access public');
    expect(workflow).toContain('Publish @wpmoo/odoo alias to npm');
    expect(workflow).toContain('Publish @wpmoo/odoo-dev alias to npm');
    expect(workflow).toContain('Publish wpmoo short alias to npm');
    expect(workflow).toContain('::warning title=Optional wpmoo alias not published::');
    expect(workflow).not.toContain('continue-on-error: true');
    expect(workflow).toContain('npm publish --access public ./packages/wpmoo');
    expect(workflow).toContain('elif npm publish --access public ./packages/wpmoo; then');
    expect(workflow).toContain('npm publish --access public ./packages/odoo-compat');
    expect(workflow).toContain('npm publish --access public ./packages/odoo-dev-compat');
    expect(workflow).toContain('npm run smoke:published');
    expect(workflow).toContain('## Release Candidate Report');
    expect(workflow).toContain('### Required Scoped Artifacts (release-validating)');
    expect(workflow).toContain('@wpmoo/toolkit@$VERSION');
    expect(workflow).toContain('@wpmoo/odoo@$VERSION');
    expect(workflow).toContain('@wpmoo/odoo-dev@$VERSION');
    expect(workflow).toContain('### Optional Short Alias (best-effort)');
    expect(workflow).toContain('### Smoke Check Command');
    expect(workflow).toContain('if [[ -z "${GITHUB_STEP_SUMMARY:-}" ]]');
    expect(workflow).not.toContain('NODE_AUTH_TOKEN');
    expect(workflow).not.toContain('secrets.NPM_TOKEN');
  });
});
