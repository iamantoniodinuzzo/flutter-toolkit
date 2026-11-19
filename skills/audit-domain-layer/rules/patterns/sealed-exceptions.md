# Sealed exception hierarchies (exhaustive error handling)

Complements `exception-handling.md`. That doc establishes the hierarchy
(`AppException` → feature sealed exception → concrete `const` classes). This doc covers
**sealing** that hierarchy so the compiler — not a runtime check — guarantees every error state
is handled.

---

## 1. Seal the feature exception base

```dart
// domain/exceptions/validate_trajectory_exceptions.dart
sealed class ValidateTrajectoryException extends AppException {
  const ValidateTrajectoryException({required super.code, required super.message});
}

final class ValidateTrajectoryUnauthenticatedException extends ValidateTrajectoryException {
  const ValidateTrajectoryUnauthenticatedException()
      : super(
          code: 'validate-trajectory-unauthenticated',
          message: 'User not authenticated'.hardcoded,
        );
}

final class SendOrderException extends ValidateTrajectoryException {
  const SendOrderException({String? details})
      : super(
          code: 'send-order-failed',
          message: 'Failed to send trajectory order'.hardcoded,
        );
}
```

Dart 3's `sealed` restricts subclassing to the declaring library, so all concrete leaves must
live in the same file (or use `part`/`part of` to split a large hierarchy across files that are
still one library). Mark leaves `final class` where practical — it documents intent, though it
is a recommendation here, not an enforced rule (see §5).

## 2. Why `sealed`, not plain `abstract`

An `abstract` base gives callers `on FeatureException catch (e)` — useful, but the compiler
can't tell them whether they handled every specific error. A `sealed` base additionally makes a
`switch` over the type exhaustive:

```dart
String messageFor(ValidateTrajectoryException e) => switch (e) {
  ValidateTrajectoryUnauthenticatedException() => 'Please sign in again',
  SendOrderException() => 'Could not send the order — try again',
};
```

Add a third concrete exception later and this `switch` fails to compile until it's handled —
the exact guarantee `audit-presentation-layer` should lean on when reviewing error-mapping code.
No rule is added there in this change; this doc exists so that skill (or a human) has something
to point at.

## 3. Why not Freezed

The technique this doc is based on (bizz84, *Domain-Driven Exception Handling*, 2022) generates
these unions with Freezed, and names build-runner codegen latency as its own biggest drawback.
That was necessary before Dart 3. `sealed class` + pattern-matching `switch` gives the same
exhaustiveness check with zero codegen, so the toolkit does not recommend Freezed for this here.

## 4. Why per-feature, not one global exception union

The source material leaves open whether to collapse everything into one app-wide sealed union
instead of one per feature. Keep it per-feature:

- A single global union means every feature's exceptions live in one file — any feature adding
  an error state forces a rebuild of every `switch` over that union, even in unrelated features.
- A `switch` consuming the global union must handle cases it can never actually receive (an auth
  error arriving at a booking screen's error mapper), which defeats the exhaustiveness benefit
  instead of delivering it.

Cross-feature domain types are already covered by `DOMAIN-COUPLE-02`: if a type is genuinely used
by 3+ features, it belongs in a shared/core domain module, not in one feature's sealed union.

## 5. Streams

The same sealed exception types are the error channel for `Stream<T>` as for `Future<T>` — do
not wrap stream errors in a `Result<E, T>`; let them propagate as the sealed type and handle them
with the same exhaustive `switch` at the point they're caught.

## 6. Related rules

- `DOMAIN-FAIL-01` — bans untyped `throw Exception(...)` etc. in domain/application.
- `DOMAIN-FAIL-02` — flags a feature exception base declared `abstract` instead of `sealed`.
- `DATA-REPO-01` (audit-data-layer) — repository methods must catch and convert to a typed
  domain exception at the infra boundary.
