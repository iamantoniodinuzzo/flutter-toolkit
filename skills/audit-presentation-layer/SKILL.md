---
name: audit-presentation-layer
description: 'Audit a Flutter presentation-layer file or folder (screens, widgets, pages, related widget tests) against the project''s documented UI guidelines — Riverpod v3 widget rules, rebuild isolation (const subtrees, scoped MediaQuery, builder child caching, setState blast radius), widget extraction and cohesion/coupling (oversized builds, function widgets, Law of Demeter params, layer/cross-feature imports), Robot Testing pattern, GoRouter conventions, layout antipatterns, side-effect handling, responsive layout (named breakpoints, flex rows, adaptive grids), asset loading (first-frame warm-up, oversized and unused assets, warm-up safety), credential-form autofill (AutofillGroup, autofillHints, password-manager save-on-success), web interaction affordances, the web boot loader and the router page-transition strategy (app-root run only). Platform-aware: auto-detects target platforms from pubspec.yaml and gates rules accordingly; override with --platform=web|android|ios|mobile|all. Emits a violations table with file:line and rule ID, then offers to apply fixes. Use proactively when the user says "audit presentation layer", "audit this widget", "review this widget", "check UI guidelines", "find UI violations", "presentation audit", "lint widgets", "audit autofill", "check password manager support", or asks to verify a widget/screen against project rules before code review.'
user-invocable: true
---

# Audit Presentation Layer

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

Statically scans Flutter presentation-layer source and test files against
bundled rule docs. Emits a violations table, then offers targeted fixes.

## Rule source

Rules are bundled locally in `rules`.
This skill does **not** delegate to `ai_toolkit/` — it is self-contained.

---

## Phase 0 — Resolve input and platform

### Step 1 — Resolve path

Read the user's request and extract one of:

- **Single file**: a path ending in `.dart`
- **Feature folder**: a path containing a `presentation/` directory
- **App root or `lib/`**: a directory containing `pubspec.yaml`, or a `lib/` whose parent has one (enables app-level checks such as WEB-02 and ROUTER-03; a `routing/` folder or the router file itself also enables ROUTER-03)

If neither is clear, ask exactly one question:

> "Provide a widget file path, a feature folder path containing a `presentation/` directory, or an app root."

Do not proceed until a path is confirmed.

### Step 2 — Resolve target platforms

1. Check the user's request for a `--platform=<value>` argument.
   - Accepted values: `web`, `android`, `ios`, `mobile`, `all`.
   - `mobile` expands to `{android, ios}`. `all` expands to `{web, android, ios}`.
2. If no `--platform` argument, read `pubspec.yaml` from the project root.
   Look for the `flutter: { platforms: { ... } }` map (present after
   `flutter create --platforms`). Extract the declared platform keys
   (`web`, `android`, `ios`, `linux`, `macos`, `windows`). Use only
   `web`, `android`, `ios` from this set.
3. If `pubspec.yaml` has no `platforms` map (or cannot be read), fall back to `all`.

**Precedence**: `--platform` arg > pubspec `flutter.platforms` > `all` (fallback).

State the resolved target at the start of Phase 4 output, e.g.:
- `Target platforms: android, ios (from pubspec)`
- `Target platforms: web (from --platform=web)`
- `Target platforms: all (fallback — no platforms map in pubspec)`

### Step 3 — Rule gating

Before applying any rule in Phase 3, check the rule's `Platforms:` tag in
`rules/CATALOG.md`. Skip the rule if its platform set does not intersect the
resolved target set. Rules tagged `all` always run.

---

## Phase 1 — Load rule catalog

Read `rules/CATALOG.md` in full before scanning.

Do not read individual rule doc files yet — the catalog contains all heuristics
needed for Phase 3. Open a specific rule doc only if you need to clarify a
borderline case or produce a more detailed fix explanation.

---

## Phase 2 — Discover files

### Single-file mode

Target file = the provided `.dart` path.

Check whether a mirrored `*_test.dart` exists under `test/src/`:

```
lib/src/features/<feature>/presentation/<name>.dart
→ test/src/features/<feature>/presentation/<name>_test.dart
```

Include the test file in the scan if it exists.

If the provided file is NOT under `presentation/`, classify it as `domain-file`
(skip the test mirror check) and apply only UI-STR-01 to it.

### Folder mode

Discover files with a permitted read-only subagent, otherwise scan directly. Use this prompt:

```
List all .dart files (excluding .g.dart, .freezed.dart) recursively
  under <input_path>. For each file report:
  - Relative path
  - Whether it is a *_test.dart file
  - Line count (approximate)
  - Widget class name and superclass if visible in first 20 lines
  Report as a plain table.
```

