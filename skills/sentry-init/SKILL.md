---
name: sentry-init
description: "Bootstrap sentry_flutter in a Flutter+Riverpod+GoRouter project — installs deps, wires SentryFlutter.init (Approach 3), GoRouter observer, Riverpod error capture (LoggerService decorator if present, else a scaffolded ErrorLogger sink), web BetterFeedback gated by CanvasKit renderer, beforeSend/sampling policy, and a release upload checklist (source maps + dSYM). Use when the user says \"add Sentry to this app\", \"set up error monitoring\", \"bootstrap sentry-init\", \"integrate crash reporting\", or asks to wire up Sentry for a Flutter/Riverpod/GoRouter project."
user-invocable: true
---

# sentry-init

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

Bootstraps the Sentry Flutter SDK in an existing Flutter project that uses Riverpod and GoRouter. Run all phases in order; each phase is idempotent — if the target already has partial Sentry setup, report deltas only, do not duplicate.

Before coding anything, load the bundled references in parallel:

- `references/initialization-flow.md`
- `references/error-capture-architecture.md`
- `references/event-filtering-and-sampling.md`
- `references/gorouter-and-dio-wiring.md`
- `references/web-feedback-canvaskit.md`
- `references/release-uploads.md`

Also fetch the latest `sentry_flutter` SDK docs via context7 (`getsentry/sentry-dart`) before pinning any version numbers — the reference files cite minimum-tested baselines, not pinned versions.

---

## Phase 0 — Intake & prerequisite gate

**Goal**: gather all project shape facts before touching any file. Never assume — detect.

**Prerequisite**: a Sentry account and project must already exist (sentry.io → Create Project → platform
Flutter). This skill wires the SDK into the app; it does not create or configure anything on Sentry's side.

### 0.1 Melos workspace detection

Grep root `pubspec.yaml` for `workspace:` (pub workspaces) or `melos:` block.

- **Monorepo detected**: ask the user which package(s) to target. All subsequent phases apply to the selected package root. Use `melos exec --scope=<pkg> -- <cmd>` for pub operations.
- **Single-app**: target root is the project root.

### 0.2 GoRouter prerequisite (hard gate)

In the target `pubspec.yaml`, grep for `go_router`.

- **Not found**: abort immediately with this message:

  ```
  ✗ sentry-init requires go_router for NavigatorObserver wiring.
    Run the `flutter-go-router` skill first, then re-run sentry-init.
  ```

- **Found**: proceed.

### 0.3 Error sink detection (soft)

Grep project `lib/` for:
- `class LoggerService` or `abstract.*LoggerService`
- `loggerServiceProvider`

Record result as `HAS_LOGGER_SERVICE=true/false` and derive the sink identity Phase 4 wires everything
through — `LoggerService` decorator and a scaffolded `ErrorLogger` are both **sinks** (something a caller
hands an error to); `ProviderObserver` is a **channel** (where errors arrive from), not a competing sink:

| `HAS_LOGGER_SERVICE` | `SINK_PROVIDER` | `SINK_CAPTURE` call shape |
|-----------------------|------------------|-----------------------------|
| `true` | `loggerServiceProvider` | `sink.e(message, error, stackTrace)` — takes a message |
| `false` | `errorLoggerProvider` | `sink.logException(error, stackTrace)` — no message |

The two shapes are not interchangeable — Branch A's `.e(...)` always takes a leading message string,
Branch B's `.logException(...)` never does. Use the row matching the detected branch verbatim; don't
average the two signatures.

### 0.4 Optional dependency detection

| Probe | Grep target | Variable |
|-------|-------------|----------|
| Dio | `import 'package:dio/dio.dart'` or `dio:` in pubspec | `HAS_DIO` |
| logging package | `logging:` in pubspec | `HAS_LOGGING` |
| Existing Sentry | `sentry_flutter` in pubspec | `ALREADY_HAS_SENTRY` |

If `ALREADY_HAS_SENTRY=true`, proceed but operate in **delta mode**: report what already exists vs what needs changing.

### 0.5 DSN source

