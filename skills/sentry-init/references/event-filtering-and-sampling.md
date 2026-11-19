# Event Filtering, Sampling, and Data Minimization

> Adapted from internal production notes and from Andrea Bizzotto's *Flutter in Production* error-monitoring
> module (additional options/APIs lesson and the Sentry-bill lesson).

---

## beforeSend and beforeSendFeedback

```dart
const kDebugReporting = bool.fromEnvironment('SENTRY_DEBUG_REPORTING');

options.beforeSend = (event, hint) async {
  if (kDebugMode && !kDebugReporting) return null;
  return event;
};

// Deliberate, user-initiated — never subject to the debug-noise gate.
options.beforeSendFeedback = (event, hint) => event;
```

`beforeSend` fires for uncaught exceptions and explicit `Sentry.captureException` calls; returning `null`
drops the event. `kDebugMode` gates debug-session noise — routine exceptions hit while iterating locally,
not something worth a Sentry event every time. It deliberately does **not** use `!kReleaseMode`: that also
silences *profile* builds, where internal distribution and perf testing happen, which has nothing to do
with local debugging noise.

**Why a separate `beforeSendFeedback`.** The Sentry Dart SDK dispatches `event.type == 'feedback'` events
to `beforeSendFeedback` when it's set, and only falls through to `beforeSend` when it isn't. Feedback is a
deliberate, user-initiated action — someone chose to open the feedback overlay and write something. Gating
it behind the same debug-noise filter as unhandled exceptions means a tester can't submit feedback from a
debug build, which defeats the point of testing the feedback flow before release. Setting a plain
passthrough here costs nothing and removes that dead end.

### Running the Phase 7 smoke test

The `kDebugMode` gate above means a bare `flutter run` in debug mode will *not* report the deliberate test
exception — that's correct, expected behavior, not a bug to route around by weakening the gate. Run the
smoke test with the flag flipped on instead:

```bash
flutter run --flavor dev --dart-define=SENTRY_DEBUG_REPORTING=true
```

Then throw the deliberate exception and verify it lands in the Sentry dashboard tagged with the `dev`
environment (from `options.environment`, wired in Phase 2).

### Where the DioException filter does *not* live

The course also filters `DioException` with a null `response` inside `beforeSend`. This skill does not —
`beforeSend` only ever sees the `SentryEvent` and a `Hint`, never application state. The course's own
call-site logic (an app-startup fetch failure) additionally checks whether the local database has data to
fall back on before deciding to swallow the error; a blanket `beforeSend` filter can't express that second
condition and ends up dropping *every* null-response `DioException` unconditionally, including the case the
call site was written to still report. `response == null` also matches `DioExceptionType.unknown`, which
wraps TLS, DNS, bad-`baseUrl`, and raw socket failures — exactly the production bugs most worth seeing.

The filter lives at the call site instead: see the swallow-vs-propagate rule in
`references/error-capture-architecture.md`.

**Opt-in variant** for a project that wants a global backstop across every Dio call site regardless of
per-call judgment, narrowed to genuine connectivity failures only:

```dart
options.beforeSend = (event, hint) async {
  if (kDebugMode && !kDebugReporting) return null;
  final ex = event.throwable;
  if (ex is DioException &&
      const {
        DioExceptionType.connectionError,
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
      }.contains(ex.type)) {
    return null;
  }
  return event;
};
```

Never include `DioExceptionType.unknown` or `DioExceptionType.badResponse` in that set — both can wrap
genuine bugs.

---

## sampleRate: leave unset

Do not set `options.sampleRate`. It defaults to `1.0` (all error events sent) and should stay there.
Random error sampling is a poor tool for Sentry's free-tier limit specifically because Sentry already
groups individual events into issues — quota pressure in practice comes from a handful of high-frequency
issues, not broad low-frequency noise. Sampling below 1.0 degrades exactly the data needed to triage that
pressure: a sampled issue's frequency count becomes meaningless (indistinguishable from one that genuinely
affects fewer users), and sampling can drop the only occurrence of a rare, high-severity crash entirely.

If a project is genuinely over quota, escalate in this order:

1. **Targeted `beforeSend` filter** for the specific noisy exception class — same shape as the opt-in Dio
   variant above, scoped to whatever is actually noisy.
