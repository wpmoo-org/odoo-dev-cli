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

Current command standard:

- Use `npx @wpmoo/toolkit ...` for package/operator commands.
- Use generated environment `./moo ...` for local compose daily commands.