Ask the user how the DSN is provided. Present this priority order as default:

1. `dart_defines.json` / `dart_defines.json.example` (key `SENTRY_DSN`) — recommended, compile-time, never committed
2. `--dart-define=SENTRY_DSN=...` in `.vscode/launch.json` or `Makefile`
3. `.env` file read at runtime

`dart_defines.json` is the default because it's validated prior art (see this repo's
`docs/adr/0001-sentry-init-dsn-source-convention.md`), not a guess — a single shared file
beats one `.env` per flavor for a toolkit that has no other skill scaffolding `.env` files. If the target
project already uses `.env`-per-flavor, detect and adapt to it instead of migrating it.

Confirm the exact key name (default `SENTRY_DSN`). In Phase 2, the skill always emits an **empty-string gate** so local dev without the define simply skips Sentry init.

Determine how the value is accessed in Dart (e.g. `const String.fromEnvironment('SENTRY_DSN')` or via an `AppEnv`/`Env` class). Record as `DSN_DART_EXPR`.

### 0.6 Flavor detection

Grep for `lib/main_*.dart` or a `Flavor` / `AppFlavor` enum. List discovered flavors.

**Performance monitoring is opt-in, default off.** `sentry-init` bootstraps *error* monitoring;
`tracesSampleRate`/`profilesSampleRate` open two additional Sentry quota buckets (spans, profiling) the
course itself doesn't enable by default (see
[references/event-filtering-and-sampling.md](references/event-filtering-and-sampling.md)). Ask the user
whether to enable it. If yes, map flavors to this table — `profilesSampleRate` is *relative* to
`tracesSampleRate`, not independent, so the values below are chosen for the stated effective rate, not
copied 1:1:

| Flavor | tracesSampleRate | profilesSampleRate (relative) | effective profiling |
|--------|-------------------|-------------------------------|----------------------|
| prod / release | 0.2 | 1.0 | 0.2 |
| dev / debug / staging | 1.0 | 1.0 | 1.0 |

`profilesSampleRate` only does anything on iOS/macOS — Sentry doesn't support profiling on Android or Web
yet. `tracesSampleRate` still applies everywhere. If the target is Android-only or web-only, mention this
before asking — the profiling half of the table is a no-op there.

Ask the user to confirm or adjust. If declined, record `PERF_MONITORING=false` and omit both options
entirely in Phase 2 — leaving them unset consumes zero span/profile quota (both default to `null` in the
SDK).

### 0.7 Package name

Grep `pubspec.yaml` for `name:`. Record as `APP_PACKAGE_NAME` — used for `addInAppInclude`.

### Phase 0 summary

Before proceeding, print a one-line summary of what was detected:

```
✓ Target: <package>
✓ go_router: found
✓ LoggerService: <found|not found> → Phase 4 will use <Branch A|Branch B>
✓ Dio: <found|not found>
✓ DSN key: <SENTRY_DSN> via <dart_defines.json|launch.json|.env>
✓ Flavors: <list>
✓ Performance monitoring: <on|off>
✓ Package name: <name>
```

Ask the user to confirm before proceeding.

---

## Phase 1 — Install dependencies

### 1.1 Core

```bash
flutter pub add sentry_flutter
flutter pub add --dev sentry_dart_plugin
```

For monorepo: prefix with `melos exec --scope=<pkg> -- `.

Minimum-tested baseline versions (verify current latest via context7 before pinning):
- `sentry_flutter: ^9.20.0`
- `sentry_dart_plugin: 3.2.0`

### 1.2 Conditional additions

| Condition | Command |
|-----------|---------|
| `HAS_DIO=true` | `flutter pub add sentry_dio` |
| `HAS_LOGGING=true` | `flutter pub add sentry_logging` |
| Always (for web BetterFeedback) | `flutter pub add feedback feedback_sentry` |

Minimum-tested baselines: `feedback: ^3.2.0`, `feedback_sentry: ^3.2.0`.

---

## Phase 2 — Patch `main.dart` (Approach 3 — no appRunner)

See `references/initialization-flow.md` for full rationale and comparison of all three approaches.

