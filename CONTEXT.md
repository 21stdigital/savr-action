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
