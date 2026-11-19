# Error Logging Contract: LoggerService, AsyncErrorLogger, Swallow vs. Propagate

This file is the single definition of how errors are logged. Skills that need it carry a byte-identical
copy (the toolkit validation script fails when a copy drifts). Edit the canonical file in
`scaffold-feature/references/` and copy it; never edit a copy alone.

A project that already has an equivalent (a different class name, a different file) keeps it. Match the
contract by shape, not by name.

---

## 1. LoggerService

The sink every layer logs through. Methods share one signature, positional and optional:

```dart
abstract interface class LoggerService {
  void t(String message, [Object? error, StackTrace? stackTrace]); // trace
  void d(String message, [Object? error, StackTrace? stackTrace]); // debug
  void i(String message, [Object? error, StackTrace? stackTrace]); // info
  void w(String message, [Object? error, StackTrace? stackTrace]); // warning
  void e(String message, [Object? error, StackTrace? stackTrace]); // error
  void f(String message, [Object? error, StackTrace? stackTrace]); // fatal
}
```

- Call `_logger.e('[order_list][application] fetch failed', error, stackTrace)`. Never named `error:` /
  `stackTrace:` arguments, and never a `package:logging` style named logger.
- Parameter names are `message`, `error`, `stackTrace`. Decorators and test fakes use the same names.
- Mocks: stub with the arity the code under test calls. A call `e(message, error, stackTrace)` is stubbed
  `when(() => logger.e(any(), any(), any()))`; a call that passes only the message needs `e(any())`.

### Injection

The logger is a provider, so a test can override it:

```dart
@Riverpod(keepAlive: true)
LoggerService loggerService(Ref ref) => const LoggerServiceImpl();
```

- A notifier reads it: `ref.read(loggerServiceProvider)`.
- A repository or datasource receives it in its constructor, from the provider that builds it:
  `ref.watch(loggerServiceProvider)`.
- The `[feature][layer]` tag stays in the message text, so one logger serves every layer.

---

## 2. AsyncErrorLogger

A `ProviderObserver` that reports provider failures Riverpod has already caught into `AsyncError`. It is a
**channel** (where errors arrive from), not a sink. The sink is `loggerServiceProvider`.

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderException;

final class AsyncErrorLogger extends ProviderObserver {
  const AsyncErrorLogger();

  @override
  void providerDidFail(
    ProviderObserverContext context,
    Object error,
    StackTrace stackTrace,
  ) {
    if (error is ProviderException) return;              // one root failure, one report
    if (context.provider == loggerServiceProvider) return; // never recurse through the sink's own failure

    final logger = context.container.read(loggerServiceProvider);
    logger.e(
      'Provider ${context.provider.name ?? context.provider.runtimeType} error',
      error,
      stackTrace,
    );
  }
}
```

Register it once, where the container is built:

```dart
ProviderScope(
  observers: [const AsyncErrorLogger()],
  child: const MyApp(),
)
```

Why each line is there:

1. **`providerDidFail`, not `didUpdateProvider`.** Riverpod v3 replaced the `ProviderBase` /
   `ProviderContainer` parameters with one `ProviderObserverContext` and added a failure hook.
   `didUpdateProvider` plus a pattern match on `AsyncError` misses synchronous provider failures.
2. **The `ProviderException` guard.** Without it, one root failure reports once per dependent provider in
   the chain.
3. **Resolve the sink through `context.container.read(...)`**, never a hand-built instance. A hand-built
   `AsyncErrorLogger(SomeLogger())` means `loggerServiceProvider.overrideWithValue(FakeLogger())` in a
   test never reaches the observer.
4. **The sink guard.** If the logger provider itself fails, reporting that failure through the logger
   fails again.
5. **`final class` and the `misc.dart` import.** In Riverpod 3.x `ProviderObserver` is a `base` class, so a
   subclass must be `base`, `final` or `sealed`, and `ProviderException` is exported by `misc.dart`, not by
   the main library (checked against `riverpod` / `flutter_riverpod` 3.5.0). In a pure Dart package import
   `package:riverpod/misc.dart` instead.

### Detecting an existing observer

A project has the contract when some `ProviderObserver` overrides `providerDidFail`, is registered in
`observers:` of a `ProviderScope` or `ProviderContainer`, and sends the error to a logger or crash sink.
Name does not matter (`AsyncErrorLogger`, `AsyncErrorObserver`, ...). Grep for `providerDidFail` and
`observers:`.

- Found: use it; do not add a second one.
- Not found: add `AsyncErrorLogger` as above. Until then, errors in async providers are not reported
  anywhere, and removing a `try/catch` that logs them would silence them.

---

## 3. Swallow vs. propagate

A `catch` block either **propagates** or **swallows**:

- **Propagates** (rethrows, or lets the provider state become `AsyncError`): do not log. `AsyncErrorLogger`
  reports it once the state settles. Logging here as well reports the same failure twice.
- **Swallows** (returns, or falls back without rethrowing): the error never reaches an `AsyncError`
  state, so the observer never sees it. This is the only place a manual `logger.e(...)` call belongs, and
  the only place an expected-error filter can see the application state it needs.

```dart
Future<void> loadInitialData() async {
  try {
    final data = await fetchFromNetwork();
    await db.save(data);
  } catch (e, st) {
    final hasCachedData = await db.isNotEmpty();
    if (!hasCachedData) rethrow;                     // propagates: AsyncErrorLogger reports it, do not log
    // From here on the error is swallowed, because a fallback exists.
    if (e is DioException && e.response == null) {
      return;                                        // expected offline: do not report
    }
    ref.read(loggerServiceProvider).e('Initial data load failed', e, st); // unexpected and swallowed: report
  }
}
```

The `catch` rethrows or logs, never both, so each failure is reported once.

---

## 4. Auditing and review rules that depend on this contract

- **No manual error `try/catch` in a notifier mutation** when the observer exists (audit rule
  APP-NOTIF-02). With no observer registered, the audit reports one project-level finding first.
- **Plain `Ref ref`** in function providers, never the v2 per-provider generated `Ref` type.
- **Reviewer check:** a `catch` that logs and also rethrows or sets `AsyncError`; a `catch` that swallows
  without calling the logger; a `providerDidFail` override without the `ProviderException` guard.