### 2.1 Locate entrypoints

Find all flavor entrypoints: `lib/main.dart`, `lib/main_dev.dart`, `lib/main_prod.dart`, etc. (from Phase 0.6). Apply this phase to each.

### 2.2 Required initialization order

```dart
const kDebugReporting = bool.fromEnvironment('SENTRY_DEBUG_REPORTING');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // --- existing pre-Sentry init (preserve as-is) ---
  // e.g. Firebase.initializeApp(...), usePathUrlStrategy(), setupEmulators()

  // --- Sentry init ---
  final dsn = DSN_DART_EXPR;  // e.g. const String.fromEnvironment('SENTRY_DSN')
  if (dsn.isNotEmpty) {
    await SentryFlutter.init((options) {
      options.dsn = dsn;
      options.environment = FLAVOR_DART_EXPR;     // e.g. flavor.name or getFlavor().name — never a string literal
      // Only emit the next two lines if PERF_MONITORING=true (Phase 0.6):
      options.tracesSampleRate = <0.2 or 1.0>;    // from Phase 0.6 map
      options.profilesSampleRate = <1.0>;         // relative to tracesSampleRate — see references/event-filtering-and-sampling.md
      options.attachScreenshot = false;           // PII — leave off by default
      options.sendDefaultPii = false;
      options.considerInAppFramesByDefault = false;
      options.addInAppInclude(APP_PACKAGE_NAME);
      options.beforeSend = (event, hint) async {
        if (kDebugMode && !kDebugReporting) return null; // suppress debug noise, unless the smoke-test flag is set
        return event;
      };
      // Deliberate, user-initiated — never subject to the debug-noise gate.
      options.beforeSendFeedback = (event, hint) => event;
    });
  }

  // --- existing post-init (preserve as-is) ---
  // e.g. createProviderContainer(), Firebase providers

  runApp(
    SentryWidget(                                // wrap tree for screenshot path
      child: ProviderScope(                      // or UncontrolledProviderScope(container: ...)
        child: MyApp(),
      ),
    ),
  );
}
```

**Critical ordering rule**: Sentry must init _before_ first provider read. Do not reorder `SentryFlutter.init` below `ProviderContainer` creation. See `references/initialization-flow.md`.

`beforeSend` carries no `DioException` filter — the expected-offline-error filter lives at the call site
(Phase 4.3), not here. See `references/event-filtering-and-sampling.md` for why, and `SENTRY_DEBUG_REPORTING`
for how to run the Phase 7 smoke test without touching this file.

### 2.3 Idempotency

If `SentryFlutter.init(` already exists in the file:
- Check the existing options block against the template above.
- Report any missing options as a diff.
- Do not add a second `SentryFlutter.init` call.

### 2.4 Global error hooks

Also wire in `main()` (idempotent — check if already present):

```dart
FlutterError.onError = (details) {
  Sentry.captureException(details.exception, stackTrace: details.stack);
  FlutterError.presentError(details);
};
PlatformDispatcher.instance.onError = (error, stack) {
  Sentry.captureException(error, stackTrace: stack);
  return true;
};
```

If the project already has these hooks routing to a `LoggerService`, do not duplicate — the decorator in Phase 4 will handle Sentry capture automatically.

---

## Phase 3 — Wire GoRouter observer

See `references/gorouter-and-dio-wiring.md` for full context.

### 3.1 Locate GoRouter constructors

Typical paths: `lib/router/app_router.dart`, `lib/src/router/`, `lib/router.dart`. Grep for `GoRouter(`.

### 3.2 Inject observer

For each `GoRouter(` call found, add `observers: [SentryNavigatorObserver()]`. If `observers:` already present, append to the list:

```dart
final goRouter = GoRouter(
  initialLocation: '/',
  observers: [SentryNavigatorObserver()],   // ← add this
  routes: [...],
);
```

For Riverpod-wrapped variant:

```dart
@riverpod
GoRouter router(Ref ref) {
  return GoRouter(
    observers: [SentryNavigatorObserver()],  // ← add this
    refreshListenable: RouterNotifier(ref),
    routes: [...],
  );
}
```

