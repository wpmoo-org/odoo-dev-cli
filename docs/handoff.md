# Historical Handoff Notes

This file is an archive pointer for pre-0.8.37 handoff notes. Those notes
included a stale direct publish attempt and must not be used as current release
guidance.

Current release path:

```bash
npm run release:check
npm run typecheck
npm test
npm run build
VERSION="$(node -p "require('./package.json').version")"
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"
```

If `npm run release:check` bumps `package.json` and `package-lock.json`, commit
and push that version bump first, then rerun the release check before tagging.

Publishing is handled by the `Publish` GitHub Actions workflow through npm
Trusted Publishing after the tag is pushed. Do not run `npm publish` manually
unless a coordinator explicitly requests a fallback.

Required release artifacts:

- `@wpmoo/toolkit`
- `@wpmoo/odoo`
- `@wpmoo/odoo-dev`

The optional `wpmoo` short alias is warning-only. If npm returns `E404` or
otherwise rejects that alias, the release remains valid when the required
scoped packages publish and verify correctly.

Verify a tagged release with:

```bash
npm view "@wpmoo/toolkit@$VERSION" version
npm view "@wpmoo/odoo@$VERSION" version
npm view "@wpmoo/odoo-dev@$VERSION" version
```

`npm view "wpmoo@$VERSION" version` is optional and may report that the short
alias is absent. A release is valid when all required scoped packages verify:

- `npm view "@wpmoo/toolkit@$VERSION" version`
- `npm view "@wpmoo/odoo@$VERSION" version`
- `npm view "@wpmoo/odoo-dev@$VERSION" version`

Optional short alias rule:

- `wpmoo` may be reported as missing or fail publish without invalidating the
  release candidate. Scoped packages are the supported release artifacts and
  are sufficient to mark the release valid.

Suggested smoke check:

```bash
npm run smoke:published -- "$VERSION"
```

Current command standard:

- Use `npx @wpmoo/toolkit ...` for package/operator commands.
- Use generated environment `./moo ...` for local compose daily commands.

1.0 readiness references:

- [Command Reference](command-reference.md)
- [Lifecycle Recipes](lifecycle-recipes.md)
- [Troubleshooting](troubleshooting.md)
- [1.0 Readiness](1-0-readiness.md)

Before a `1.0.0` tag, review the readiness gap list and decide whether the next
milestone is "ship 1.0" or "finish named gaps." Do not treat the gap list as an
open-ended cleanup queue.
