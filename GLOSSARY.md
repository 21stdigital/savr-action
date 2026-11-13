# SAVR

SAVR (Semantic Automatic Version Releaser) keeps a draft GitHub Release up to date from Conventional Commits, so a team can see what the next release contains and publish it by hand when ready.

## Language

**Version Tag**:
A git tag naming one immutable point in the version history, e.g. `v2.1.0`. It never moves.
_Avoid_: release tag, semver tag

**Alias Tag**:
A git tag that points at whichever Version Tag is currently newest within a major line, e.g. `v2`. It moves, is lightweight, and carries no Release.
_Avoid_: floating tag, moving tag, major tag, rolling tag

**Draft Release**:
An unpublished GitHub Release that SAVR maintains for the next version. It has no Version Tag yet — GitHub creates that when a human publishes it.
_Avoid_: pending release, pre-release (a pre-release is a published release, which a Draft Release is not)

**Release Reference**:
The `owner/repo@ref` string a consuming workflow uses to call SAVR. It resolves to an Alias Tag, a Version Tag, or a commit SHA.
_Avoid_: version pin, action version

**Breaking Change**:
A commit that declares it breaks compatibility, by a `!` after its type or a `BREAKING CHANGE:` footer. It is always listed as breaking in the release notes, but does not always cause a major Version Bump.
_Avoid_: major change

**Version Bump**:
Which part of the version — major, minor or patch — the next Draft Release increments over the latest Version Tag. It follows from the commits since that tag and from whether the project is in Initial Development.
_Avoid_: release type, increment

**Initial Development**:
The phase in which the latest Version Tag's major version is `0` (`0.y.z`), the name semver itself gives it. A project can choose to have a Breaking Change bump minor instead of major here; it leaves the phase only when a human publishes `1.0.0` deliberately.
_Avoid_: pre-major, pre-1.0, unstable