**Do NOT** add to `MaterialApp.router` — it has no `navigatorObservers` argument.

### 3.3 Named routes warning

Inspect routes for `name:` fields. If no named routes found, emit this advisory:

```
⚠ SentryNavigatorObserver is most useful with named routes.
  Without route names, breadcrumb trail will show '/unknown' for most transitions.
  Consider adding name: '...' to your GoRoute definitions.
```

### 3.4 Dio HTTP breadcrumbs (if HAS_DIO=true)

In the Dio provider file (grep for `Dio()` construction), add:

```dart
dio.addSentry();
```

On Flutter web, also add to the `SentryFlutter.init` options block (Phase 2):

```dart
options.tracePropagationTargets.clear(); // prevent CORS failures from sentry-trace header
```

---

## Phase 4 — Riverpod error capture

See `references/error-capture-architecture.md` for the full channel/sink rationale and the swallow-vs-
propagate rule. Three parts, in order: 4.1 wires the sink (Branch A or B, from Phase 0.3's
`SINK_PROVIDER`/`SINK_CAPTURE`), 4.2 wires the shared `AsyncErrorLogger` observer, 4.3 covers manual
call-site capture.

---

### 4.1 — Sink

Run **Branch A** if `HAS_LOGGER_SERVICE=true`, else **Branch B**. Both are first-class — Branch B is not a
fallback pending a future `LoggerService`.

### Branch A — LoggerService decorator

#### A.1 Generate decorator

Create `lib/src/core/monitoring/sentry_logger_service.dart` (adapt path to project conventions):

```dart
import 'package:sentry_flutter/sentry_flutter.dart';
import 'logger_service.dart'; // adjust import

class SentryLoggerService implements LoggerService {
  const SentryLoggerService(this._delegate);
  final LoggerService _delegate;

  @override
  void t(String message, [Object? error, StackTrace? stackTrace]) {
    _delegate.t(message, error, stackTrace);
    // trace: no Sentry action
  }

  @override
  void d(String message, [Object? error, StackTrace? stackTrace]) {
    _delegate.d(message, error, stackTrace);
    Sentry.addBreadcrumb(Breadcrumb(message: message, level: SentryLevel.debug)).ignore();
  }

  @override
  void i(String message, [Object? error, StackTrace? stackTrace]) {
    _delegate.i(message, error, stackTrace);
    Sentry.addBreadcrumb(Breadcrumb(message: message, level: SentryLevel.info)).ignore();
  }

  @override
  void w(String message, [Object? error, StackTrace? stackTrace]) {
    _delegate.w(message, error, stackTrace);
    _capture(message, error, stackTrace, SentryLevel.warning);
  }

  @override
  void e(String message, [Object? error, StackTrace? stackTrace]) {
    _delegate.e(message, error, stackTrace);
    _capture(message, error, stackTrace, SentryLevel.error);
  }

  @override
  void f(String message, [Object? error, StackTrace? stackTrace]) {
    _delegate.f(message, error, stackTrace);
    _capture(message, error, stackTrace, SentryLevel.fatal);
  }

  void _capture(String message, Object? error, StackTrace? stackTrace, SentryLevel level) {
    if (error != null) {
      Sentry.captureException(error, stackTrace: stackTrace).ignore();
    } else {
      Sentry.captureMessage(message, level: level).ignore();
    }
  }
}
```

Adjust method signatures to match the actual `LoggerService` interface in the project.

#### A.2 Patch loggerServiceProvider

In the file that declares `loggerServiceProvider`, wrap with the decorator when DSN is present:

```dart
@Riverpod(keepAlive: true)
LoggerService loggerService(Ref ref) {
  final base = /* existing construction logic */;
  final dsn = DSN_DART_EXPR;
  if (dsn.isEmpty) return base;
  return SentryLoggerService(base);
}
```

Adjust the provider name/import to `SINK_PROVIDER` from Phase 0.3.

---

### Branch B — Scaffolded ErrorLogger

