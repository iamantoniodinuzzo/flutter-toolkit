---
name: unit-test
description: "Generate, update, or repair unit tests for a Flutter feature path or single Dart class. Knows what to test (domain models, services, notifiers, providers, exceptions) and what to skip (widgets, generated code, Firebase repos). Stresses code with adversarial edge cases instead of merely satisfying it — expected values come from the contract, never from running the code; red tests that expose real bugs are reported, never weakened. Uses mocktail, GWT pattern, Riverpod 3.x ProviderContainer, and an incremental run-fix cycle targeting ≥80% coverage. Use proactively when the user asks to write, generate, add, fix, or improve unit tests for any feature, class, service, notifier, or provider — even if they just say \"write tests for X\" or \"add test coverage to Y\"."
user-invocable: true
---

# unit-test

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

## Pattern References

For complex Riverpod scenarios, read the relevant pattern file **before** writing any code:

| Pattern | File |
|---|---|
| StreamProvider overrides (`AsyncData` vs `Stream.value`) | `patterns/stream-provider-overrides.md` |
| Notifier whose `build()` watches a StreamProvider | `patterns/notifier-with-stream-deps.md` |
| Computed provider that returns `AsyncValue<T>` synchronously | `patterns/computed-async-value-providers.md` |
| Fixture helper functions and `makeContainer` factory | `patterns/fixture-helpers.md` |
| FutureProvider error paths and `container.pump()` | `patterns/future-provider-error-paths.md` |
| Pre-stub non-nullable returns (`Stream<T>`, `Future<String>`) | `patterns/prestub-nonnullable-returns.md` |
| `verify()` + `verifyInOrder()` clash in mocktail 1.0.x | `patterns/verify-verifyinorder-antipattern.md` |
| Notifier with internal `ref.listen` in action method | `patterns/notifier-with-internal-ref-listen.md` |
| Adversarial edge-case catalog per input type | `patterns/edge-case-catalog.md` — read **before Phase 7**, always |
| Test quality gate (anti-tautology, mutation mindset) | `patterns/test-quality-gate.md` — read **before Phase 9.5**, always |

---

## Phase 0 — Testability Check

Run only when the argument is a **single `.dart` file**. Skip if the argument is a feature folder.

Read the file and classify:

| Signal | Decision |
|---|---|
| `extends StatelessWidget / StatefulWidget / ConsumerWidget / State` | **Stop** — belongs to widget tests. Tell the user. |
| Filename ends in `.g.dart` or `.freezed.dart` | **Stop** — generated code, never hand-tested. |
| Top-level class is `abstract` with no factory constructor | **Stop** — not instantiable; test concrete subclasses. |
| All collaborators injected via constructor or provider | **Proceed** |
| Directly instantiates `FirebaseFirestore` / `FirebaseAuth` without injection | **Warn** — hard to unit-test; suggest refactoring or integration test. Offer to test what is feasible. |

---

## Phase 1 — Gap Detection

If a test file already exists for the target, **read it first**.

1. Read the source — list every public method, factory constructor, computed getter, thrown exception.
2. Read the existing test — extract all `group(...)` and `test(...)` names.
3. Diff: methods with no group → create it. Methods with a group but missing branches → add the missing `test(...)` inside. Exception classes with no property tests → add an exception group (Phase 6).
4. Append new `group` blocks at the end of `main()`. Never restructure existing tests.

If no test file exists, skip to Phase 2.

---

## Phase 2 — Discovery

Before writing a line of test code:

1. **Read the target file(s)** — every public API, constructor param, dependency, thrown exception.
2. **Read the central mocks file** — the package's shared mocks file (usually `test/src/mocks.dart`; find it with `grep -rl "extends Mock implements" test/`). Reuse every mock that exists there.
3. **Grep sibling test files** — `test/src/features/<feature>/` — for locally declared mocks.
4. For each dependency: does `class Mock<Dep>` already exist? Use it; never redeclare.

> Rule: grep first. `grep -r "implements FooRepository" test/` (from the package root)

When scanning a **feature folder**, exclude from scope:
- `presentation/` — widget tests, out of scope
- `*.g.dart`, `*.freezed.dart` — generated
- Abstract repository interfaces — test via the concrete mock in service tests

Prioritise in this order:
1. Domain models (entities, value objects, exceptions)
2. Pure utilities / helpers
3. Application services with few deps
4. Riverpod Notifiers / AsyncNotifiers / Controllers
5. Repository implementations only if a `FakeFirestore` in-memory fake is feasible