Also check for the mirrored `test/src/` path of the given lib/ folder and
include all `*_test.dart` files found there.

Also collect non-`presentation/` dart files under the same feature root
(e.g. `application/`, `domain/`, `data/` siblings of `presentation/`).

Classify each file:
- `widget` — non-test dart file under `presentation/`
- `widget-test` — `*_test.dart` file mirroring a presentation widget
- `domain-file` — dart file outside `presentation/` in the same feature tree
- `web-entry` — `web/index.html`, `web/flutter_bootstrap.js`, `web/*.css` (**app-root/`lib/` mode only**, web target only)
- `router` — a `.dart` file under `lib/` containing `GoRouter(` or `pageBuilder:` (**app-root/`lib/` mode, a `routing/` folder, or the router file passed directly**; mobile target only)

### App-root mode

When the input is an app root or `lib/`, discover Dart files as in folder mode (all `presentation/` trees under
`lib/`) and additionally collect the `web-entry` and `router` files. For a feature folder or other single file, skip
`web-entry` and `router` silently.

---

## Phase 3 — Scan

For each file:

1. Read the full file contents.
2. Apply every heuristic in `rules/CATALOG.md` relevant to the file type **and**
   not gated out by the platform target (see Phase 0 Step 3):
   - `widget` files → apply: RIV-WIDGET-*, REBUILD-*, EXTRACT-*, COHESION-01, COUPLING-*, LAYOUT-*, SIDE-FX-01, ROBOT-04, ROUTER-*, RESPONSIVE-*, ASSET-*, AUTOFILL-*, WEB-01
   - `widget-test` files → apply: ROBOT-01, ROBOT-02, ROBOT-03, ROBOT-05
   - `domain-file` files → apply: UI-STR-01 only
   - `web-entry` files → apply: WEB-02 only
   - `router` files → apply: ROUTER-03 only
3. For each match: record `{file, line_number, rule_id, severity, message, fix_hint, autofix_safe}`.

Heuristic application notes:

- **RIV-WIDGET-01**: flag `ref.watch(` lines where the enclosing method is NOT named `build`. Look at method declarations above the line to determine context.
- **RIV-WIDGET-02**: flag `ref.watch(someProvider)` result where the return value is immediately accessed with `.fieldName` (within 3 lines) and no `.select(` appears on the watch call.
- **RIV-WIDGET-03**: flag `Consumer(` blocks where the `builder:` body exceeds 50 lines.
- **RIV-WIDGET-04**: flag `ref.read(` lines inside a `build(BuildContext` method span.
- **REBUILD-01**: inside `build` spans, flag all-literal constructor calls (`SizedBox(`, `EdgeInsets.*(`, `Icon(Icons.`, literal-only `Text(`, `Divider(`) not preceded by `const` and not covered by an enclosing `const` (check ~3 lines above).
- **REBUILD-02**: flag `MediaQuery.of(context).<prop>` single-property accesses (`size`, `padding`, `viewInsets`, `platformBrightness`, `textScaler`); fix is the scoped `MediaQuery.<prop>Of(context)` accessor.
- **REBUILD-03**: flag `AnimatedBuilder(`/`ListenableBuilder(`/`ValueListenableBuilder(` spans with no `child:` argument and a `builder:` body > ~10 lines.
- **REBUILD-04**: in files with `setState(`, measure the enclosing class's `build(` span; flag each `setState(` call when that span > 50 lines.
- **EXTRACT-01**: flag `build(` method declarations whose span (signature to matching brace) exceeds 80 lines.
- **EXTRACT-02**: flag top-level `Widget name(` declarations (column 0) and `static Widget name(` anywhere in widget files.
- **COHESION-01**: for widget classes with one non-Key constructor field of a non-primitive project type, count distinct `<field>.<member>` accesses in the class body; flag the field when ≤ 2 distinct members are read.
- **COUPLING-01**: in `presentation/` files, flag `import` lines whose path contains `/data/`.
- **COUPLING-02**: in `features/<name>/presentation/` files, flag imports matching `features/<other>/presentation/` where `<other>` ≠ own feature.
- **ROBOT-01**: flag any `find.text(` in `*_test.dart` files.
- **ROBOT-02**: flag any `find.byTooltip(` in `*_test.dart` files.
- **ROBOT-03**: flag all `pumpAndSettle(` lines in test files that also contain `CircularProgressIndicator` or `LinearProgressIndicator`.
- **ROBOT-04**: for each interactive widget found (see catalog for list), check if the same file declares a Key for it; flag if missing.
- **ROBOT-05**: flag public `find…()` methods in Robot classes (method name starts with `find` but no leading `_`).
- **ROUTER-01**: flag `context.push(` and `GoRouter.of(context).push(` in `presentation/` source files.
- **ROUTER-02**: flag `AppBar(` in `*_screen.dart` files where `leading:` is not present in the same `AppBar(…)` span.
- **ROUTER-03** _(mobile target, router file, app-root/`lib/`/`routing/` input only)_: flag a ≤ 3-line helper returning `NoTransitionPage(`/`NoTransitionPage<...>(` (or inline `pageBuilder: ... => NoTransitionPage(`) used by ≥ 50% of `GoRoute` page builders and ≥ 3 routes; one-offs below the threshold never fire. Severity is warning when android/ios is explicitly targeted, info on the `all` fallback. Grep `lib/` for `pageTransitionsTheme:` to pick the message — *theme set but bypassed* vs *no transition strategy* — and note a light/dark mismatch. Fix text: adaptive `PageTransitionsTheme` on both themes + `MaterialPage`; see `flutter-go-router` § Page Transitions, or run `/page-transitions-init`.
- **LAYOUT-01**: flag any file with more than one `Scaffold(` occurrence.
- **LAYOUT-02**: flag `Widget _` methods inside widget class bodies.
- **SIDE-FX-01**: flag `showDialog(`, `Navigator.push(`, `ScaffoldMessenger.of(context).show`, `addPostFrameCallback(` inside `build(BuildContext` method spans.
- **UI-STR-01**: flag long string literals (> ~20 chars, > 3 words) in files outside `presentation/`.
- **RESPONSIVE-01**: flag `MediaQuery.of(context).size` or `MediaQuery.sizeOf(context)` used in an `if`/ternary branch for layout decisions; also flag `width:` / `height:` values ≥ 100 on `Container(`/`SizedBox(` constructor spans (proxy for hard-coded structural sizing, not small decorative values).
- **RESPONSIVE-02**: flag width-like expressions (`constraints.maxWidth`, `size.width`, `width`) compared against 3–4 digit numeric literals in `if`/ternary/`switch` conditions; skip when the value comes from a named constant (e.g. `AppBreakpoints.compact`).
- **RESPONSIVE-03**: within `Row(` spans, flag the `Row(` line when ≥ 2 children carry `width: <num>` and no `Flexible(`/`Expanded(` appears in the span.
- **RESPONSIVE-04**: flag literal `crossAxisCount: <num>` in `SliverGridDelegateWithFixedCrossAxisCount(` and `GridView.count(` spans, unless computed from constraints/width.
- **ASSET-01**: flag `SvgPicture.asset(`/`Image.asset(`/`AssetImage(` in first-route/shell widgets whose path has no `SvgAssetLoader(`/`precacheImage(` warm-up in startup code; skip engine-registry and `rootBundle`-only assets. Warning for SVG, info for raster.
- **ASSET-02**: needs project root. Flag raster assets whose pixels exceed display logical px × 3 × 1.5, or (display size unknown) decoded `w × h × 4` > 4 MB. Report only.
- **ASSET-03**: needs project root. Flag pubspec-declared assets with no reference; follow `flutter_gen` accessors and runtime-built paths first. Report only — never delete.
- **ASSET-04**: flag warm-ups with no error handler at the creation expression, a cache key that cannot match the widget's (`theme`/`colorMapper`/`bundle`/`DefaultSvgTheme`), or `precacheImage` on engine-managed assets.
- **AUTOFILL-01**: flag a password field (`obscureText: true` or `Password\w*Field`) alongside an email/username field (`TextInputType.emailAddress` or label/controller matching `email|user(name)?|login`) with no `AutofillGroup(` enclosing both in the `build` span.
- **AUTOFILL-02**: flag password/email/name/phone fields lacking `autofillHints:`, and hint/keyboard mismatches (`AutofillHints.email` without `TextInputType.emailAddress`; `AutofillHints.password` on a new-password field in `register|sign_?up|reset|change_?password` files). Skip non-personal fields (e.g. organisation name).
- **AUTOFILL-03**: (a) flag `AutofillGroup(` spans without `onDisposeAction: AutofillContextAction.cancel`; (b) flag the owning `State` when no `finishAutofillContext(` follows an awaited success check — skip forgot-password screens; (c) flag `.clear()`/`.text = ''` on credential controllers textually before `finishAutofillContext(` in the success branch.
- **AUTOFILL-04**: flag classes under `common/`/`shared/`/`widgets/` whose `build` returns `TextFormField(`/`TextField(` and whose constructor has no `autofillHints` parameter.
- **WEB-02** _(web target, app-root/`lib/` input only)_: inspect `web/` for a missing or broken boot loader — (a) no visible `<body>` element before the bootstrap script, (b) custom `flutter_bootstrap.js` without `flutter-first-frame`, (c) top-level `const`/`let`/`class` outside an IIFE, (d) missing `serviceWorkerSettings` without `--pwa-strategy=none`, (e) `display:flex` on `body`. Skip silently outside app-root mode. Fix text: run `/web-loader-init`.
- **WEB-01** _(web target only)_: flag `GestureDetector(` or `InkWell(` blocks containing `onTap:` where no `MouseRegion`, `Focus`, or `FocusableActionDetector` appears as an ancestor within the same `build` method span (~20 lines above). Skip occurrences inside Flutter's built-in button/tile classes.