Course shape (Andrea Bizzotto, *Flutter in Production*): an injectable sink, explicit at call sites, never
auto-capturing — this is what makes it overridable in tests and lets expected errors be filtered before
they reach Sentry (Phase 4.3).

#### B.1 Generate ErrorLogger

Create `lib/src/core/monitoring/error_logger.dart` (adapt path to project conventions):

```dart
import 'dart:developer';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

part 'error_logger.g.dart';

class ErrorLogger {
  const ErrorLogger();

  FutureOr<void> logException(Object exception, StackTrace? stackTrace) async {
    await Sentry.captureException(exception, stackTrace: stackTrace).ignore();
    log(exception.toString(), name: 'Exception', error: exception, stackTrace: stackTrace);
  }
}

@Riverpod(keepAlive: true)
ErrorLogger errorLogger(Ref ref) => const ErrorLogger();
```

Run codegen after generating: the command in `references/codegen.md`.

#### B.2 Register the provider

`errorLoggerProvider` is `SINK_PROVIDER` for the rest of Phase 4 — no separate registration step; it's a
plain Riverpod provider, resolved via `ref.read`/`context.container.read` like any other.

---

### 4.2 — AsyncErrorLogger (shared, both branches)

Grep for `ProviderObserver` in the project.

- **`AsyncErrorLogger` (or equivalent) already exists** → no action needed. Sentry capture flows
  automatically via `SINK_CAPTURE` when the existing observer fires.
- **No `ProviderObserver` found** → emit the `AsyncErrorLogger` defined in
  `references/error-logging-contract.md` (§2: Riverpod v3 `providerDidFail`, the `ProviderException`
  guard, the sink guard, sink resolved through `context.container.read`) and register it in
  `observers:`. The contract's file is the one definition; do not re-type it here.

Substitute the sink when you emit it:

| In the contract | Branch A (`LoggerService` exists) | Branch B (scaffolded `ErrorLogger`) |
|---|---|---|
| `loggerServiceProvider` | `SINK_PROVIDER` (`loggerServiceProvider`) | `SINK_PROVIDER` (`errorLoggerProvider`) |
| `logger.e('Provider … error', error, stackTrace)` | unchanged: `SINK_CAPTURE` is `.e(message, error, stackTrace)` | `sink.logException(error, stackTrace)` |

---

### 4.3 — Call-site capture

**Swallow-vs-propagate rule**: a `catch` that rethrows, or lets provider state become `AsyncError`, must
**not** also call `SINK_PROVIDER` — `AsyncErrorLogger` (4.2) already will, and doing both double-reports. A
`catch` that swallows (returns/falls back without rethrowing) never reaches the observer, so it's the
*only* place a manual `SINK_PROVIDER` call belongs.

This is also where an expected-error filter belongs — e.g. the course's case study, an offline
`DioException` with data to fall back on:

```dart
catch (e, st) {
  final hasCachedData = /* app-state check, e.g. local DB non-empty */;
  if (!hasCachedData) rethrow;                    // propagates: the observer reports it, do not log here
  // From here on the error is swallowed, because a fallback exists.
  if (e is DioException && e.response == null) {
    return cached;                                // expected offline: do not report
  }
  // SINK_CAPTURE — Branch A: ref.read(SINK_PROVIDER).e('...', e, st);
  // SINK_CAPTURE — Branch B: ref.read(SINK_PROVIDER).logException(e, st);
  return cached;                                  // unexpected and swallowed: reported above, fall back
}
```

Do not filter this in `beforeSend` — see `references/event-filtering-and-sampling.md` for why.

### Global hooks (emit for both branches — idempotent)

Only add if not already present (checked in Phase 2.4). If Branch A is used and the project already has
global hooks routed to `loggerService`, skip this — the decorator handles it.

---

## Phase 5 — Platform branches

### Web — BetterFeedback + CanvasKit gate

See `references/web-feedback-canvaskit.md` for full architecture.

#### 5.1 CanvasKit renderer utility

Generate the conditional-export utility at `lib/src/common/utils/renderer/` (adapt path to project conventions):