**Skip with stated reason**: Firebase repos requiring real network, widgets, pure DTOs with zero logic, trivial getters/setters with no logic, classes whose only behavior is delegating a call to an injected dependency (a test there verifies the mock, not the subject).

---

## Phase 3 — File Location + Header

Mirror `lib/` exactly under `test/src/`:

```
lib/src/features/foo/application/foo_service.dart
→ test/src/features/foo/application/foo_service_test.dart
```

Every test file starts with:

```dart
@Timeout(Duration(seconds: 5))
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
// feature imports...

// Always this relative path from test/src/features/<feature>/<layer>/
import '../../../mocks.dart';

// Local mocks — only what doesn't exist in mocks.dart
class MockFooRepository extends Mock implements FooRepository {}
```

- `@Timeout` + `library;` — always, in that order.
- Use `//` at library level, never `///` (triggers `dangling_library_doc_comments` lint).
- `Listener<T>` is already in `mocks.dart` — import it, never redeclare.

**Central mocks policy**: add a mock to `mocks.dart` only when used by 2+ different features. Single-feature mocks stay in their own test file.

---

## Phase 4 — Mocktail Strategy

Use **mocktail** exclusively. Never use mockito even if legacy `.mocks.dart` files exist nearby.

```dart
late MockFooRepository mockRepo;

setUpAll(() {
  registerFallbackValue(FooEntity.empty()); // required for every type passed to any() / captureAny()
});

setUp(() => mockRepo = MockFooRepository());
tearDown(() => reset(mockRepo));
```

```dart
// Stub
when(() => mockRepo.getItems()).thenAnswer((_) async => [item]);
when(() => mockRepo.watch()).thenAnswer((_) => Stream.value([item]));
when(() => mockRepo.doVoid()).thenAnswer((_) async {});

// Verify
verify(() => mockRepo.save(any())).called(1);
verifyNever(() => mockRepo.delete(any()));

// Capture
final captured = verify(() => mockRepo.save(captureAny()))
    .captured.single as FooEntity;
```

### Pre-stub non-nullable returns — REQUIRED

> See `patterns/prestub-nonnullable-returns.md` for full explanation.

`when()` evaluates its closure synchronously, calling the mock before the stub is registered. For methods returning `Stream<T>`, `Future<String>`, or any non-nullable type, the unregistered mock returns `null` and Dart's sound null-safety throws a `TypeError` immediately — corrupting mocktail's state for subsequent tests.

**Rule**: in `setUp()`, stub every method that returns a non-nullable type with a safe default, before any test-specific `when()`:

```dart
setUp(() {
  mockRepo = MockFooRepository();
  when(() => mockRepo.sendOrder(any())).thenAnswer((_) async => '');     // Future<String>
  when(() => mockRepo.watchOrder(any())).thenAnswer((_) => const Stream.empty()); // Stream<T>
});
```

For named parameters use `any(named: 'paramName')`:

```dart
when(
  () => mockService.sendStopOrder(scenarioId: any(named: 'scenarioId')),
).thenAnswer((_) async => '');
```

### `verify()` + `verifyInOrder()` — do not mix

> See `patterns/verify-verifyinorder-antipattern.md` for full explanation.

In mocktail 1.0.x, calling `verify()` on a mock before `verifyInOrder()` on the same mock marks all recorded calls as `[VERIFIED]`, leaving nothing for `verifyInOrder` to match.

**Rule**: never mix both in the same test. For order assertions use only `verifyInOrder`. For count assertions use only `verify`. For `AsyncNotifier` final state — skip `Listener` entirely and assert `container.read(provider)` directly.

---

## Phase 5 — Riverpod 3.x Patterns

### Container

```dart
// Preferred — auto-disposes, no addTearDown needed
final container = ProviderContainer.test(overrides: [...]);

// Legacy — keep in existing files that already use it
final container = ProviderContainer();
addTearDown(container.dispose);
```

### Override strategy table

| Situation | Override |
|---|---|
| Simple provider (non-notifier) | `provider.overrideWithValue(mock)` |
| Replace whole Notifier | `provider.overrideWith(MockNotifier.new)` |
| Seed state, keep real methods | `provider.overrideWithBuild((ref) => state)` |
| Testing StreamProvider itself | `provider.overrideWith((ref) => Stream.value(v))` — starts AsyncLoading, must `await` |
| Computed provider consuming stream | `streamDep.overrideWithValue(AsyncData(v))` — synchronous, no `await` |

