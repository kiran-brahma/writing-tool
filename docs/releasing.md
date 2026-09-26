# Releasing

Obelus is versioned with [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and released from
`main`. While the version is below 1.0.0, a minor bump marks new behaviour or a schema migration, and
a patch bump marks fixes only.

## As you work

Add a line under `## [Unreleased]` in `CHANGELOG.md` for every change a Writer would notice, in the
section that fits: Added, Changed, Deprecated, Removed, Fixed or Security. Internal refactors and
docs-only changes need no entry.

## Cutting a release

1. Pick the version from what sits under Unreleased.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh empty
   `## [Unreleased]` above it, and update the compare links at the bottom.
3. Set `"version"` in `package.json` to `X.Y.Z`.
4. Run `pnpm run build` and `pnpm test`. Both must pass.
5. Commit as `release: vX.Y.Z` and tag it: `git tag -a vX.Y.Z -m "Obelus vX.Y.Z"`.
6. Push the commit and the tag: `git push origin main --follow-tags`.
7. Deploy with `pnpm run deploy`, then open the deployed site and check the release's changes there.
8. Optionally publish GitHub release notes from the changelog section:
   `gh release create vX.Y.Z --notes-file <(sed -n '/## \[X.Y.Z\]/,/## \[/p' CHANGELOG.md | sed '$d')`.

A release that carries a Dexie schema change follows `docs/migrations.md`: the migration ships in its
own release, never together with a behaviour change.
