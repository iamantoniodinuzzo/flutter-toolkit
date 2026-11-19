# 0001 — sentry-init keeps `dart_defines.json` as its default DSN source

## Status

Accepted (wayfinder ticket #51, map #47)

## Context

`skills/sentry-init/` reads the Sentry DSN from one of three possible sources (Phase 0.5), tried in
priority order: a shared `dart_defines.json`, a `--dart-define` embedded in `.vscode/launch.json` or a
`Makefile`, or a `.env` file read at runtime. `dart_defines.json` is the default when nothing is
detected in a target project.

While refreshing this skill against Andrea Bizzotto's *Flutter in Production* course, the course was
found to teach a different convention: one gitignored `.env` file per flavor (`.env.dev`, `.env.stg`,
`.env.prod`), read via `flutter run --dart-define-from-file .env.dev`, exposed through a small `Env`
class. Both conventions use the same underlying Flutter CLI mechanism (`--dart-define-from-file`,
official since Flutter 3.7) — the actual difference is file count and naming: one shared JSON file vs.
three per-flavor `.env` files.

It initially looked like `dart_defines.json` might have been an untested, ad-hoc invention specific to
this skill, since no other skill in this toolkit references it and `flutter-flavors` explicitly disowns
`.env`-per-flavor scaffolding (SKILL.md:381-383). Checking `skills/sentry-init/references/*.md`
disproved that: every reference file carries `> Adapted from Engage-srl/pollicino_viewer —
apps/tomcat_portal/ai_docs/sentry/<file>.md`, and the shipping commit (`3e15ba0`) describes the set as
"battle-tested integration." `dart_defines.json` is prior art from a real shipped project, not a guess —
it just happens to have no *other* toolkit skill relying on it yet.

## Decision

Keep `dart_defines.json` as `sentry-init`'s default DSN source. Document `.env`-per-flavor as a
supported alternative that the skill detects and adapts to when a target project already has it, rather
than promoting it as the new default.

Ownership stays soft detect-and-adapt: no new hard prerequisite gate (unlike the existing `go_router`
gate). When neither convention exists in the target project, `sentry-init` scaffolds `dart_defines.json`
— no other toolkit skill will ever create this plumbing, so the alternative is that it never gets
scaffolded at all.

In delta-mode (re-running against a project that already picked one convention), the skill leaves it
untouched and reports it as found — it never offers to migrate between conventions.

## Consequences

- A course-driven contributor expecting `.env`-per-flavor to become the default will be surprised; the
  skill's Phase 0.5 must say why in-line (this ADR's rationale), not just assert the priority order.
- `sentry-init` remains the sole **owner** of DSN-source scaffolding in this toolkit. If a future skill
  (e.g. a dedicated env-var/secrets skill) takes over `.env`-per-flavor scaffolding project-wide, this
  decision should be revisited — the boundary note in `flutter-flavors/SKILL.md:381-383` would also need
  updating at that point.
- No migration path between conventions is ever offered by the skill. A project that wants to switch
  does so manually.

**Amendment (`docs/adr/0010-force-update-remote-source-default.md`)**: `skills/force-update-init/` is a
second **consumer** of `dart_defines.json` for its `APP_STORE_ID` key — not a second owner. It follows the
same priority order (`dart_defines.json` → `launch.json`/`Makefile` → `.env`) and the same detect-and-adapt
rule (never migrates an existing `.env`-per-flavor project to `dart_defines.json`). If `sentry-init` has
already scaffolded `dart_defines.json` in the target project, `force-update-init` adds its key to that file
rather than creating a second one. "Sole owner" above means sole *scaffolder-from-nothing*; it does not mean
sole reader.
