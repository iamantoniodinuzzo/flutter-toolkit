# dev-issue project profile

Read by the `dev-issue` skill. Facts are a cache: the repo wins. Update through an issue plan.

## Conventions

- layout: toolkit repo (no Flutter app): skills/<name>/, agents/, ai_docs/, docs/adr/, scripts/, tests/
- local gate: node scripts/validate-skills.js && node --test tests/**/*.test.js && node scripts/smoke-plugins.js
- analyze: none (Markdown + Node scripts); Flutter probes in %TEMP% use dart analyze
- format: none
- test: node --test tests/**/*.test.js; tests live in tests/<skill>/*.test.js, catalog checks in tests/skills/
- codegen: none
- i18n: none
- shared package: none; shared texts = byte-identical copies listed in scripts/validate-skills.js
- backend: scripts/*.js (node), scripts/bump-version.sh
- changelog: CHANGELOG.md, `## [Unreleased]` on feature branches; release adds `## [X.Y.Z]`
- pubspec.lock: none
- doc gates: AGENTS.md (validate + tests, no version bump in branch); ai_docs/CONTRIBUTING.md (source header on copied rule docs, README/ARCHITECTURE tables for new skills, shared references); ai_docs/GIT_WORKFLOW.md (commit scopes)
- sentry org: none

## Lessons

<!-- one line each: what went wrong or nearly did, what to do instead, and this project's issue number -->

- Compile every shared code snippet against the pinned package version before shipping it. (#111 in this project: the `AsyncErrorLogger` shipped by #52 did not analyze on Riverpod 3.5.0; `ProviderObserver` is a base class and `ProviderException` lives in `misc.dart`.)
- Run each acceptance-criterion command on the baseline before planning. (#111 in this project: AC2's grep matched the correct `WidgetRef ref` and could never go green.)
