<!-- source: local (flutter-toolkit) -->
## Web boot loader (WEB-02)

**Goal:** Avoid 3-5 s of blank white page while Flutter web downloads `main.dart.js`, the renderer runtime, fonts and
assets.

Flutter paints nothing until the engine is up. HTML/CSS in `<body>` shows immediately, and a custom
`web/flutter_bootstrap.js` can drive progress from the loader lifecycle hooks. Needs no Dart.

### Scope

This rule inspects `web/`, not Dart. Run it only when the audited target is an **app root or `lib/`**. Skip silently
for a feature folder, a single widget, or a non-web target.

### Flag

- (a) `web/index.html` whose `<body>` has no visible element before the `flutter_bootstrap.js` script.
- (b) custom `flutter_bootstrap.js` that never listens for `flutter-first-frame` (loader removed on `runApp()`
  resolve, or never removed).
- (c) custom `flutter_bootstrap.js` with top-level `const` / `let` / `class` outside an IIFE or block. In debug
  (`flutter run -d chrome`) it collides with the DDC `loader` global:
  `Identifier 'loader' has already been declared`, so the app never starts. Release builds hide it.
- (d) custom `flutter_bootstrap.js` with no `serviceWorkerSettings` while `--pwa-strategy=none` is not configured.
- (e) loader styles applied to `body` (`display: flex` on body); use a `position: fixed; inset: 0` overlay.

### Severity

**warning** (non-breaking pattern), except (c) which breaks debug boot; still reported as warning, mention the impact.

### Do not flag

- No custom `flutter_bootstrap.js` at all: only (a) and (e) apply.
- `{{flutter_js}}` / `{{flutter_build_config}}` tokens at top level (they must stay outside the IIFE).
- (d) when `--pwa-strategy=none` is set in CI scripts, `melos.yaml` or docs (the token renders empty and would be a
  syntax error).

### Fix

Run `/web-loader-init` (the audit reports, the skill scaffolds). For (c) alone: wrap everything after
`{{flutter_js}}` / `{{flutter_build_config}}` in `(function () { ... })();`.
