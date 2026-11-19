# Audit Data Layer — Rule Catalog

Each rule has: ID, severity, source doc, detection heuristic, fix hint, and whether
auto-fix is safe (`autofix_safe`). Phase 3 of the skill scans using this catalog.

---

## Repository exception-handling rules

### DATA-REPO-01
- **Severity**: error
- **Source**: `rules/patterns/repository-pattern.md`, `rules/patterns/exception-handling.md`
- **What**: Repository implementation has a `catch` block that does not convert the caught
  infrastructure exception (`FirebaseException`, `DioException`, `SocketException`, etc.)
  into a typed domain exception extending `AppException`. A bare `rethrow` or an empty
  `catch` block with no `throw <TypedExceptionName>` leaks infra error types to callers.
- **Heuristic**: in repository files, find `catch` blocks (regex `}\s*catch\s*\(`) where
  the body does NOT contain `throw [A-Z]` within the next 5 lines (excluding blank lines
  and comment lines). Also flag `catch (e) { rethrow; }` patterns.
- **Fix**: replace generic catch-rethrow with a typed throw:
  ```dart
  on FirebaseException catch (e, s) {
    throw FetchUserException(details: e.message, originalException: e, stackTrace: s);
  } catch (e, s) {
    throw FetchUserException(details: e.toString(), originalException: e, stackTrace: s);
  }
  ```
  The typed exception must be defined in `domain/exceptions/`.
- **autofix_safe**: false (typed exception class name must be determined from project conventions)

---

## Leaky abstraction rules

### DATA-LEAK-01
- **Severity**: error
- **Source**: `rules/patterns/repository-pattern.md`
- **What**: Repository or datasource exposes raw framework types (`DocumentSnapshot`,
  `QuerySnapshot`, `Query`, `CollectionReference`, `DocumentReference`,
  `QueryDocumentSnapshot`, `Response`, `DioResponse`, `HttpClientResponse`) in public
  method signatures or `Stream`/`Future` return types. These types must not cross the
  data↔domain boundary.
- **Heuristic**: in public method declarations (not `_`-prefixed), find return type
  annotations containing any of the banned type names above. Also flag `Stream<DocumentSnapshot`,
  `Future<QuerySnapshot`, `Stream<Response`, `Future<Response` patterns.
- **Fix**: change return type to the corresponding domain entity or a typed list:
  - `Stream<QuerySnapshot>` → `Stream<List<DomainEntity>>`
  - `Future<DocumentSnapshot>` → `Future<DomainEntity>`
  Use `.withConverter` in Firestore queries and map the snapshot inside the repository.
- **autofix_safe**: false (requires mapping logic and domain entity knowledge)

---

## Model mapper rules

### DATA-MOD-01
- **Severity**: warning
- **Source**: `rules/patterns/repository-pattern.md`
- **What**: Data-layer model class lacks a `toEntity()` mapper method (or equivalent named
  constructor on the domain entity) to convert the model to its domain counterpart. Models
  without mappers force callers to access model fields directly, defeating the clean-arch boundary.
- **Heuristic**: in `*_model.dart` files or files under a `models/` directory, find class
  declarations and check that each class body contains at least one method matching
  `toEntity(` or a call returning the corresponding domain type. Flag the class declaration
  line if no such mapper is present.
- **Fix**: add a mapper method:
  ```dart
  DomainEntity toEntity() => DomainEntity(
    id: id,
    name: name,
    // ... map fields
  );
  ```
- **autofix_safe**: false (domain entity field names must be confirmed)

---

## Datasource exception rules

### DATA-EX-01
- **Severity**: error
- **Source**: `rules/patterns/exception-handling.md`
- **What**: Datasource (or any data-layer file) throws a generic stdlib exception
  (`Exception(...)`, `StateError(...)`, `Error(...)`, `ArgumentError(...)`) instead of a
  typed exception extending `AppException`. Callers cannot distinguish error types.