> For StreamProvider and Notifier-with-stream-deps patterns, read the pattern files listed above.

### Sync Notifier

```dart
final container = ProviderContainer.test();
container.read(counterProvider.notifier).increment();
expect(container.read(counterProvider), 1);
```

### AsyncNotifier — happy path

```dart
when(() => mockRepo.fetchFoo('1')).thenAnswer((_) async => expectedFoo);
final container = ProviderContainer.test(
  overrides: [fooRepositoryProvider.overrideWithValue(mockRepo)],
);
await container.read(fooProvider.notifier).loadFoo('1');
final state = container.read(fooProvider);
expect(state, isA<AsyncData<Foo>>());
expect(state.requireValue, expectedFoo);
```

### State transition spy

```dart
final states = <AsyncValue<Foo>>[];
container.listen<AsyncValue<Foo>>(
  fooProvider,
  (_, next) => states.add(next),
  fireImmediately: true,
);
await container.read(fooProvider.notifier).loadFoo('1');
expect(states, [isA<AsyncLoading<Foo>>(), isA<AsyncData<Foo>>()]);
```

For call-count assertions use `Listener<T>` from `mocks.dart`:

```dart
final listener = Listener<AsyncValue<Foo>>();
container.listen(fooProvider, listener.call, fireImmediately: true);
verify(() => listener(any(), isA<AsyncData<Foo>>())).called(1);
```

### Direct stream testing

When the class under test exposes a `.stream` property directly (not via a Riverpod provider), call `expectLater` **before** the action — values already emitted cause a 30-second timeout:

```dart
// CORRECT — subscribe before triggering emissions; do NOT await this line
expectLater(
  controller.stream,
  emitsInOrder([
    const AsyncLoading<void>(),
    const AsyncData<void>(null),
  ]),
);
await controller.doAction(); // emissions happen here
```

When you cannot match all properties of an emitted value (e.g. `AsyncError` has an unpredictable stack trace), use a `predicate`:

```dart
expectLater(
  controller.stream,
  emitsInOrder([
    const AsyncLoading<void>(),
    predicate<AsyncValue<void>>((value) {
      expect(value, isA<AsyncError<void>>());
      return true;
    }),
  ]),
);
```

> Prefer `container.listen` (state transition spy above) for Riverpod providers. Use direct stream testing only when the class exposes `.stream` independently of any provider.

### Keep autoDispose provider alive

```dart
final sub = container.listen(fooProvider, (_, __) {});
addTearDown(sub.close);
expect(sub.read(), expected);
```

### Family provider

```dart
container.read(fooProvider('id').notifier).doSomething();

// Isolation: one family instance must not affect another
expect(container.read(fooProvider('id-1')), expectedForId1);
expect(container.read(fooProvider('id-2')), defaultState);
```

> For FutureProvider error paths (AsyncError, `container.pump()`), read `patterns/future-provider-error-paths.md`.

### Notifier with internal `ref.listen` in an action method

> See `patterns/notifier-with-internal-ref-listen.md` for full explanation.

When a Notifier calls `ref.listen(someStreamProvider(id), callback)` inside an action (not in `build()`), the stream subscription is created on-demand. To test state transitions:

1. Override the **service** provider — the stream provider resolves through it automatically.
2. Use `StreamController` (not `Stream.value`) for fine-grained emission control.
3. `await Future<void>.value()` after each emission to pump the microtask queue.
4. `addTearDown(streamController.close)` — always.

```dart
final streamController = StreamController<FooOrder?>();
addTearDown(streamController.close);

when(() => mockService.watchOrder('order-123'))
    .thenAnswer((_) => streamController.stream);

await container.read(fooControllerProvider.notifier).sendOrder(scenarioId: 'sc-1');

streamController.add(FooOrder(status: OrderStatus.completed, ...));
await Future<void>.value(); // pump microtasks

expect(container.read(fooControllerProvider).phase, FooPhase.completed);
```

**Testability smell**: flag in Phase 10 if a Notifier uses internal `ref.listen`. The controller conflates send + watch responsibilities, making tests depend on microtask scheduling. Recommend the UI watch the stream provider directly instead.

---

## Phase 6 — Domain Model & Exception Checklist

### Entity / value object

