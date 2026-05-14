import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');

describe('publish workflow', () => {
  it('uses npm trusted publishing with release verification gates', () => {
    expect(workflow).toContain('name: Publish');
    expect(workflow).toContain('workflow_dispatch:');
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
    expect(workflow).toContain('if [[ "${GITHUB_REF_TYPE}" == "tag" ]]');
    expect(workflow).toContain('expected_tag="v$VERSION"');
    expect(workflow).toContain('GITHUB_REF_NAME');
    expect(workflow).toContain('npm view "@wpmoo/odoo@$VERSION" version');
    expect(workflow).toContain('npm publish --access public');
    expect(workflow).not.toContain('NODE_AUTH_TOKEN');
    expect(workflow).not.toContain('secrets.NPM_TOKEN');
  });
});
