# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2026-11-12

### Added

- `retro`: Q2 and Q3 now close with an action, and the report ends with a closing question about the work
  worth keeping. (#108, ADR 0013)
- `retro`: a mechanical constraint (numeric cap, fixed pattern, path) is proposed as a check, not a line
  of prose, and the `global agents.md` signal hands off to `tune-setup`. A new "Forma della proposta"
  section sets the shape of each proposal. (#110, ADR 0015)
- `retro`: ambiente proposals name a `guard` (PreToolUse hook) when the evidence is a command that failed
  or timed out for its shape; a missing fact stays a context `pointer`. (#105)
- `retro`: the tool-economy signal fires on a foreground shell command that timed out or whose background
  task is later stopped with `TaskStop`; the evidence line names the command and the duration. (#104)
- `retro`: the "attribuiti ad ambiente" line breaks the count down by the section that claimed each failed
  call, e.g. `2 (information access 1, navigation 1; vedi blocco Ambiente)`. (#100)
- `tune-setup`: audit a single surface with `--surface` (six values, `memory-index` explicit-only), plus
  criteria, a pointer check and a re-measure rule for pruning the memory index. (#109, ADR 0014)

### Fixed

- `retro`: the Codex parser reads the real rollout format (`exec` custom tool calls, `CommandExecution` and
  `FileChange` events) instead of reporting 0 errors, 0 repeats and 0 edits; the observed `cli_version`
  range grows to 0.167.0. (#88)
- `retro`: Q1–Q4 and Q6 are not applicable for any non-current transcript, whichever flag selects it
  (`--transcript` as well as `--session`), so an agent can no longer invent answers. (#99)
- `retro`: a content-mode `Grep` that returned lines is no longer counted as an empty search, which made the
  navigation signal fire on its own. (#103)
- `retro`: project wrapper scripts whose name contains the word test/analyze/format/lint/check count as
  automated checks, so they are not reported as "nessun check eseguito"; the #102 shapes are pinned by
  tests. (#107, #102)
- `retro`: Passo 0 shows the `--transcript`/`--session` forms and says that `diff:` reads git in the cwd
  recorded in the transcript, not the caller's. (#98)

### Changed

- `.serena/` is gitignored; Serena is no longer part of the project or its environment. (#86)

## [4.0.0] - 2026-11-12

### Changed

- **Breaking for existing installs:** repository and marketplace renamed `claude-flutter` →
  `flutter-toolkit`, so the project has one name everywhere. The plugin name and command prefix
  (`/flutter-toolkit:<skill>`, `$flutter-toolkit:<skill>`) are unchanged; the install ID becomes
  `flutter-toolkit@flutter-toolkit`. Updated manifests, README, `ai_docs/`, ADRs 0006 and 0009,
  the `retro` / `tune-setup` cross-repo issue destination and the smoke script. (#106)
- `scripts/validate-skills.js` now asserts that the Claude marketplace, Codex marketplace and plugin
  names are identical, so the two-name split cannot return unnoticed.

### Migration

Claude Code identifies a marketplace by its `name`, so existing installs must be re-added. Removing
a marketplace also deletes its plugins' data and options.

```bash
claude plugin uninstall flutter-toolkit@claude-flutter
claude plugin marketplace remove claude-flutter
claude plugin marketplace add iamantoniodinuzzo/flutter-toolkit
claude plugin install flutter-toolkit@flutter-toolkit
```

Codex: `codex plugin remove flutter-toolkit@claude-flutter`, `codex plugin marketplace remove
claude-flutter`, then `marketplace add` and `plugin add flutter-toolkit@flutter-toolkit`. In
`.claude/settings.json` rename the `extraKnownMarketplaces` and `enabledPlugins` keys. See the
README section "Migrating from `claude-flutter`".

## [3.13.0] - 2026-11-06

### Added

- `retro` Passo 0 `standardizzazione:` block: model-issued `Skill` calls with outcome and an
  `args identici` marker, and `repeated user instructions:`, the same instruction written in at
  least two distinct sessions of the same project directory. A repeat inside one session is
  reported separately as Q5 friction (`ripetute in sessione:`), never as slash-command proof.
- `retro` Q6 can now produce one standardization proposal (`(da Q6)`, structural level, inside the
  existing cap of 3), only with evidence: identical-args `Skill` calls or a pattern already in
  `MEMORY.md`. The `automation` category carries the insight-to-building-block routing map
  (slash command, skill, subagent, project config).
- ADR 0012 (amends ADR 0007), `standardize-lens.js`, nine tests and three behaviour-checklist rows.

### Changed

- `retro` reads up to ten previous transcripts of the same project directory for the first time
  (never other projects). Codex and projects without previous transcripts print `non valutato`,
  never zero. `--config-audit` output is unchanged.

## [3.12.0] - 2026-11-03

### Added

- `retro` v3: a per-branch session diff (`diff:` in Passo 0) anchored on the HEAD each branch had when
  the session started, with ATTRIBUITO / PARZIALE / NON ATTRIBUIBILE / NON RICAVABILE states and a
  ship handoff that flags unintegrated session work per branch.
- `retro` environment lens: an `Ambiente` block after Q6 with five transcript-derived signals
  (tool economy, navigation, automated checks, information access, global AGENTS.md size), a fifth
  `environment` tag, severity levels, a cap of 3 proposals and a declared landing repo for each.
  Reference files `environment-lens.md` and `writing-for-agents.md` (MIT attribution).
- `retro` tests: synthetic fixtures with real record shapes, a real-shape canary, a structural test
  for `SKILL.md` and a pre-release behaviour checklist.
- ADR 0011 (supersedes decision 1 of ADR 0006).

### Changed

- `session-evidence.js` counts tool calls by `tool_use` id and reports every `toolDenialKind` value
  seen, including transient ones such as `automode-unavailable`.
- `tune-setup` documents the event-versus-file boundary with `retro`.
- README and ARCHITECTURE describe retro v3 and carry an honest Codex best-effort caveat.

### Known issues

- The Codex transcript parser does not read the real rollout format (tracked in #88).

## [3.11.0] - 2026-10-09

### Added

- Native Codex plugin and marketplace distributing the 21 active skills from the shared catalog,
  with per-skill UI metadata and explicit-only invocation for `tune-setup`.
- Codex transcript adapter for `retro` and `tune-setup`: explicit session selection, tool-result
  pairing, repeated commands and edits, and warnings for stale, ambiguous or partial evidence.
- Configurable `second-opinion` helper supporting Gemini (default), Codex and Claude in isolated
  sessions with restricted tools, timeouts and no implicit provider fallback.
- Catalog validation, partial-dependency checks, simulated-provider tests, Windows/Linux CI and
  local plugin discovery smoke checks without paid model calls.

### Changed

- Skill instructions use native host tools, optional delegation and sequential fallbacks. Bundled
  resources resolve from installed skill directories; shared dependencies are declared explicitly.
- `retro` and `tune-setup` use authorized native memory when available and retain learnings in the
  report otherwise. Unavailable Claude metrics are disclosed for Codex.
- README documents plugin and individual-skill installation, dependency groups and release pinning.
  Release version synchronization now includes the Codex manifest.

### Fixed

- Quote plain skill descriptions so YAML punctuation does not invalidate discovery metadata.
- Feature audit scanners receive installed resource paths and layer-specific scan instructions,
  preserving presentation platform gating and incomplete-coverage reporting.
- Catalog validation identifies missing required skills, including `retro` for `tune-setup`.

`build-filter` remains archived; no deprecated workflow is re-enabled.

## [3.10.0] - 2026-10-04

### Added

- `skills/web-loader-init` — boot progress loader for Flutter web: patches `web/index.html` with an
  accessible overlay (logo + staged progress bar), writes `web/style.css` (light/dark, reduced-motion) and
  a custom `web/flutter_bootstrap.js` that removes the loader on `flutter-first-frame`. INIT when no loader
  exists, AUDIT when one does (new rule WEB-02) (ref #71).
- `skills/asset-preload-init` — fixes first-frame asset pop-in: inventories declared assets by consuming
  loader/cache, generates only the needed warm-up (SVG `loadBytes` with errors handled at creation,
  `precacheImage` for raster) and reports oversized/unused assets (report only). Adds ASSET-01..04 audit
  rules to `audit-presentation-layer` (ref #76).
- `skills/page-transitions-init` — adaptive `PageTransitionsTheme` generator (native transitions on
  installed Android/iOS, instant on web/desktop), wires it into every theme construction and optionally
  migrates a blanket `NoTransitionPage` router helper (ref #73).
- `audit-presentation-layer` — AUTOFILL-01..04 rule family for credential forms (`AutofillGroup`,
  `autofillHints`, save-on-success policy) with an `autofill.md` pattern doc (ref #70); ROUTER-03 flags a
  blanket `NoTransitionPage` helper, with go-router transition docs in `flutter-go-router` (ref #72).

### Fixed

- `retro` — `session-evidence` now selects the transcript by session id (`CLAUDE_CODE_SESSION_ID` /
  `--session`), flags stale mtime-based picks, and makes failed-tool evidence citable; adds regression
  tests (ref #74).
- `retro` — `session-evidence` falls back to a canonical-slug directory match when the derived transcript
  dir is missing (ref #69).
- Dropped stale "commands" from repo/package descriptions (`commands/` was removed in v3.0.0).

## [3.9.0] - 2026-08-29

### Added

- `skills/force-update-init` — bootstrap force update using
  [force_update_helper](https://pub.dev/packages/force_update_helper): installs deps, patches
  `AndroidManifest.xml` for `url_launcher`, wires `ForceUpdateWidget` into `MaterialApp.builder` or
  GoRouter, sets up a remote `required_version` source with detect-and-propose selection (GitHub Gist,
  Firebase Remote Config, or a scaffolded Dart Shelf backend), handles non-store distribution (Firebase
  App Distribution, TestFlight, enterprise/internal) via a subclassed `ForceUpdateClient` (the package's
  own class isn't sealed), and audits an existing setup against the two silent failure modes — a blank
  `APP_STORE_ID` (the widget awaits `storeUrl()` before `isAppUpdateRequired()`, so a blank ID
  short-circuits the whole check with no alert and no `onException`) and a missing Android `<queries>`
  intent. `APP_STORE_ID` delivery follows `docs/adr/0001`'s `dart_defines.json` convention as a second
  **consumer**, not a second owner — see `docs/adr/0010` for the full decision record (ref #67).

### Deprecated

- `skills/build-filter` — deactivated (`user-invocable: false`, `disable-model-invocation: true`), kept on
  disk rather than deleted: the `#41` mass-deletion failure mode and the guard scripts
  (`scripts/guarded-build.{sh,ps1}`) remain readable and usable standalone. Delisted from `README.md`,
  `ai_docs/ARCHITECTURE.md`, and `skills.sh.json`; the three live callers
  (`skills/scaffold-feature`, `agents/riverpod-reviewer`, `ai_docs/FLUTTER_RULES.md`) repointed to manual
  `dart run build_runner build --build-filter=...`, keeping the `#41` caveat intact (ref #68).

### Changed

- `docs/adr/0001-sentry-init-dsn-source-convention.md` — amended: `sentry-init` remains the sole
  *scaffolder-from-nothing* of `dart_defines.json`, not the sole reader; `force-update-init` is now a
  second consumer following the same three-tier priority order (ref #67).

## [3.8.0] - 2026-08-28

### Added

- `skills/tune-setup` — on-demand config & workflow audit, split from `retro` per ADR 0006:
  `CLAUDE.md`, `.claude/settings.json` (+`.local.json`), hook definitions, `agents/`, and
  skill-trigger-miss detection (skills offered in `skill_listing` but never invoked), each
  finding backed by a verifiable transcript or file event. Never runs automatically — on-demand
  only. Persistence cap of 5 proposals, independent from `retro`'s cap of 3 (ADR 0009).
- `skills/retro` — sixth self-audit question, "What worked well" (ADR 0007): names one concrete
  pattern from the session worth repeating, same "cite a specific artifact, no generic praise"
  standard as the existing five questions.
- `skills/retro/scripts/session-evidence.js` — opt-in `--config-audit` flag (ADR 0008) that
  appends skill-invocation counts, repeated hook-injection detection (same `hookName` + content
  >2x), `hook_cancelled` occurrences, and a three-way `toolDenialKind` breakdown, under its own
  `CONFIG_AUDIT_LINE_CAP` separate from `retro`'s `OUTPUT_LINE_CAP`. `retro`'s own Passo 0 call
  site never passes the flag — output without it is byte-for-byte unchanged. `tune-setup` always
  passes it. Both dispatcher scripts (`.sh`, `.ps1`) updated to forward the new flag.

### Changed

- `skills/retro/SKILL.md` — persistence table generalized per ADR 0009: the `CLAUDE.md`-only row
  becomes "config of the target project" (also covers `.claude/settings.json`, hooks, `agents/`);
  the "skill / hook spec" row becomes "automation spec" (also covers slash commands and
  subagents); a new row adds a cross-repo toolkit-issue destination
  (`gh issue create --repo iamantoniodinuzzo/claude-flutter`, always proposed, repo always
  explicit — never inferred from the target project's own `git remote`). The `automation` report
  category is reworded to explicitly absorb the two blog-sourced positive questions ADR 0006 had
  already decided not to duplicate as standalone questions (ref #66).

### Fixed

- `skills/retro/scripts/session-evidence.js` — slug computation now matches Claude Code's real
  per-character `[^a-zA-Z0-9]` replacement instead of a collapsing regex, so the script finds the
  actual transcript directory instead of silently reporting "no transcript found" (ref #45, #61).
- `skills/sentry-init` — closed ADR 0003/0004 verification gaps (`beforeSendFeedback` passthrough,
  the `SENTRY_DEBUG_REPORTING` dart-define smoke-test path) and added a profiling platform caveat
  (ref #47).

### Docs

- `docs/adr/0006`-`0009` — retro v2 skill shape (split vs. grow), question set, `tune-setup`'s
  config audit surface, and proposal routing/caps across the repo boundary, decided across map
  #57.

## [3.7.0] - 2026-08-27

### Added

- `skills/flutter-flavors` — initialize dev/stg/prod flavors (flutter_flavorizr with targeted
  processors, or manual fallback) across Android (`build.gradle.kts`, `AndroidManifest`), iOS
  (`xcconfig`, `xcscheme`, `Info.plist`), Web (`--dart-define WEB_FLAVOR` workaround), multiple entry
  points (`main_*.dart`), and IDE config (VSCode `launch.json`, Android Studio run configurations);
  optional multi-project Firebase (`flutterfire configure` per flavor). Detects project state first and
  branches into an INIT flow or an AUDIT+FIX flow against a bundled rule catalog for an existing
  partial/broken setup. Reference docs rewritten in the toolkit's own words from the same *Flutter in
  Production* knowledge base `sentry-init` draws on (ref #46).

### Changed

- `skills/sentry-init` — reconciled against Andrea Bizzotto's *Flutter in Production* error-monitoring
  module. `SKILL.md` and `references/*.md` rewritten; five architecture decisions recorded as
  `docs/adr/0001`–`0005`:
  - DSN/environment source stays `dart_defines.json` by default, `.env`-per-flavor detected as an
    alternative (ADR 0001); fixes the dead `options.environment` placeholder.
  - Error-capture architecture reframed around sink (LoggerService decorator or a scaffolded
    `ErrorLogger`) vs. channel (`ProviderObserver`) — Branch B now scaffolds `ErrorLogger` instead of a
    Sentry-only observer; `AsyncErrorLogger` rewritten to Riverpod v3's `providerDidFail` (ADR 0002).
  - `beforeSend` keeps a build-mode gate but fixes it: `kDebugMode` instead of `!kReleaseMode`,
    `beforeSendFeedback` passthrough, a `SENTRY_DEBUG_REPORTING` dart-define so the skill's own smoke
    test is runnable; the `DioException`-with-null-response filter moves from `beforeSend` to the
    call site (ADR 0003).
  - `sampleRate` stays unset with a documented escalation ladder instead of a standing default;
    `tracesSampleRate`/`profilesSampleRate` become opt-in with a corrected relative-rate table (ADR 0004).
  - `references/logger-decorator-pattern.md` renamed to `references/error-capture-architecture.md`; new
    `references/event-filtering-and-sampling.md` added; frontmatter `description` gained a "Use when…"
    trigger clause and fixed stale Branch B wording (ADR 0005).

### Fixed

- `README.md` and `ai_docs/ARCHITECTURE.md` skills-table rows for `sentry-init` — stale "decorator or
  standalone" wording corrected to match ADR 0002's scaffolded-`ErrorLogger` shape.

## [3.6.0] - 2026-08-15

### Added

- `skills.sh.json` — discoverability manifest for `npx skills add`, grouping skills into
  Architecture audits, Testing, and Scaffolding & tooling categories.
- `ai_docs/TROUBLESHOOTING.md` — new troubleshooting doc.

### Fixed

- `package.json` `name` — corrected from `flutter-claude-toolkit` to `flutter-toolkit`, matching
  the plugin id used everywhere else (marketplace, skills.sh) so multi-agent discovery resolves
  the package correctly.

### Changed

- `README.md` — trimmed for clarity as part of the skills.sh/multi-agent discoverability pass.

## [3.5.1] - 2026-08-14

### Added

- `skills/audit-domain-layer` — `DOMAIN-FAIL-02`: feature exception base must be `sealed`, not
  plain `abstract`, so presentation gets a compiler-checked exhaustive `switch` over every domain
  error state. New local pattern doc `rules/patterns/sealed-exceptions.md` explains why `sealed`
  (Dart 3) supersedes the Freezed-based approach from the source tip, and why per-feature unions
  beat one global exception union (ref #43).

### Fixed

- `skills/audit-domain-layer` — `DOMAIN-STR-01` false-flagged every correctly-written typed
  exception message; it now exempts `.hardcoded`-suffixed literals and `message:`/`code:` args
  inside an exception's `super(...)` call, matching the pattern the skill's own docs prescribe
  (ref #43).

## [3.5.0] - 2026-08-07

### Changed

- `skills/retro`: closes the self-improvement loop (inspired by r/ClaudeCode's "Self-improvement Loop" wrap-up skill thread, #42). Added `scripts/session-evidence.{sh,ps1}` (thin dispatchers to a shared `session-evidence.js`, since correctly pairing a `tool_result` back to the `tool_use` that produced it needs a real JSON parser — Node is a safe dependency here as Claude Code itself runs on it, unlike `jq`) which reads the current session transcript and extracts verifiable friction: tool calls that errored, repeated Bash commands, files edited more than twice. Q5 ("smoother session") must now cite this evidence instead of the model's own recollection, which is unreliable and actively fabricated once the session has been compacted. Learnings are auto-persisted to auto-memory with dedup/consolidation against `MEMORY.md` — no approval needed for that step specifically; writes to versioned files (`CLAUDE.md`, rules, new skills) still require explicit approval. Added a "ship handoff" check (`git status` + branch) that flags unintegrated work and routes to `git-workflow`/`issue-dev` rather than committing itself. Report now splits Applied/Proposed/No-action with categories (skill gap/friction/knowledge/automation). Deliberately out of scope: auto-commit and a "publish" phase — both already covered by existing skills.

### Fixed

- `skills/build-filter`: documented a silent mass-deletion failure mode where `--build-filter` (without `--delete-conflicting-outputs`) removed hundreds of unrelated `.g.dart` files without logging it, after many unrelated source edits had accumulated since the last full build (#41). Added `scripts/guarded-build.{sh,ps1}`, run in place of a bare `dart run build_runner build --build-filter=...`: snapshots `.g.dart` state before/after and reports (never auto-restores) any out-of-scope deletion, and pre-flight-escalates to a full unfiltered build when more than 10 `.dart` files have changed since the last build. Narrowed `ai_docs/FLUTTER_RULES.md`'s blanket "never run `--delete-conflicting-outputs`" to "never combine it with `--build-filter`" — it resolved a standing contradiction with `skills/flutter-melos-workspace` and `skills/sentry-init`, which both correctly use the flag on full builds.

## [3.4.0] - 2026-07-16

### Added

- `skills/retro` — generic end-of-task self-audit skill (5 hard questions: least confident, user's blind spot, 3-month failure risk, unstated assumptions, session friction), then persists learnings to auto-memory and proposes fixes. Ported from the author's personal global skills so it's available wherever `flutter-toolkit` is installed; deliberate exception to the plugin's Flutter/Dart scope (ref #39)

## [3.3.0] - 2026-07-07

### Added

- `skills/audit-presentation-layer` — 12 new rules: REBUILD-01..04 (const subtrees, scoped `MediaQuery` accessors, builder child caching, `setState` blast radius), EXTRACT-01/02 (oversized build methods, function widgets), COHESION-01 (Law of Demeter params), COUPLING-01/02 (data-layer and cross-feature imports), RESPONSIVE-02..04 (named breakpoints, flex rows, adaptive grids)
- `skills/audit-data-layer` — DATA-COUPLE-01/02 (upward and cross-feature imports), DATA-COHESION-01/02 (god repositories, mixed remote+local datasources)
- `skills/audit-domain-layer` — DOMAIN-COUPLE-01/02, DOMAIN-COHESION-01 (god entities); DOMAIN-DEP-01 now also bans `package:flutter` imports
- `skills/audit-application-layer` — APP-COUPLE-01..03 (datasource bypass, presentation imports, hard-wired repository construction), APP-COHESION-01 (god notifiers)
- New pattern docs grounding rules in HFDP (Observer, Strategy, Facade, Adapter, Command, SRP, Least Knowledge) and DDIA (storage encapsulation, source-of-truth vs derived data)

## [3.2.2] - 2026-07-02

### Added

- `README.md`, `ai_docs/ARCHITECTURE.md`, `ai_docs/CONTRIBUTING.md` — document `npx skills add/update` as an alternate, multi-agent install path (Cursor, Codex, Windsurf, etc.) alongside the Claude Code plugin marketplace; note that `skills/<name>/SKILL.md` already satisfies skills.sh's discovery contract.

### Fixed

- `skills/audit-presentation-layer`, `skills/maestro-screenshot-flow`, `skills/second-opinion` — quoted the `description` frontmatter field; an unquoted `": "` mid-string is invalid YAML plain-scalar syntax and was silently dropping these 3 skills from `npx skills add` discovery (verified via `npx skills add --list`).

## [3.2.1] - 2026-07-02

### Added

- `skills/audit-domain-layer`, `skills/audit-data-layer`, `skills/audit-application-layer` — per-layer audit skills, 4 rules each (#31, closes #33, #34, #35, #36)
- `skills/audit-feature` — orchestrator: 4 parallel Explore subagents, aggregated report, graceful degradation, presentation-only shortcut for sub-features (#31)
- `skills/build-filter` — watch mode, Melos `melos.yaml` auto-detect for working directory, `--define` builder-option overrides, `--workspace` support for shared `.dart_tool/` caching (#26)

### Fixed

- `skills/build-filter` — the `Conflicting outputs` manual recovery recipe now anchors `.g.dart` delete scope to the original argument's type (file vs directory), not to whether the derived output currently exists; a brand-new `.dart` file target is a no-op, never a directory-wide `find -delete` that would wipe sibling `.g.dart` files. (#38)

### Removed

- `skills/build-optimized-widget` — skill removed: depended on `ai_toolkit/commands/` and `ai_toolkit/patterns/` from the external `iamantoniodinuzzo/flutter_ai_toolkit` repo, which are not present in-tree; use-case covered by the "write naive widget → `/audit-presentation-layer`" loop. (#32)

### Changed

- `skills/bootstrap-feature` → `skills/scaffold-feature` — rename to better reflect actual responsibility (directory scaffold + Socratic intake + architecture contract); updated frontmatter `name`, all internal `references/` paths, README skill table row and Core methodology blurb, ARCHITECTURE.md Key skills table, Mermaid diagram node. Also removed the defunct "Dispatcher skills" section and orphaned `ai_toolkit` Mermaid node from ARCHITECTURE.md. (#32)
- `skills/maestro-screenshot-flow` — rebuilt around id-only selector doctrine (`Semantics(identifier:)` → `tapOn: id:`); `text:` selectors removed; `point:` demoted to documented last resort. Skill now edits target app source to add missing `Semantics(identifier:)` / `explicitChildNodes: true` wrappers.
  - SKILL.md rewritten as lean dispatcher; content split into `reference/` (selectors, commands, suite-config, troubleshooting, examples)
  - New `reference/selectors.md` — selector ladder, AccessibilityBridge mechanics, authoring workflow / decision tree, merged-semantics fixes, naming convention
  - New `reference/commands.md` — full Maestro command surface (gestures, assertions, input, control flow, lifecycle), all examples id-based
  - New `reference/suite-config.md` — `.maestro/` structure, `config.yaml`, master flow, `runFlow` variants, Firebase emulator reminder
  - New `reference/troubleshooting.md` — port 7001 fix, `clearState`, debug screenshot timing, `maestro hierarchy` usage
  - New `reference/examples.md` — complete login + registration flows with matching Flutter source Semantics edits; nav-rail merged-semantics pattern
  - New `scripts/maestro-audit-ids.sh` — finds interactive widgets missing `Semantics(identifier:)` in a feature path; prints appId, connected devices, emulator reminder
  - New `scripts/maestro-hierarchy.sh` — wraps `maestro hierarchy` with optional substring filter
  - New `scripts/fix-port-7001.ps1` — kills port-7001 owner, clears ADB forwards, restarts ADB server (Windows PowerShell)
- `README.md` — maestro-screenshot-flow row updated to mention id-based selectors
- `ai_docs/ARCHITECTURE.md` — added `maestro-screenshot-flow` row to Key skills table (was missing)

## [3.2.0] - 2026-06-20

### Added

- `scripts/bump-version.sh` — one-command version sync across all four locations (`package.json`, `plugin.json`, `marketplace.json` `source.ref`, README badge); fixes auto-update for marketplace consumers by ensuring `source.ref` is always bumped with the version
- `.github/workflows/validate-marketplace.yml` — CI workflow: asserts version parity across all four locations on every PR and push to `master`/`develop`; validates `plugin.json` and `marketplace.json` JSON structure
- `.github/workflows/release.yml` — CI workflow: creates a GitHub Release with the matching CHANGELOG section body on every `v*` tag push

### Changed

- `ai_docs/CONTRIBUTING.md` — version bump procedure now references `scripts/bump-version.sh`; documents why `marketplace.json` `source.ref` must be bumped for auto-update to work
- `ai_docs/GIT_WORKFLOW.md` — release lifecycle updated to use `scripts/bump-version.sh` and notes GitHub Actions creates the Release automatically
- `README.md` — release block updated; version badge fixed (`3.0.1` → `3.1.0`); added "How auto-update works" subsection
- `skills/build-filter/skill.md` → `SKILL.md` — renamed to match uppercase convention used by all other skills

## [3.1.0] - 2026-06-08

### Added

- `skills/sentry-init` — Sentry SDK bootstrap skill for Flutter+Riverpod+GoRouter: installs `sentry_flutter`, patches `main.dart`, wires GoRouter `SentryNavigatorObserver`, Riverpod error capture (decorator or standalone), web BetterFeedback, release-upload checklist; 5 reference docs bundled (#28)
- `.claude/agents/skill-reviewer` — internal subagent that reviews new/changed skills
- Marketplace-validation hook in `.claude/settings.json` (repo dev tooling)
- `skills/audit-presentation-layer/rules/patterns/responsive-layout.md` and `web-interaction-affordances.md` — new rule docs (#25)

### Changed

- `skills/audit-presentation-layer` — now platform-aware (auto-detect / `--platform` Android/iOS/web); CATALOG + SKILL updated, 2 new rule families (#25)
- `skills/flutter-go-router/SKILL.md` — added "Adding a SentryNavigatorObserver" section (observer goes on `GoRouter`, not `MaterialApp.router`)
- `README.md` — added troubleshooting section for plugin install issues; sentry-init table row; title/install fixes
- `ai_docs/ARCHITECTURE.md` — Key skills table + Mermaid node now include `sentry-init`; audit-presentation-layer description updated
- `ai_docs/GIT_WORKFLOW.md` — release/hotfix lifecycle + `git finish` flag docs
- `.gitignore` — track `.claude/agents/` and `.claude/settings.json`

## [3.0.1] - 2026-05-31

### Fixed

- `.claude-plugin/marketplace.json`: source type corrected from `url` to `github` with `repo` + `ref` fields; removed duplicate `version` field (plugin.json is authoritative per spec); aligned description with plugin.json; expanded tags to cover all 11 skills and 2 agents
- `.claude-plugin/plugin.json`: expanded `keywords` to match marketplace tags
- `ai_docs/GIT_WORKFLOW.md`: document all git aliases (`init-flow`, `st-flow`, `finish --y`)
- `CLAUDE.md`: remove redundant `# CLAUDE.md` heading

## [3.0.0] - 2026-05-27

### Removed

- `commands/` directory and all 6 command files (`git-commit-staged.md`, `git-flow-feature-finish.md`, `seed-context.md`, `seed-fix-refactor.md`, `seed-ui-context.md`, `update-logs.md`) — functionality superseded by the skill system (#22)
- `hooks/` directory (`hooks.json`, `session-start.sh`) — SessionStart hook no longer needed; session behaviours handled by the skill/config system (#23)
- `scripts/` directory (`bump-version.sh`, `context-monitor.py`, `dart-format-hook.sh`, `protect-sensitive-files.sh`, `validate-bash.sh`) — leftovers from pre-2.0.0 multi-tool support, no longer relevant (#24)
- `.version-bump.json` — no longer needed without `bump-version.sh` (#24)

### Breaking Changes

- Consumers referencing `flutter-toolkit:<command>` slash commands must switch to the equivalent skills (see README Skills table).
- Version bump is now a manual procedure documented in `ai_docs/CONTRIBUTING.md`; the `./scripts/bump-version.sh` script is gone.

## [2.0.0] - 2026-05-24

### Added

- `ai_docs/ARCHITECTURE.md` — repo structure, Mermaid flowchart (modules + interaction with target project's `ai_toolkit/`), skill dispatcher-vs-self-contained patterns
- `ai_docs/FLUTTER_RULES.md` — Riverpod v3 rules, GoRouter web rules, logging format, testing conventions, codegen/analyze scoping
- `ai_docs/GIT_WORKFLOW.md` — git aliases (start/publish/c/finish), PR/issue workflow, gotchas
- `ai_docs/CONTRIBUTING.md` — adding new skills, version bump procedure, Conventional Commits scopes, upstream rule docs, Windows/Python gotcha

### Changed

- `CLAUDE.md` — slimmed to a 10-line pointer file; all content extracted to `ai_docs/` (loaded on demand, not injected every session)
- `README.md` — Claude-only; dropped Gemini CLI / OpenCode badges and install sections; updated skill/command names
- `package.json` — dropped `gemini-cli` keyword; Claude-only description
- `scripts/bump-version.sh` — no longer updates `gemini-extension.json`
- `.version-bump.json` — removed `gemini-extension.json` from tracked files
- `skills/second-opinion/SKILL.md` — added prerequisite note: this skill intentionally retains a Gemini CLI runtime dependency
- `skills/bootstrap-feature/references/patterns/repository-pattern.md` — replaced "Cursor AI" with "AI assistants"

### Removed

- Gemini CLI support: `GEMINI.md`, `gemini-extension.json`, `references/gemini-tools.md` in `build-filter`, `generate-widget-tests`, `unit-test`
- Cursor support: `.cursor-plugin/`
- OpenCode / generic agent support: `AGENTS.md`

### Breaking Changes

Commands renamed (drop `-claude` suffix):
- `seed-context-claude` → `seed-context`
- `seed-ui-context-claude` → `seed-ui-context`
- `seed-fix-refactor-claude` → `seed-fix-refactor`
- `git-commit-staged-claude` → `git-commit-staged`
- `update-logs-claude` → `update-logs`

Skill renamed:
- `unit-test-claude` → `unit-test`

## [1.1.0] - 2026-05-19

### Added

- `skills/audit-presentation-layer` — rules-based static audit skill for Flutter presentation layers; scans widgets and widget tests against 14 bundled rules across 5 families (Riverpod v3 widget patterns, Robot Testing, GoRouter conventions, layout antipatterns, side-effect handling); emits violations table with file:line references and optional targeted fix mode; rule docs copied from `iamantoniodinuzzo/flutter_ai_toolkit@bac1f74` (#18)

## [1.0.2] - 2026-05-16

### Fixed

- `skills/github-issue-create`: correct label map to use real repo labels (`enhancement`, `bug`, `documentation`); add prerequisite check for template availability on default branch; document sequential-only issue creation
- `skills/github-issue-create`: move SKILL.md to `.claude/skills/` canonical location
- `settings.local.json`: add `Skill(github-issue-create)` to allowlist

## [1.0.1] - 2026-05-16

### Fixed

- `.claude-plugin/marketplace.json`: renamed plugin `superpowers` → `flutter-toolkit` to avoid collision with official Superpowers plugin and fix strict-mode name mismatch that caused "empty" on install
- `.claude-plugin/plugin.json`: aligned `name` to `flutter-toolkit`, removed non-standard `capabilities` and `entrypoints` fields, converted `author` to object per spec
- `.version-bump.json`: added `.claude-plugin/marketplace.json` to `files` list so version bumps propagate correctly

## [1.0.0] - 2026-05-16

### Added

- `skills/bootstrap-feature` — architecture-only feature bootstrap skill with embedded reference docs
  (`breaking/`, `patterns/`, `logging.md`); Socratic intake, clean-arch scaffold, architecture
  contract, context seeding. Replaces deprecated `seed-new-feature-claude` command. (#16)
- `skills/flutter-go-router` — GoRouter navigation conventions skill
- `skills/unit-test-claude` — unit test generation skill (mocktail, GWT, Riverpod ProviderContainer)
- `skills/generate-widget-tests` — widget tests via Robot Testing pattern
- `skills/build-optimized-widget` — Flutter widget scaffold with Riverpod `.select()` and side-effects
- `skills/build-filter` — targeted `build_runner --build-filter` skill (avoids full project codegen)
- `skills/flutter-analyze-targeted` — `dart analyze` scoped to feature path
- `skills/flutter-melos-workspace` — Melos monorepo orchestration skill
- `skills/maestro-screenshot-flow` — Maestro YAML flows for automated screenshots
- `agents/riverpod-reviewer` — subagent that reviews Riverpod v3 provider code after changes
- `agents/prompt-engineer` — subagent for designing and optimizing LLM prompts
- `commands/seed-context-claude` — session context loader (breaking + pattern docs)
- `commands/seed-ui-context-claude` — UI/layout/widget context loader
- `commands/seed-fix-refactor-claude` — bug-fix and refactor context loader
- `commands/git-commit-staged-claude` — Conventional Commits message generator
- `commands/update-logs-claude` — logging update command to project standard
- `scripts/dart-format-hook.sh` — PostToolUse hook auto-formatting `.dart` files
- `scripts/protect-sensitive-files.sh` — PreToolUse hook blocking edits to env/credential files
- `scripts/validate-bash.sh` — PreToolUse hook blocking forbidden bash patterns
- `scripts/context-monitor.py` — StatusLine script displaying model, context %, branch, cost
- `hooks/session-start.sh` — session-start hook auto-injecting Flutter context
- `scripts/bump-version.sh` — versioning system for toolkit releases (#6)
- `AGENTS.md` and `package.json` for generic agent support (#3)
- Gemini CLI support with full tool translation (#2)
- Marketplace installation guide in README (#7)

### Changed

- `CLAUDE.md` — updated `bootstrap-feature` skill description; removed `seed-new-feature-claude` row
- Plugin manifests (`.claude-plugin/`, `.cursor-plugin/`) now tracked in git (#15)

### Removed

- `commands/seed-new-feature-claude.md` — superseded by `bootstrap-feature` skill (#16)
- `commands/[deprecated]make-plan.md` — removed deprecated command
