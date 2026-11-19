# Pattern: Pre-stub Non-nullable Returns

## The Problem

`mocktail`'s `when()` evaluates its closure **synchronously** to record the call. That evaluation actually invokes the mock method. For methods with non-nullable return types (`Stream<T>`, `Future<String>`, `List<T>`), the unregistered mock returns `null`, causing a Dart sound-null-safety runtime `TypeError` **before** the stub is registered.

This produces a cryptic failure:

```
type 'Null' is not a subtype of type 'Stream<ValidateTrajectoryOrder?>'
```

And a cascade: the failed `when()` leaves mocktail in a corrupted verification state, producing `Bad state: Verification appears to be in progress` in subsequent tests.

## When it Occurs

- Any `when()` call for a method returning `Stream<T>`, `Future<T>` (non-nullable T), or `List<T>`
- Specifically: the **first** `when()` in a test for that method, when no prior stub exists

## The Fix: Pre-stub in `setUp()`

Stub every non-nullable-returning method with a safe default **in `setUp()`**, before any test-specific `when()` calls.
`LoggerService` methods are positional, `(message, [error, stackTrace])`: stub the arity your code calls (see `error-logging-contract.md`).

```dart
setUp(() {
  mockRepo = MockFooRepository();
  mockLogger = MockLoggerService();

  // Pre-stub logger (always — these are fire-and-forget with null return)
  when(() => mockLogger.i(any())).thenReturn(null);
  when(() => mockLogger.d(any())).thenReturn(null);
  when(() => mockLogger.e(any(), any(), any())).thenReturn(null);

  // Pre-stub non-nullable repository returns
  when(() => mockRepo.sendOrder(any())).thenAnswer((_) async => '');   // Future<String>
  when(() => mockRepo.sendStopOrder(any())).thenAnswer((_) async => ''); // Future<String>
  when(() => mockRepo.watchOrder(any())).thenAnswer((_) => const Stream.empty()); // Stream<T>
});
```

Individual tests then **override** specific stubs as needed:

```dart
test('given valid order when sendOrder called then returns orderId', () async {
  when(() => mockRepo.sendOrder(any()))
      .thenAnswer((_) async => 'order-123'); // overrides the setUp default

  final result = await service.sendOrder(order);
  expect(result, 'order-123');
});
```

## Named Parameter Gotcha

For named parameters, use `any(named: 'paramName')` in the pre-stub, NOT positional `any()`:

```dart
// WRONG — mocktail won't match the named param
when(() => mockService.sendStopOrder(any())).thenAnswer((_) async => '');

// CORRECT
when(
  () => mockService.sendStopOrder(scenarioId: any(named: 'scenarioId')),
).thenAnswer((_) async => '');
```

## Checklist

Before writing any `when()` call in a test, ask:

1. Does this method return a non-nullable type?
2. Is there already a stub for this method in `setUp()`?

If the answer to (1) is yes and (2) is no — add the pre-stub to `setUp()` first.
