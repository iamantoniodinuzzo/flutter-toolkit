<!-- source: local (flutter-toolkit) -->
# Data Layer — Cohesion & Coupling Rules

**Goal:** Data-layer classes that each own exactly one storage concern, behind
stable domain-facing APIs, with dependencies pointing strictly inward.

Grounding:

- **Clean-architecture dependency rule** — source dependencies point inward:
  `presentation → application → domain ← data`. Data may import domain (entities,
  exceptions, repository interfaces). It must never import `application/` or
  `presentation/`.
- **Facade pattern** (Head First Design Patterns, ch. 7) — the repository is a
  facade over one or more datasources; callers see one simple, domain-typed API.
- **Single Responsibility** — a repository that manages three aggregates has
  three reasons to change.
- **Designing Data-Intensive Applications** — encapsulate storage engine details
  behind stable APIs (ch. 3); keep the *system of record* distinct from
  *derived data* such as caches (ch. 11): a remote datasource is the source of
  truth, a local datasource is derived/cached state, and only the repository
  should know how they reconcile.

---

## 1. No upward imports (DATA-COUPLE-01)

A data file importing `application/` or `presentation/` inverts the dependency
rule: infrastructure now depends on UI/state orchestration, creating import
cycles and making the data layer untestable in isolation.

```dart
// ❌ BAD — repository imports the notifier it serves
import '../../application/booking_service.dart';

// ✅ GOOD — repository knows only domain types
import '../../domain/booking.dart';
import '../../domain/exceptions/booking_exceptions.dart';
```

Typical root causes and fixes:

- **Repository needs a value the notifier holds** (e.g. current user id) →
  pass it as a method parameter.
- **Repository wants to emit UI state** → it must return/throw domain types;
  the application layer maps them to state.

---

## 2. No cross-feature data imports (DATA-COUPLE-02)

`features/a/data/` importing `features/b/data/` couples two infrastructures:
feature B cannot change its persistence without breaking feature A.

Options, in order of preference:

1. **Depend on B's domain interface** — if A needs B's *data*, inject B's
   repository interface (defined in B's `domain/`) into A's repository or
   service; the wiring happens in the provider graph, not via a data import.
2. **Promote shared infra to core** — a shared API client, database handle, or
   serialization helper belongs in a core/shared module both features import.

---

## 3. One repository per aggregate (DATA-COHESION-01)

A repository with 10+ public methods, or whose method names reference several
unrelated entity nouns (`fetchBookings`, `saveUserPrefs`, `uploadAircraftPhoto`),
has become a god class. Every consumer depends on the full surface; every
change risks all of them.

```dart
// ❌ BAD — three aggregates behind one class
abstract class AppRepository {
  Future<List<Booking>> fetchBookings();
  Future<void> saveBooking(Booking b);
  Future<UserPrefs> fetchPrefs();
  Future<void> savePrefs(UserPrefs p);
  Future<List<Aircraft>> fetchFleet();
  Future<void> uploadAircraftPhoto(String id, Uint8List bytes);
  // ...
}

// ✅ GOOD — one cohesive repository per aggregate
abstract class BookingRepository { /* bookings only */ }
abstract class UserPrefsRepository { /* prefs only */ }
abstract class FleetRepository { /* aircraft only */ }
```

Split along **aggregate boundaries** (the entity cluster that changes
together), not along CRUD verbs.

---

## 4. Split remote and local datasources (DATA-COHESION-02)

One datasource class that imports both remote infra (`dio`, `http`,
`cloud_firestore`) and local storage (`hive`, `sqflite`, `shared_preferences`,
`drift`, `isar`) is mixing the system of record with its derived cache. The
caching policy ends up smeared across fetch methods and cannot be tested or
changed independently.

```dart
// ❌ BAD — network + cache tangled in one class
class BookingDatasource {
  final Dio _dio;
  final Box _hiveBox;
  Future<BookingModel> fetch(String id) async {
    final cached = _hiveBox.get(id);
    if (cached != null) return cached;
    final res = await _dio.get('/bookings/$id');
    ...
  }
}

// ✅ GOOD — repository mediates; each datasource owns one concern
class BookingRemoteDatasource { /* dio only — source of truth */ }
class BookingLocalDatasource  { /* hive only — derived cache */ }

class BookingRepositoryImpl implements BookingRepository {
  // read-through / write-through policy lives here, in one place
}
```

The repository (facade) is the only class that knows the reconciliation
policy: read-through, write-through, TTL, offline fallback.

---

## DO / DON'T summary

**DO**
- Import only `domain/` (and core/shared modules) from data files.
- Inject other features' repository *interfaces* instead of importing their data layer.
- Keep one repository per aggregate; split when method nouns diverge.
- Separate remote (source of truth) from local (cache) datasources; put the caching policy in the repository.

**DON'T**
- Import `application/` or `presentation/` from `data/`.
- Reach into another feature's `data/` directory.
- Grow repositories past ~10 public methods without questioning the aggregate boundary.
- Mix `dio`/`http`/`cloud_firestore` with `hive`/`sqflite`/`shared_preferences`/`drift`/`isar` in one datasource class.
