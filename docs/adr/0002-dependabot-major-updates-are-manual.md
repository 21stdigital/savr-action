# Keep Dependabot major updates manual

Dependabot auto-merge stays limited to patch and minor dependency updates. Major updates can carry breaking changes even when CI is green, so they need human review before merge; open major Dependabot PRs are therefore expected and do not indicate a broken auto-merge rule.

To keep those manual PRs from piling up (one per package and per new version, most of them superseded before anyone reviews them), dev-dependency majors are grouped into a single `dev-dependencies-major` Dependabot PR. Grouping does not weaken this decision: a grouped PR reports its highest update type, so the auto-merge rule still skips it.

## Status

accepted
