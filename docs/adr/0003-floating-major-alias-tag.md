# Consumers reference SAVR by a floating major alias tag

The documented usage has always been `21stdigital/savr-action@v2`, but only exact version tags (`v2.1.0`, `v2.0.0`, …) were ever pushed, so that reference never resolved. We close the gap by publishing `v2` as a floating alias tag rather than by rewriting the docs to an exact version: a moving alias also repairs the workflows consumers have already copied, which a documentation change cannot. `.github/workflows/publish-major-alias.yml` moves the alias to the release commit whenever a `vX.Y.Z` release is published.

## Status

accepted

## Considered options

- **Exact version pins in the docs** (`@v2.1.0`) — rejected. It leaves every already-copied `@v2` broken, and it pushes each patch release onto consumers as a pull request, which is a poor look for a tool whose only job is releases.
- **SHA pins as the advertised default** — rejected as the default, kept as a documented hardening option in the README. It is the strictest choice, but recommending it as the only path ignores that `@vX` is the ecosystem convention consumers expect.
- **Making SAVR itself move the alias** — rejected. SAVR runs on `push` and only drafts; the tag does not exist until a human publishes the draft, so the action is structurally blind to the moment the alias must move. Teaching it to push tags would mean a second trigger and a wider permission surface — a separate product decision, not a side effect of this fix.

## Consequences

- **A floating alias can change action code under a green pipeline.** A consumer pinned to `@v2` runs whatever we last published; a release that passes our CI and breaks theirs reaches them without a pull request. That is the price of the convenience, and it is deliberate. The README documents SHA pinning for consumers who will not pay it — which is also the standard this repo holds itself to internally for third-party actions.
- **`v2` can never be deleted.** Once consumers pin it, removing or repointing it downward breaks their pipelines.
- **The alias is a lightweight tag with no GitHub Release attached** and never appears in the releases list. A tag without a release is intentional here.
- **Only the current major gets an alias.** No `v1` (an alias on an unmaintained major promises maintenance we do not provide — v1 users should see exact tags and migrate) and no minor aliases like `v2.1`.
- **SAVR's own version detection is unaffected.** `getLatestVersion` filters tags through `semver.valid`, and `valid('2')` is `null`, so the alias is ignored when the next version is calculated.
