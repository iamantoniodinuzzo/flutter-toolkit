# Structured Logging — Flutter Project Standard

## Format

```
[feature][layer] operation – key1=value1, key2=value2
```

- **feature**: snake_case feature name (e.g. `auth`, `order_list`)
- **layer**: one of `domain`, `data`, `application`, `presentation`
- **operation**: imperative verb phrase (e.g. `fetch user`, `map response`, `build state`)
- **key=value pairs**: relevant identifiers, counts, durations (no PII)

## Log levels

| Method | When |
|---|---|
| `t()` | Trace — very noisy, loop iterations, serialization |
| `d()` | Debug — method entry/exit, state transitions |
| `i()` | Info — meaningful business events (user action, network success) |
| `w()` | Warning — recoverable anomaly (fallback path, retried request) |
| `e()` | Error — caught exception with stack trace |
| `f()` | Fatal — unrecoverable state that warrants crash reporting |

## Logger access

Every method is `(String message, [Object? error, StackTrace? stackTrace])`: error and stack trace are
**positional**, never named. The logger is the `LoggerService` provider, injected so tests can override it.
The full interface and the provider are in `error-logging-contract.md`.

- **Notifier / controller**: `ref.read(loggerServiceProvider)`.
- **Repository / datasource**: receives a `LoggerService` in its constructor; the provider that builds it
  passes `ref.watch(loggerServiceProvider)`.
- **Widget**: `ref.read(loggerServiceProvider)` inside a callback, never in `build()`.

The `[feature][layer]` tag stays in the message text, so one logger serves every layer.

## AsyncErrorLogger rule

**Never** log errors inside async providers (Notifiers, StreamProviders, FutureProviders) when the `catch`
rethrows or lets the state become `AsyncError`. `AsyncErrorLogger` is a `ProviderObserver` that reports
those failures automatically. A `catch` that **swallows** the error is the one place to log by hand.
The observer's code, how to detect an existing one, and the swallow-vs-propagate rule are in
`error-logging-contract.md`.

```dart
// BAD — duplicates error logging
class OrderNotifier extends AsyncNotifier<List<Order>> {
  @override
  Future<List<Order>> build() async {
    try {
      return await ref.watch(orderRepositoryProvider).fetchAll();
    } catch (e, st) {
      ref.read(loggerServiceProvider).e('[order_list][application] fetch failed', e, st);
      rethrow; // logged twice
    }
  }
}

// GOOD — let AsyncErrorLogger handle it
class OrderNotifier extends AsyncNotifier<List<Order>> {
  @override
  Future<List<Order>> build() async {
    return ref.watch(orderRepositoryProvider).fetchAll();
  }
}
```

## Layer examples

### Data — datasource

```dart
class ProductDatasource {
  ProductDatasource(this._firestore, this._logger);
  final FirebaseFirestore _firestore;
  final LoggerService _logger;

  Future<ProductModel> fetchProduct(String id) async {
    _logger.d('[product][data] fetch product – id=$id');
    final doc = await _firestore.collection('products').doc(id).get();
    _logger.i('[product][data] product fetched – id=$id, exists=${doc.exists}');
    return ProductModel.fromMap(doc.data()!);
  }
}
```

### Data — repository impl (maps infrastructure errors to domain exceptions)

```dart
class ProductRepositoryImpl implements ProductRepository {
  ProductRepositoryImpl(this._datasource);
  final ProductDatasource _datasource;

  @override
  Future<Product> fetchProduct(String id) async {
    try {
      final model = await _datasource.fetchProduct(id);
      return model.toEntity();
    } on FirebaseException catch (e, st) {
      // Converts and propagates: no log here, AsyncErrorLogger reports the domain exception.
      // The infrastructure detail travels inside it.
      throw FetchProductException(details: e.code, originalException: e, stackTrace: st);
    }
  }
}
```

This `catch` propagates, so it does not log (see the AsyncErrorLogger rule above).

### Application — notifier side effect

```dart
Future<void> deleteProduct(String id) async {
  final logger = ref.read(loggerServiceProvider);
  logger.d('[product][application] delete – id=$id');
  state = const AsyncLoading();
  state = await AsyncValue.guard(() => ref.read(productRepositoryProvider).delete(id));
  logger.i('[product][application] delete complete – id=$id');
}
```

### Presentation — user-triggered action

```dart
void _onDeleteTapped(String id) {
  ref.read(loggerServiceProvider).d('[product][presentation] delete tapped – id=$id');
  ref.read(productNotifierProvider.notifier).deleteProduct(id);
}
```

## What NOT to log

- Passwords, tokens, full stack traces of expected validation errors
- Repeated identical log lines in tight loops (use `t()` + sampling)
- `state` after every micro-transition (log intent and outcome, not every step)
