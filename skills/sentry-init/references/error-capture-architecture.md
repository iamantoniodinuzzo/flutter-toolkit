# Error Capture Architecture: Sink, Channel, Call Site

> Adapted from internal production notes and from Andrea Bizzotto's *Flutter in Production* error-monitoring
> module (case study: capturing exceptions explicitly).

---

## Sink vs. Channel

Two kinds of object are at play here, and conflating them is the mistake this file exists to prevent:

- A **sink** is something a caller hands an error to. `LoggerService` (decorated) and `ErrorLogger` are
  both sinks — same role, different shape.
- A **channel** is a place errors arrive *from* — specifically, provider failures Riverpod has already
  caught into an `AsyncError`. `ProviderObserver` is a channel, not a competing sink.
  `FlutterError.onError`, `PlatformDispatcher.instance.onError`, and swallowed `catch` blocks are the other
  three channels.

All four channels exist regardless of which sink a project has. `AsyncErrorLogger` (Phase 4.2) is the
single observer that bridges the provider channel to whichever sink Phase 0.3 detected — it is not itself
the sink.

---

## Branch A — LoggerService decorator

When a project already has a widely-used `LoggerService` abstraction, decorating it achieves Sentry
coverage at a fraction of the migration cost of introducing a second sink:

- `loggerServiceProvider` typically has many consumers — 30–50+ files in a mature app.
- Three global error hooks (`FlutterError.onError`, `PlatformDispatcher.instance.onError`,
  `AsyncErrorLogger`) already call `loggerService.e(...)`.
- ~50–80+ `catch (e, st)` blocks across feature code already call `loggerService`.

Introducing a parallel sink here would mean touching every call site. The decorator intercepts all
existing calls transparently: **zero changes to feature code**.

```
                         ┌──────────────────────────┐
loggerServiceProvider ─► │  SentryLoggerService     │ ──► Sentry SDK
(when DSN is present)    │  (decorator)             │
                         └──────────────┬───────────┘
                                        │ delegates every call
                                        ▼
                         ┌──────────────────────────┐
                         │  LoggerServiceImpl       │ ──► package:logger / console
                         └──────────────────────────┘
```

When `SENTRY_DSN` is empty (local dev, unit tests): `loggerServiceProvider` returns `LoggerServiceImpl`
directly — the decorator is never constructed, and the Sentry SDK is never called.

### Severity mapping

| Method | Forwards to delegate | Sentry action |
|--------|---------------------|---------------|
| `t` (trace) | yes | none |
| `d` (debug) | yes | `addBreadcrumb(level: debug)` |
| `i` (info) | yes | `addBreadcrumb(level: info)` |
| `w` (warn) | yes | `captureException` or `captureMessage` at warning |
| `e` (error) | yes | `captureException` or `captureMessage` at error |
| `f` (fatal) | yes | `captureException` at fatal |

**Capture rule**: if `error` argument is non-null → `captureException(error, stackTrace: st)` (Sentry shows
full stack trace). If `error` is null (message-only log) → `captureMessage(message, level: level)`.

Both calls use `.ignore()` on the returned `Future<SentryId>` to preserve the synchronous `void` signature
of `LoggerService`.

### Provider wiring with DSN gate

```dart
@Riverpod(keepAlive: true)
LoggerService loggerService(Ref ref) {
  final base = /* LoggerServiceImpl construction */;
  final dsn = const String.fromEnvironment('SENTRY_DSN');
  if (dsn.isEmpty) return base;
  return SentryLoggerService(base);
}
```

The DSN is injected at compile time via `--dart-define=SENTRY_DSN=...` or
`--dart-define-from-file=dart_defines.json`.

---

## Branch B — Scaffolded ErrorLogger

When no `LoggerService` abstraction exists, the sink is a small injectable `ErrorLogger` — the course's
shape, not a downgraded stand-in for Branch A. It's called explicitly from `catch` blocks rather than
auto-capturing, specifically so it's overridable in tests
(`errorLoggerProvider.overrideWithValue(FakeErrorLogger())`) and so expected errors can be filtered at the
call site before they ever reach Sentry (see Call-Site Capture, below).

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

`errorLoggerProvider` plays the same role Branch A's `loggerServiceProvider` does everywhere else in this
skill — both branches emit the same `AsyncErrorLogger` observer and follow the same swallow-vs-propagate
rule below. Nothing downstream needs to know which branch produced the sink.

---

## AsyncErrorLogger (shared, Riverpod v3)

The observer is defined once, in `error-logging-contract.md` (§2): `providerDidFail` instead of the v2
`didUpdateProvider`/`AsyncError` pattern-match, the `ProviderException` guard (one root failure, one
report), the sink guard, and the sink resolved through `context.container.read(...)` so that a test override
reaches it. This skill emits that observer with `SINK_PROVIDER` as the sink (Phase 4.2 gives the
substitution for each branch) and does not restate its code.

---

## Call-Site Capture: Swallow vs. Propagate

A `catch` block either **propagates** (rethrows, or lets provider state become `AsyncError`) or
**swallows** (returns/falls back without rethrowing). Only the swallow case may call `SINK_PROVIDER`
directly:

- **Propagate** → `AsyncErrorLogger` will capture it once the state settles. Also calling the sink here
  double-reports the same failure.
- **Swallow** → the error never reaches an `AsyncError` state, so `AsyncErrorLogger` never sees it. This is
  the *only* place a manual `SINK_PROVIDER` call belongs — and, symmetrically, the only place an
  expected-error filter can see the application state it needs.

The course's case study is the canonical example: an app-startup fetch fails with a `DioException` that
has no `response` (offline), but the local database already has data to fall back on. `beforeSend`
structurally cannot make this call — it only ever sees the `SentryEvent`, never `isDbEmpty` or its
equivalent:

```dart
Future<void> loadInitialData() async {
  try {
    final data = await fetchFromNetwork();
    await db.save(data);
  } catch (e, st) {
    final hasCachedData = await db.isNotEmpty();
    if (!hasCachedData) rethrow;                  // propagates: AsyncErrorLogger reports it, do not log here
    // From here on the error is swallowed, because a fallback exists.
    if (e is DioException && e.response == null) {
      return;                                    // expected offline: do not report
    }
    // Branch A: ref.read(SINK_PROVIDER).e('Initial data load failed', e, st);
    // Branch B: ref.read(SINK_PROVIDER).logException(e, st);
  }
}
```

Note the shape isn't specific to Dio or to this one predicate — the pattern is "swallow only when there's a
safe fallback, and only the swallow branch talks to the sink." See
`references/event-filtering-and-sampling.md` for why this filter does not belong in `beforeSend`.

---

## Testing

Tests never touch the Sentry SDK because they override the provider with a fake — the same shape on both
branches:

```dart
ProviderScope(
  overrides: [
    SINK_PROVIDER.overrideWithValue(FakeSink()),
  ],
  child: widgetUnderTest,
)
```

The real sink (`SentryLoggerService` or `ErrorLogger`) is never instantiated in test context. No
`SentryFlutter.init` call is required in tests, and — because `AsyncErrorLogger` resolves the sink through
`context.container.read(SINK_PROVIDER)` rather than a hand-built instance — the override reaches the
observer too.

---

## Future Work

- Wire `Sentry.configureScope` with authenticated user ID in the auth integration PR.
- Set `options.release` and `options.dist` from `package_info_plus` before first public release.
- Prune noisy expected exceptions per catch site reactively as Sentry noise appears.