---

## Phase 4 — Report

Emit the violations grouped by file. Begin with the resolved platform line:

```
## Audit Results

**Target platforms**: android, ios (from pubspec)

### lib/.../sign_in_screen.dart
| Line | Rule ID | Severity | Message |
|------|---------|----------|---------|
| 42 | RIV-WIDGET-02 | warning | ref.watch(authProvider) accesses single field — add .select() |
| 88 | LAYOUT-02 | warning | Widget _buildForm() is a build helper — extract to widget class |

### test/.../sign_in_screen_test.dart
| Line | Rule ID | Severity | Message |
|------|---------|----------|---------|
| 55 | ROBOT-01 | error | find.text('Login') — breaks i18n; use find.byKey(SignInScreen.loginButtonKey) |
| 73 | ROBOT-03 | error | pumpAndSettle() used in file containing CircularProgressIndicator — use pump() |

---
**Summary**: 4 violations across 2 files (1 error, 2 warnings, 1 info)
```

If no violations are found, say so explicitly:

```
No violations found in <path>. All checked rules pass.
```

---

## Phase 5 — Fix prompt

After the report, ask:

```
Apply fixes for which rule IDs? (comma-separated list, "all", or "none")
Auto-fix safe: RIV-WIDGET-02, REBUILD-01, REBUILD-02, ROBOT-05, AUTOFILL-04, AUTOFILL-03 (a only)
Requires judgment: RIV-WIDGET-01, RIV-WIDGET-03, RIV-WIDGET-04, REBUILD-03,
                   REBUILD-04, EXTRACT-01, EXTRACT-02, COHESION-01, COUPLING-01,
                   COUPLING-02, ROBOT-01, ROBOT-02, ROBOT-03, ROBOT-04,
                   ROUTER-01, ROUTER-02, ROUTER-03, LAYOUT-01, LAYOUT-02, SIDE-FX-01,
                   UI-STR-01, RESPONSIVE-01, RESPONSIVE-02, RESPONSIVE-03,
                   RESPONSIVE-04, ASSET-01, ASSET-02, ASSET-03, ASSET-04, AUTOFILL-01, AUTOFILL-02,
                   AUTOFILL-03 (b/c), WEB-01, WEB-02
```

On response:

- **"none"** or no response: done.
- **"all"** or specific IDs:
  1. For each violation matching the selected IDs:
     - If `autofix_safe: true`: apply the edit directly, show diff.
     - If `autofix_safe: false`: show the specific change needed and ask the
       user to confirm before editing. Provide the exact code transformation.
  2. After all edits, re-run Phase 3 on touched files only.
  3. Confirm which violations were resolved.

Never edit files that were not explicitly approved by the user.

---

## Usage examples

- `audit the presentation layer of features/booking`
- `audit this widget: lib/src/features/auth/presentation/sign_in_screen.dart`
- `find UI violations in features/flight_plan/presentation/`
- `/audit-presentation-layer apps/<app>/lib/src/features/booking/presentation/`
- `/audit-presentation-layer lib/src/features/home/presentation/ --platform=web`
- `/audit-presentation-layer lib/src/features/auth/presentation/ --platform=mobile`

---

## Notes

- Application paths resolve from the project root; bundled references resolve from this installed skill directory.
- This skill does not shell out to `dart analyze`; it reads files directly.
- It does not overlap with `riverpod-reviewer` (which audits provider declarations)
  or `flutter-analyze-targeted` (which runs the Dart analyzer).
- To add or modify rules, edit `rules/CATALOG.md` only.
- **Platform gating**: rules tagged `platforms: all` always run. Rules tagged
  `mobile` are skipped on web-only targets; rules tagged `web` are skipped on
  mobile-only targets. When `pubspec.yaml` has no `flutter.platforms` map, the
  target defaults to `all` so no rule is ever silently skipped on legacy projects.