**`is_canvas_kit.dart`** (umbrella / public API):
```dart
export 'native.dart'
    if (dart.library.js) 'web.dart'
    if (dart.library.html) 'web.dart';
```

**`native.dart`**:
```dart
bool isCanvasKitRenderer() => false;
```

**`web.dart`**:
```dart
// ignore: deprecated_member_use
import 'dart:js' as js;

bool isCanvasKitRenderer() {
  try {
    return js.context.hasProperty('flutterCanvasKit');
  } catch (_) {
    return false;
  }
}
```

**`unsupported.dart`** (never selected by conditional exports; stub for analysis):
```dart
bool isCanvasKitRenderer() => throw UnsupportedError('isCanvasKitRenderer');
```

Note: `dart:js` carries a deprecation lint; suppress with `// ignore: deprecated_member_use`. Migration to `dart:js_interop` + `package:web` can be deferred until WASM adoption.

#### 5.2 BetterFeedback wrapper in main.dart

In Phase 2's `runApp(...)` call, add the conditional wrapper:

```dart
import 'package:feedback/feedback.dart';
import 'package:your_app/src/common/utils/renderer/is_canvas_kit.dart';

// inside main():
final canCaptureFeedback = !kIsWeb || isCanvasKitRenderer();
final tree = SentryWidget(child: ProviderScope(child: MyApp()));

runApp(canCaptureFeedback ? BetterFeedback(child: tree) : tree);
```

#### 5.3 SentryFeedbackService

Generate `lib/src/features/feedback/application/sentry_feedback_service.dart`:

```dart
import 'package:feedback/feedback.dart';
import 'package:feedback_sentry/feedback_sentry.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'sentry_feedback_service.g.dart';

class SentryFeedbackService {
  const SentryFeedbackService(this._ref);
  final Ref _ref;

  void show(BuildContext context) {
    // Gracefully degrade: if authenticatedUserProvider exists, use it; else submit anonymous.
    // Adapt the provider read below to the project's auth model.
    String? name;
    String? email;
    // Example (remove if no auth):
    // final user = _ref.read(authenticatedUserProvider).value;
    // name = (user?.name.isNotEmpty ?? false) ? user!.name : null;
    // email = (user?.email.isNotEmpty ?? false) ? user!.email : null;

    BetterFeedback.of(context).showAndUploadToSentry(name: name, email: email);
  }
}

@Riverpod(keepAlive: true)
SentryFeedbackService sentryFeedbackService(Ref ref) =>
    SentryFeedbackService(ref);
```

Run codegen: the command in `references/codegen.md`.

Known limitations to document in the service file:
- CanvasKit only on web — HTML renderer produces blank screenshots.
- Platform views (native maps, WebView) invisible in screenshots — pure Flutter widgets work.
- `showDialog(useRootNavigator: true)` appears above the feedback overlay.

#### 5.4 Gating the trigger button

Any widget that calls `sentryFeedbackService.show(context)` should be guarded:

```dart
// Show only when BetterFeedback is in the tree
final showFeedback = !kIsWeb || isCanvasKitRenderer();
if (showFeedback) IconButton(
  icon: const Icon(Icons.feedback_outlined),
  onPressed: () => ref.read(sentryFeedbackServiceProvider).show(context),
)
```

### Mobile (Android / iOS)

- No additional native init code needed for Sentry 9.x — Dart-side `SentryFlutter.init` covers native crash capture.
- iOS screenshot caveat: auto-screenshot (`attachScreenshot: true`) may fail on iOS because the UI thread may not be available during a crash. Leave `attachScreenshot: false` by default.
- Android release builds require `--obfuscate --split-debug-info=build/debug-info` for readable stack traces. See Phase 6.

---

## Phase 6 — Release & CI checklist

See `references/release-uploads.md` for full build commands and CI snippets.

### 6.1 pubspec.yaml sentry block

Append to the target `pubspec.yaml`. Ask the user for their Sentry `org` and `project` slugs:

```yaml
# https://docs.sentry.io/platforms/flutter/upload-debug/#available-configuration-fields
sentry:
  project: <your-sentry-project-slug>
  org: <your-sentry-org-slug>
  upload_debug_symbols: true
  upload_source_maps: true
  upload_sources: true
  wait_for_processing: false
  commits: auto
  ignore_missing: true
```

