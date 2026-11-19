# Sentry Initialization Flow — Approach Comparison

> Adapted from internal production notes.

---

## The Three Approaches

### Approach 1 — Hybrid (pre-init outside, app inside appRunner)

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Pre-init (FutureProviders, SharedPreferences, etc.)
  final container = ProviderContainer();
  await container.read(sharedPreferencesProvider.future);

  await SentryFlutter.init(
    (options) {
      options.dsn = sentryDsn;
      options.environment = flavorName;
    },
    appRunner: () => runApp(
      UncontrolledProviderScope(container: container, child: MyApp()),
    ),
  );
}
```

Feels unbalanced: some init before `SentryFlutter.init`, some inside `appRunner`. Grows messy as the app matures.

**⚠ Causes `zoneMismatch` error on Flutter web — do not use.**

---

### Approach 2 — Everything inside appRunner

```dart
Future<void> main() async {
  await SentryFlutter.init(
    (options) {
      options.dsn = sentryDsn;
      options.environment = flavorName;
    },
    appRunner: () async {
      final container = ProviderContainer();
      await container.read(sharedPreferencesProvider.future);
      runApp(UncontrolledProviderScope(container: container, child: MyApp()));
    },
  );
}
```

Concise — `WidgetsFlutterBinding.ensureInitialized()` is not required because `SentryFlutter.init` calls it internally. But everything is nested inside the callback, which complicates removal of Sentry later.

---

### Approach 3 — Everything outside appRunner ✅ Recommended

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Pre-Sentry init (Firebase, URL strategy, emulators, etc.)

  await SentryFlutter.init((options) {
    options.dsn = sentryDsn;
    options.environment = flavorName;
  });
  // No appRunner argument — runApp called manually below.

  // Post-init (ProviderContainer creation, async provider preloading, etc.)
  final container = ProviderContainer();
  await container.read(sharedPreferencesProvider.future);

  runApp(
    SentryWidget(
      child: UncontrolledProviderScope(container: container, child: MyApp()),
    ),
  );
}
```

`WidgetsFlutterBinding.ensureInitialized()` is not strictly required here (Sentry calls it), but keeping it adds clarity and is required if anything runs before `SentryFlutter.init`.

---

## Why Approach 3

| Criterion | Approach 1 | Approach 2 | Approach 3 |
|-----------|-----------|-----------|-----------|
| Flutter web compatibility | ⚠ zoneMismatch | ✓ | ✓ |
| Linear init sequence | ✗ split | ✓ | ✓ |
| Easy Sentry removal | ✗ | ✗ tangled | ✓ clean |
| Idiomatic async main | ✓ | partial | ✓ |

Approach 3 wins on all axes. The init sequence is a plain top-to-bottom `async main()` with no nesting.

---

## Critical Ordering Rule

Sentry must initialize **before** the first `ProviderContainer` read, because provider logic may call the logger immediately, and the logger decorator must find Sentry ready.

```
WidgetsFlutterBinding.ensureInitialized()
  ↓
[Firebase / platform init]
  ↓
SentryFlutter.init(...)           ← Sentry ready
  ↓
ProviderContainer(...)            ← first provider read is safe
  ↓
runApp(SentryWidget(...))
```

Do not swap the order of `SentryFlutter.init` and `ProviderContainer` creation.

---

## DSN Empty-String Gate

Always guard `SentryFlutter.init` with a DSN presence check so local dev (without `dart_defines.json`) never touches the Sentry SDK:

```dart
final dsn = const String.fromEnvironment('SENTRY_DSN');
if (dsn.isNotEmpty) {
  await SentryFlutter.init((options) {
    options.dsn = dsn;
    // ... other options
  });
}
```

This pattern makes the Sentry init entirely opt-in at compile time — no configuration needed for local development or unit tests.
