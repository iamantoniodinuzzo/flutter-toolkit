# GoRouter Observer and Dio Breadcrumbs

> Adapted from internal production notes.

---

## SentryNavigatorObserver with GoRouter

`MaterialApp.router` does **not** have a `navigatorObservers` argument. When using GoRouter, add the observer to the `GoRouter` constructor instead:

```dart
final goRouter = GoRouter(
  initialLocation: '/',
  observers: [SentryNavigatorObserver()],  // ← correct placement
  routes: [...],
);

// In widget:
MaterialApp.router(routerConfig: goRouter);
```

For a Riverpod-generated router:

```dart
@riverpod
GoRouter router(Ref ref) {
  return GoRouter(
    observers: [SentryNavigatorObserver()],
    refreshListenable: RouterNotifier(ref),
    routes: [...],
  );
}
```

### Named Routes Requirement

`SentryNavigatorObserver` is only useful with **named routes**. Without route names, the observer cannot infer the route name and all breadcrumbs show `/unknown`.

Add `name:` to each `GoRoute` if not already present:

```dart
GoRoute(
  path: '/home',
  name: 'home',       // ← required for meaningful breadcrumbs
  builder: (ctx, s) => const HomeScreen(),
),
```

If the project has no named routes, emit an advisory rather than silently wiring a no-op observer.

---

## HTTP Breadcrumbs with sentry_dio

Install `sentry_dio`, then call `dio.addSentry()` when constructing the `Dio` client:

```dart
@Riverpod(keepAlive: true)
Dio dio(Ref ref) {
  final dio = Dio();
  if (kDebugMode) {
    dio.interceptors.add(LoggingInterceptor());
  }
  dio.addSentry();   // ← adds HTTP breadcrumbs for all requests
  return dio;
}
```

This adds `sentry-trace`, `baggage`, and `content-type` headers to all outgoing requests and logs HTTP breadcrumbs for each request/response.

### Web CORS Workaround

On Flutter web, the injected `sentry-trace` and `baggage` headers trigger CORS preflight failures when the target server does not allowlist them. Fix by clearing `tracePropagationTargets` in the `SentryFlutter.init` options block:

```dart
await SentryFlutter.init((options) {
  // ... other options
  options.tracePropagationTargets.clear(); // prevent CORS failures on web
});
```

Reference: [sentry-dart issue #3247](https://github.com/getsentry/sentry-dart/issues/3247)

---

## Sentry Breadcrumbs (automatic)

Sentry automatically collects breadcrumbs for:
- Console logs
- App lifecycle events (foreground, background)
- Network connectivity changes
- Device orientation changes
- Battery level changes

`SentryNavigatorObserver` adds route navigation events to this trail. `sentry_dio` adds HTTP request/response events.

---

## Sentry Example App

For a comprehensive tour of all available `SentryFlutterOptions`, see the official Flutter example: [getsentry/sentry-dart/flutter/example](https://github.com/getsentry/sentry-dart/tree/main/flutter/example). It demonstrates `debug`, `attachScreenshot`, `enableMetrics`, and many more options.

---

## Event Filtering, Sampling, and PII

`beforeSend`/`beforeSendFeedback` policy, sampling defaults, in-app frame clarity, and
screenshot/view-hierarchy PII defaults all live in
`references/event-filtering-and-sampling.md` — not repeated here.