### 6.2 CI snippets

Emit two distinct invocation patterns — they are **mutually exclusive per build type**:

**Web release** (source maps; no dSYM):
```bash
flutter build web --release --source-maps \
  --dart-define-from-file=dart_defines.json

dart run sentry_dart_plugin \
  --sentry-define=upload_source_maps=true \
  --sentry-define=upload_sources=true \
  --sentry-define=upload_debug_symbols=false
```

**Android release** (dSYM; no source maps):
```bash
flutter build apk --release --obfuscate \
  --split-debug-info=build/debug-info \
  --dart-define-from-file=dart_defines.json

dart run sentry_dart_plugin \
  --sentry-define=upload_debug_symbols=true \
  --sentry-define=upload_source_maps=false \
  --sentry-define=symbols_path=build/debug-info
```

### 6.3 Required secrets / env vars

| Variable | Purpose | GitHub Secret name pattern |
|----------|---------|---------------------------|
| `SENTRY_AUTH_TOKEN` | Org auth token for sentry_dart_plugin uploads | `<APP>_SENTRY_AUTH_TOKEN` |
| `SENTRY_DSN` | Project DSN passed as `--dart-define` | `<APP>_SENTRY_DSN_PROD` |

Generate the token in Sentry dashboard: **Settings → Auth Tokens → Create New Token**.

Set locally:
- macOS/Linux: `export SENTRY_AUTH_TOKEN=sntrys_...` in `~/.zshrc`
- Windows: `$env:SENTRY_AUTH_TOKEN = "sntrys_..."` in `$PROFILE`

### 6.4 Known limitation

Even after uploading debug symbols, Sentry issue **titles** remain obfuscated. This is a known Sentry limitation ([getsentry/sentry#48334](https://github.com/getsentry/sentry/issues/48334)). Stack frames within the issue detail are correctly symbolicated. No action needed — document this for the team.

---

## Phase 7 — Closing summary

Print a summary grouped by action type:

### Files created
- List each new file with path.

### Files modified
- List each modified file with a one-line description of the change.

### Packages added
- List each package and the command used.

### Checklist for the developer

Items that cannot be automated:

- [ ] Provide Sentry `org` and `project` slugs → update `pubspec.yaml` `sentry:` block
- [ ] Generate `SENTRY_AUTH_TOKEN` in Sentry dashboard and add to CI secrets
- [ ] Add `SENTRY_DSN` prod value to CI secrets / `dart_defines.json.example`
- [ ] Run the codegen command in `references/codegen.md` to generate `sentry_feedback_service.g.dart`
- [ ] Smoke-test: `flutter run --flavor dev --dart-define=SENTRY_DEBUG_REPORTING=true`, throw a deliberate
      exception, verify it appears in the Sentry dashboard tagged with the `dev` environment
- [ ] Get familiar with the dashboard's filter/sort/search and archive/resolve workflow before the first
      real issue lands — see [Sentry's Issues docs](https://docs.sentry.io/product/issues/); this skill
      doesn't automate dashboard usage
- [ ] Optional: wire `Sentry.configureScope` with authenticated user ID once auth integration is in place
- [ ] Optional: set `options.release` and `options.dist` from `package_info_plus` before first public release
- [ ] Optional: enable `attachScreenshot: true` for mobile if UI-thread screenshots are acceptable (iOS caveat applies)

### References

For deeper context on each decision, see:
- `references/initialization-flow.md` — why Approach 3 (no appRunner)
- `references/error-capture-architecture.md` — channel/sink architecture, both branches, severity mapping
- `references/event-filtering-and-sampling.md` — beforeSend/beforeSendFeedback, sampling policy, in-app frames, PII
- `references/gorouter-and-dio-wiring.md` — observer placement, Dio breadcrumbs, CORS
- `references/web-feedback-canvaskit.md` — BetterFeedback integration and CanvasKit gate
- `references/release-uploads.md` — source maps vs dSYM upload commands
