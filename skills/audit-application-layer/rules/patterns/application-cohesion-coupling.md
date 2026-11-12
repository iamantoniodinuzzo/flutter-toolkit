<!-- source: local (flutter-toolkit) -->
# Application Layer — Cohesion & Coupling Rules

**Goal:** Notifiers/services that orchestrate exactly one use-case family, and
depend only on abstractions — repository interfaces from the domain, injected
via the provider graph.

Grounding:

- **Dependency Inversion** — high-level policy (the notifier) must not depend
  on low-level detail (a datasource, a concrete repository impl). Both depend
  on abstractions: the repository interface declared in `domain/`.
- **Facade** (Head First Design Patterns, ch. 7) — the repository is the facade
  the application layer talks to; reaching past it into a datasource re-exposes
  the complexity the facade exists to hide (exception conversion, model→entity
  mapping, caching policy).
- **Command** (ch. 6) — each notifier exposes a cohesive family of commands
  (`Future<void>` mutations, see `async-notifier-command-api.md`). A notifier
  accumulating unrelated commands is a god invoker with many reasons to change.
- **Clean-architecture dependency rule** — application depends on domain (and
  data-layer providers via interfaces). It must never import `presentation/`.

---

## 1. Talk to the repository, not the datasource (APP-COUPLE-01)

A notifier importing or calling a datasource skips exception conversion
(typed domain exceptions), model→entity mapping, and caching policy — the
repository's whole job.

```dart
// ❌ BAD — notifier bypasses the facade
import '../data/datasource/booking_remote_datasource.dart';

class BookingListNotifier extends _$BookingListNotifier {
  Future<void> refresh() async {
    final models = await ref.read(bookingRemoteDatasourceProvider).fetchAll();
    state = AsyncData(models.map((m) => m.toEntity()).toList()); // mapping leaked here
  }
}

// ✅ GOOD — notifier sees only the domain-facing repository interface
import '../domain/booking_repository.dart';

class BookingListNotifier extends _$BookingListNotifier {
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(bookingRepositoryProvider).fetchAll(),
    );
  }
}
```

---

## 2. No presentation imports (APP-COUPLE-02)

Application code importing `presentation/` (a widget, a screen, `BuildContext`
helpers) points the dependency arrow backwards. The application layer signals
via **state**; presentation observes and reacts (`ref.listen` for one-shot
effects like snackbars and navigation).

```dart
// ❌ BAD — notifier navigates / shows UI directly
import '../presentation/widgets/error_snackbar.dart';

// ✅ GOOD — notifier sets state; a widget listens
state = AsyncError(BookingSlotTakenException(), StackTrace.current);
// presentation side:
ref.listen(bookingListProvider, (_, next) => next.showSnackBarOnError(context));
```

(Framework imports in general are covered by APP-DEP-01.)

---

## 3. Inject via providers, never construct (APP-COUPLE-03)

`FooRepositoryImpl()` hard-wired inside a notifier defeats Riverpod's dependency
graph: the dependency cannot be overridden in tests (`overrideWith`), swapped
per environment, or observed.

```dart
// ❌ BAD — concrete class welded in; untestable
class BookingListNotifier extends _$BookingListNotifier {
  final _repo = FirestoreBookingRepository(FirebaseFirestore.instance);
}

// ✅ GOOD — resolved through the graph; overridable in tests
class BookingListNotifier extends _$BookingListNotifier {
  BookingRepository get _repo => ref.read(bookingRepositoryProvider);
}
```

Test benefit, concretely:

```dart
ProviderContainer(overrides: [
  bookingRepositoryProvider.overrideWithValue(FakeBookingRepository()),
]);
```

---

## 4. One command family per notifier (APP-COHESION-01)

A notifier with 8+ public mutation methods (or a 300+ line file) is orchestrating
several use cases at once. Symptoms: its state type becomes a grab-bag, tests
set up unrelated fixtures, and every feature change touches the same file.

```dart
// ❌ BAD — booking CRUD + filters + export + notifications in one notifier
class BookingNotifier extends _$BookingNotifier {
  Future<void> create(...) {}
  Future<void> cancel(...) {}
  Future<void> reschedule(...) {}
  Future<void> setFilter(...) {}
  Future<void> clearFilters(...) {}
  Future<void> exportCsv(...) {}
  Future<void> emailReport(...) {}
  Future<void> toggleReminder(...) {}
}

// ✅ GOOD — one cohesive command family each, each with its own narrow state
class BookingCommandNotifier { create / cancel / reschedule }
class BookingFilterNotifier  { setFilter / clearFilters }
class BookingExportNotifier  { exportCsv / emailReport }
```

Split along **use-case boundaries** (what changes together), not method count
alone — the count is the smoke, not the fire. Smaller notifiers also produce
narrower provider watches, which shrinks presentation rebuilds.

---

## DO / DON'T summary

**DO**
- Depend on repository interfaces from `domain/`, resolved via `ref.watch`/`ref.read` of a provider.
- Signal outcomes through state; let presentation `ref.listen` for one-shot effects.
- Keep each notifier to one cohesive command family with a narrow state type.

**DON'T**
- Import or call datasources from application code.
- Import `presentation/` from application code.
- Construct repository/datasource implementations inside notifiers.
- Grow a notifier past ~7 public mutations without questioning its use-case boundary.