- **Heuristic**: in files under `data/`, find `throw Exception(`, `throw StateError(`,
  `throw Error(`, `throw ArgumentError(`. Do NOT flag `throw` of classes whose name ends
  in `Exception` and is project-defined (i.e. not a stdlib type from the list above).
- **Fix**: define a concrete datasource/feature exception extending the feature-level sealed
  exception (which extends `AppException`), and throw it instead. The exception class belongs
  in `domain/exceptions/`.
- **autofix_safe**: false (exception class name and code string are project-specific)

---

## Cohesion & coupling rules

### DATA-COUPLE-01
- **Severity**: error
- **Source**: `rules/patterns/data-cohesion-coupling.md`
- **What**: Data-layer file imports an `application/` or `presentation/` path — upward
  dependency that inverts the clean-architecture dependency rule
  (`presentation → application → domain ← data`), creating cycles and making the data
  layer untestable in isolation.
- **Heuristic**: in files under `data/`, flag `import` lines whose path contains
  `/application/` or `/presentation/` (relative or package imports).
- **Fix**: depend only on `domain/` types. If the repository needs a caller-held value,
  take it as a method parameter; if it wants to influence UI state, return/throw domain
  types and let the application layer map them.
- **autofix_safe**: false (requires re-routing the dependency)

### DATA-COUPLE-02
- **Severity**: warning
- **Source**: `rules/patterns/data-cohesion-coupling.md`
- **What**: Cross-feature data import (`features/<other>/data/`) — couples two features'
  infrastructures; the other feature cannot change its persistence independently.
- **Heuristic**: in files under `features/<name>/data/`, flag `import` lines matching
  `features/<other-name>/data/` where `<other-name>` differs from the file's own feature.
- **Fix**: inject the other feature's repository *interface* (defined in its `domain/`)
  via the provider graph, or promote genuinely shared infra (API client, DB handle) to a
  core/shared module (Facade over shared infrastructure).
- **autofix_safe**: false (architectural decision per import)

### DATA-COHESION-01
- **Severity**: warning
- **Source**: `rules/patterns/data-cohesion-coupling.md`
- **What**: God repository/datasource — more than ~10 public methods, or method names
  referencing ≥ 3 distinct entity nouns. Single Responsibility violation: every consumer
  depends on the full surface; one storage abstraction should serve one aggregate /
  access pattern.
- **Heuristic**: in repository/datasource classes, count public (non-`_`) method
  declarations; flag the class declaration line when > 10. Additionally, extract the
  entity noun from each method name (e.g. `fetchBookings` → `Booking`) and flag when
  ≥ 3 distinct nouns appear.
- **Fix**: split into one repository per aggregate (the entity cluster that changes
  together) — e.g. `BookingRepository`, `UserPrefsRepository`, `FleetRepository` — and
  update the provider graph accordingly.
- **autofix_safe**: false (class split with call-site and provider updates)

### DATA-COHESION-02
- **Severity**: warning
- **Source**: `rules/patterns/data-cohesion-coupling.md`
- **What**: One datasource class importing both remote infra (`dio`, `http`,
  `cloud_firestore`) and local storage (`hive`, `sqflite`, `shared_preferences`, `drift`,
  `isar`) — mixes the system of record with derived/cached data; the caching policy gets
  smeared across fetch methods instead of living in the repository (DDIA: source of truth
  vs derived data).
- **Heuristic**: in datasource files, flag the class declaration when the file's imports
  include at least one of {`dio`, `http`, `cloud_firestore`, `firebase_storage`} AND at
  least one of {`hive`, `hive_flutter`, `sqflite`, `shared_preferences`, `drift`, `isar`}.
- **Fix**: split into `<X>RemoteDatasource` (source of truth) and `<X>LocalDatasource`
  (cache); move the reconciliation policy (read-through, write-through, TTL, offline
  fallback) into the repository implementation, which acts as the facade.
- **autofix_safe**: false (class split and policy relocation)

---

## Adding new rules

1. Add a rule block here following the schema above.
2. Update Phase 3 file-type routing in `SKILL.md` if the rule applies only to specific
   file classifications.
3. No other files need changing — Phase 3 reads this catalog at runtime.
