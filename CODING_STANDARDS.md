# Coding Standards

Judgement rules a reviewer checks and lint cannot. Rules the tooling already enforces (arrow functions, import order, `.js` import extensions) live in `eslint.config.js` and `CLAUDE.md` and are not repeated here.

## Domain language

- Name domain concepts with the terms in `GLOSSARY.md`: identifiers, log and warning messages, and test names. In prose (messages, test names, comments), write the term as the glossary spells it, e.g. "Initial Development", "Version Tag".
- Don't use a term the glossary lists under _Avoid_. When a concept has no glossary term yet, add one (`/domain-modeling`) instead of inventing a synonym in code.

## Borrowed public names

A public name copied from another tool keeps that tool's spelling, even when it contains an _Avoid_ term, so users who know the other tool recognise it. Don't rename it and don't flag it as drift. Identifiers that mirror the public name (e.g. `bumpMinorPreMajor` for the input) may keep it too; everything else about the concept uses the glossary term.

Each exception is listed here:

| Public name            | Kind         | Borrowed from  | Avoid term it contains                      |
| ---------------------- | ------------ | -------------- | ------------------------------------------- |
| `bump-minor-pre-major` | action input | release-please | "pre-major" (glossary: Initial Development) |