```dart
test('given valid json when fromJson called then parses correctly', ...);
test('given missing required field when fromJson called then throws FormatException', ...);
test('given two equal instances then operator== returns true', ...);
test('given two equal instances then hashCode is equal', ...);
test('given copyWith when called then preserves unchanged fields', ...);
test('given copyWith with clearX:true when called then clears nullable field', ...);
```

### Exception hierarchy

Add a `group('FooException', ...)` for every `*_exception.dart`. Per each concrete subclass verify:

| Property | Assert |
|---|---|
| `code` | Exact string |
| `message` | Contains interpolated values (id, name) where present |
| `details` | `null` by default; set when passed to constructor |
| `toString()` with details | Contains `'details: <value>'` |
| `toString()` without details | Does NOT contain `'details:'` |

---

## Phase 7 — Coverage & Adversarial Strategy (target ≥ 80%)

> Read `patterns/edge-case-catalog.md` **before** this phase, always.

| Scenario | Priority |
|---|---|
| Happy path with valid input | Must |
| Adversarial inputs from the catalog, for every input type present in the signature | Must |
| Each distinct branch / conditional — **both** true and false sides | Must |
| Boundary equality case for every `<` / `<=` / `isBefore` comparison | Must |
| Each exception the method can throw | Must |
| Unauthenticated / unauthorized access (if applicable) | Must |
| Idempotency — calling twice gives correct result | Should |
| Concurrent call while first is in-flight (see catalog) | Should |
| Family state isolation | Should |

Rules:
- **Expected values come from the contract** (doc comments, names, domain rules, call sites) — never from running the code and copying its output. If the expectation cannot be deduced without executing the code, flag the behavior as under-specified in Phase 10 instead of blessing the current output.
- `DateTime.utc(year, month, day)` — never `DateTime.now()`.
- `expectLater(() => sut.method(), throwsA(isA<FooException>()))` for async throws.
- `expect(sut.method, throwsA(...))` for sync throws with no args (tear-off, preferred); `expect(() => sut.method(arg), throwsA(...))` with args.
- **Never** `expect(sut.method(), throwsA(...))` — the function is evaluated before `expect` can intercept the throw.
- No `print` statements in tests.

---

## Phase 8 — Incremental Cycle

For each class:

1. **Write** — generate or update the test file.
2. **Run** — from the root of the package that owns the file under test (the folder with its `pubspec.yaml`):
   ```bash
   flutter test test/src/features/<path>/<file>_test.dart
   ```
3. **Triage red** — a failing test is a signal, not an error to silence. In order:
   1. Determine the **intended** behavior from spec, doc comments, names, domain rules, and call sites — not from the implementation.
   2. Test wrong (bad expectation, broken mock setup, missing pre-stub) → fix the test.
   3. Code wrong → do **not** touch production code and do **not** weaken the assert to make it pass. Keep the test red, annotate it with `// BUG: <expected behavior> — <what the code does instead>`, and report it in Phase 10.
   4. Genuinely ambiguous which is right → report as under-specified in Phase 10; leave the contract-derived assertion in place.
4. Repeat until green (except intentional `// BUG:` reds), then move to the next class.

Full feature run when all individual files pass:

```bash
flutter test test/src/features/<feature-path>
```

---

## Phase 9 — Static Analysis

```bash
dart analyze test/src/features/<feature-path>
```

Fix **errors** only (`error` severity). Ignore warnings and info — filter output to your changed files.

---

## Phase 9.5 — Quality Gate

> Read `patterns/test-quality-gate.md` **before** this phase, always.

Run the gate checklist on every test file written or modified this session:

1. **Anti-tautology** — every expected value traceable to the contract, not to observed output.
2. **Mutation check** — for each test, name a plausible bug that would fail it; strengthen or delete tests that survive every mutation (`isNotNull`-only, type-check-only, verify-only asserts).
3. **Both branch sides** covered for every conditional touched.
4. **Anti-patterns deleted** — mock-testing, over-verification, implementation-detail asserts, placeholder tests.
5. Re-run affected files after any change.

---

## Phase 10 — Final Summary

Report:
- Tests created / updated and total passing / failing.
- **Bugs found in production code** — intentional red tests marked `// BUG:`, with expected vs actual behavior.
- **Under-specified behaviors** — cases where the contract does not determine the expected value.
- Quality gate outcome — tests strengthened or deleted, with reason.
- What was intentionally skipped and why.
- Static analysis errors (errors only).
- Mocks reused from `mocks.dart` vs newly declared.
- Any testability issues found (Firebase deps without injection, etc.).