2. **Fix the top-volume issue.** A handful of issues usually account for most of the volume; this is the
   highest-leverage move and the only one that doesn't cost visibility.
3. **Server-side controls** — Sentry's spike protection and per-key rate limits shed load at the ingestion
   boundary without blinding the client to what's happening.
4. **Last resort**: `options.sampleRate` below `1.0`. If it comes to this, document the fidelity cost
   alongside the change — issue frequency counts will no longer mean what they used to.

---

## tracesSampleRate / profilesSampleRate: opt-in, default off

`sentry-init` bootstraps *error* monitoring. Performance monitoring (`tracesSampleRate`) and profiling
(`profilesSampleRate`) are a related but separate Sentry feature with its own quota impact — both options
default to unset (`null`) in the SDK, and the course itself omits them by default ("not needed for the
Flutter Ship app"). Emitting them unconditionally would silently enroll every project in two quota buckets
it never asked for.

Phase 0.6 asks whether to enable performance monitoring. If declined, omit both options entirely — leaving
them unset consumes zero span or profile quota, even though `enableAutoPerformanceTracing` defaults to
`true` (it produces nothing while `tracesSampleRate` is null).

If enabled, use this table — **`profilesSampleRate` is relative to `tracesSampleRate`, not
independent**. Setting both to the same literal value does not mean "profile at that rate"; it means
"profile at `tracesSampleRate × profilesSampleRate` of all events":

| Flavor | `tracesSampleRate` | `profilesSampleRate` (relative) | effective profiling |
|--------|---------------------|-----------------------------------|-----------------------|
| prod / release | 0.2 | 1.0 | 0.2 |
| dev / staging | 1.0 | 1.0 | 1.0 |

Setting `profilesSampleRate` to `0.2` when `tracesSampleRate` is already `0.2` yields 4% effective
profiling, not 20% — a common mistake worth naming explicitly here, since the two options read as parallel
but aren't.

**Profiling is iOS/macOS-only** — Sentry's own [profiling troubleshooting docs](https://docs.sentry.io/platforms/flutter/profiling/troubleshooting/)
state plainly: "Profiling is currently available only for iOS and macOS." `tracesSampleRate` still applies
everywhere (performance/transaction monitoring is cross-platform); only the *profiling* half of this opt-in
is mobile-Apple-only. Exact runtime behavior of `profilesSampleRate` on an unsupported platform (silent
no-op vs. a logged warning) isn't documented — don't assert either way. What matters for this skill: if the
target project is Android-only or web-only, say so when presenting this table, since the profiling row of
it won't do anything there regardless of the exact mechanism.

---

## considerInAppFramesByDefault and addInAppInclude

```dart
options.considerInAppFramesByDefault = false;
options.addInAppInclude(APP_PACKAGE_NAME);
```

Without this, every frame in a stack trace — including third-party package internals — is treated as
equally relevant "in-app" code. Setting `considerInAppFramesByDefault` to `false` and explicitly listing
the app's own package name collapses and greys out third-party frames in the Sentry dashboard, so a stack
trace reads top-to-bottom as the app's own call path instead of scrolling through framework internals.

---

## Screenshots, view hierarchy, and PII

```dart
options.attachScreenshot = false;   // default
options.attachViewHierarchy = false; // default
options.sendDefaultPii = false;      // default
```

All three default off, deliberately. `attachScreenshot` and `attachViewHierarchy` attach a captured
screenshot / view-hierarchy snapshot to every event — useful for debugging layout-related issues, but they
count against the plan's attachment storage quota per-event, cost noticeable battery/bandwidth if many
events are logged, and can capture on-screen personal data (names, messages, anything visible at the moment
of the crash) without any redaction. `sendDefaultPii` opts into sending things like IP address and request
headers by default; leaving it off keeps that decision explicit rather than accidental.

Turning any of these on is a legitimate choice for a specific project — just make it deliberately, and
prefer Sentry's [Advanced Data Scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/advanced-datascrubbing/)
if screenshots or view hierarchy end up enabled and PII exposure becomes a concern.

One platform caveat: on iOS, automatic screenshot capture during a crash may fail because the UI thread
isn't available at that moment — another reason to leave `attachScreenshot` off by default on mobile
rather than special-case iOS.
