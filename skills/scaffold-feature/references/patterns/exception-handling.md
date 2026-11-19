# Exception Handling – Feature Exceptions & Service Layer

**Goal:** Ensure every exception in the domain and application layers is typed,
testable, and extends the project's base hierarchy. Callers distinguish errors
by *type*, never by string matching.

---

## 1. Hierarchy rule

```
AppException  (abstract base, in the project's core)
  └── FeatureException  (sealed, domain/)
        ├── FetchOrderException
        ├── SendOrderException
        └── FeatureUnauthenticatedException
```

- **`AppException`** — the project's abstract base class, provides `code` + `message`.
- **Sealed feature exception** — one per feature, in `domain/exceptions/`.
  Lets callers catch all feature errors with a single `on FeatureException`, and
  `switch` over the concrete exceptions exhaustively.
- **Concrete exceptions** — one per error scenario. Immutable, `const`-constructable.
  Declare them in the same file as the sealed class: Dart only allows a `sealed`
  class to be extended inside its own library.

---

## 2. Where to put exceptions

| Layer | Location |
|---|---|
| Repository errors | `domain/exceptions/<feature>_exceptions.dart` |
| Service / auth errors | same file, same hierarchy |
| Cross-feature | the project's core exceptions folder, next to `AppException` |

Never define exceptions in `data/` or `presentation/`. The domain layer owns
the contract; data/presentation only throw what is defined there.

---

## 3. Typed exception for auth / guard conditions in services

When a service method has a precondition (e.g. user must be authenticated),
throw a **typed** exception — not `Exception('message string')`.

**Bad — untyped, brittle**

```dart
void _ensureAuthenticated() {
  if (_userId == null) throw Exception('User not authenticated');
}
```

Tests must match on `toString()`, break on any rewording, and cannot
distinguish this from other exceptions.

**Good — typed, testable**

```dart
// domain/exceptions/validate_trajectory_exceptions.dart
sealed class ValidateTrajectoryException extends AppException {
  const ValidateTrajectoryException({required super.code, required super.message});
}

class ValidateTrajectoryUnauthenticatedException extends ValidateTrajectoryException {
  const ValidateTrajectoryUnauthenticatedException()
      : super(code: 'unauthenticated', message: 'User not authenticated');
}
```

```dart
// service
void _ensureAuthenticated() {
  if (_userId == null) throw const ValidateTrajectoryUnauthenticatedException();
}
```

Tests assert on type:

```dart
expect(
  () => service.sendOrder(order),
  throwsA(isA<ValidateTrajectoryUnauthenticatedException>()),
);
```

This is immune to message rewording and gives callers a clean catch target.

---

## 4. Constructor checklist

- `const` constructor (no mutable fields).
- Hardcoded `code` string (snake_case, feature-prefixed, e.g. `validate-trajectory-unauthenticated`).
- Default `message` using `.hardcoded` extension.
- Optional `details` (`String?`) for context from the upstream error.

```dart
class SendOrderException extends ValidateTrajectoryException {
  const SendOrderException({String? details})
      : super(
          code: 'send-order-failed',
          message: 'Failed to send trajectory order'.hardcoded,
        );
}
```

---

## 5. Do NOT

- `throw Exception('...')` or `throw StateError('...')` in domain / application code.
- Expose `FirebaseException`, `DioException`, or any infrastructure type
  outside the data layer.
- Add `catch (e) { rethrow; }` with no conversion — convert to a domain exception.
