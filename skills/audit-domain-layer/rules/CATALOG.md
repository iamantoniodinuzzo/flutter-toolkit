# Audit Domain Layer — Rule Catalog

Each rule has: ID, severity, source doc, detection heuristic, fix hint, and whether
auto-fix is safe (`autofix_safe`). Phase 3 of the skill scans using this catalog.

---

## Dependency isolation rules

### DOMAIN-DEP-01
- **Severity**: error
- **Source**: `rules/patterns/repository-pattern.md`
- **What**: Domain file imports an infrastructure, data-layer, or Flutter framework package
  (`cloud_firestore`, `http`, `dio`, `firebase_core`, `hive`, `sqflite`, `drift`,
  `flutter/material`, or similar). The domain layer must be framework-free — it must compile
  without the Flutter SDK; it may only import Dart core, `riverpod_annotation`,
  and other domain packages.
- **Heuristic**: in any `.dart` file under `domain/`, find `import 'package:<pkg>/` where
  `<pkg>` is one of: `cloud_firestore`, `firebase_core`, `firebase_auth`, `firebase_storage`,
  `http`, `dio`, `retrofit`, `hive`, `hive_flutter`, `sqflite`, `drift`, `isar`,
  `shared_preferences`, `flutter` (any `package:flutter/...` import — `material`, `widgets`,
  `cupertino`, `foundation` included). Flag the import line.
- **Fix**: remove the infra import; depend only on domain interfaces/entities. Move the logic
  that requires the infra package to the data layer (Flutter types belong in presentation).
- **autofix_safe**: false (requires moving or restructuring logic)

### DOMAIN-COUPLE-01
- **Severity**: error
- **Source**: `rules/patterns/domain-cohesion-coupling.md`
- **What**: Domain file imports a project-internal `data/`, `application/`, or `presentation/`
  path — outward dependency from the innermost ring; inverts the clean-architecture dependency
  rule (everything depends on domain, domain depends on nothing outward). DOMAIN-DEP-01 covers
  external packages; this rule covers project-internal imports.
- **Heuristic**: in files under `domain/`, flag `import` lines whose path contains `/data/`,
  `/application/`, or `/presentation/` (relative like `../data/...` or package imports).
- **Fix**: invert the dependency — mapping belongs on the data-layer model
  (`toEntity()`/`Model.fromEntity()`, not `entity.toModel()`); values from services are passed
  as parameters; domain declares interfaces that outer layers implement; display formatting
  moves to presentation.
- **autofix_safe**: false (requires inverting the dependency)

### DOMAIN-COUPLE-02
- **Severity**: info
- **Source**: `rules/patterns/domain-cohesion-coupling.md`
- **What**: Cross-feature domain import (`features/<other>/domain/`). Sometimes legitimate
  (entities genuinely reference each other), but each one is a coupling seam: a type used by
  3+ features is shared-kernel material and belongs in a core/shared domain module.
- **Heuristic**: in files under `features/<name>/domain/`, flag `import` lines matching
  `features/<other-name>/domain/` where `<other-name>` differs from the file's own feature.
- **Fix**: if the imported type is used by 3+ features, move it to the core/shared domain
  module (e.g. `lib/src/core/domain/`); if the import pulls another feature's exceptions or
  repository interface, consider whether the calling logic belongs in that feature instead.
- **autofix_safe**: false (team decision per seam)

---

## Entity cohesion rules

### DOMAIN-COHESION-01
- **Severity**: warning
- **Source**: `rules/patterns/domain-cohesion-coupling.md`
- **What**: God entity — an entity/value-object class with more than ~15 instance fields, or a
  domain file exceeding ~400 lines. The class has absorbed several concepts that change for
  different reasons (identity, config, stats, preferences), bloating equality/`copyWith` and
  making presentation-side `.select()` watches coarse.
- **Heuristic**: in domain classes, count `final <Type> <name>;` instance field declarations;
  flag the class declaration line when > 15. Also flag files > 400 lines (on the line-1 class
  declaration) as a secondary signal.
- **Fix**: group fields that change together into value objects (e.g. `PilotLicense`,
  `PilotPreferences`, `FlightStats`) and compose them into a small aggregate root; each value
  object gets its own equality and validation.
- **autofix_safe**: false (field grouping is a domain-modeling decision)

---

## Exception typing rules

### DOMAIN-FAIL-01
- **Severity**: error
- **Source**: `rules/patterns/exception-handling.md`
- **What**: Domain or application code throws a generic exception (`Exception(...)`,
  `StateError(...)`, `ArgumentError(...)`, `FormatException(...)`) instead of a typed
  exception extending the project's `AppException` hierarchy.
- **Heuristic**: find `throw Exception(`, `throw StateError(`, `throw ArgumentError(`,
  `throw FormatException(`, `throw RangeError(` in files under `domain/` or `application/`.
  Also flag `throw` followed by a string literal as the thrown expression.
- **Fix**: define a concrete exception class extending the feature-level sealed exception
  (which extends `AppException`). Replace the generic throw with the typed exception.
  Place the exception class in `domain/exceptions/<feature>_exceptions.dart`.
- **autofix_safe**: false (exception class must be designed per project naming convention)

### DOMAIN-FAIL-02
- **Severity**: warning
- **Source**: `rules/patterns/sealed-exceptions.md`
- **What**: Feature-level exception base is declared `abstract class` instead of
  `sealed class`. Without `sealed`, callers cannot `switch` exhaustively over the exception type,
  so adding a new concrete error state later compiles silently unhandled anywhere it isn't caught.
- **Heuristic**: in files under `domain/`, find `abstract class <X> extends AppException` or
  `abstract class <X>Exception extends <Y>` where the declaration does not contain the `sealed`
  modifier. Flag the class declaration line. Do not flag concrete leaf classes (`class`/
  `final class` extending the abstract base).
- **Fix**: change `abstract class` to `sealed class`. All concrete subclasses must then live in
  the same library (same file, or split via `part`/`part of`) — this is a Dart 3 requirement of
  `sealed`, not a style choice.
- **autofix_safe**: false (sealing may require moving subclasses into the same file)

---

## Entity purity rules

### DOMAIN-ENT-01
- **Severity**: warning
- **Source**: `rules/patterns/feature-creation.md`
- **What**: Entity or value-object class in `domain/` contains JSON/map serialization
  logic (`fromJson`, `toJson`, `fromMap`, `toMap`, or a constructor/factory accepting
  `Map<String, dynamic>`). Domain entities must stay framework-free; serialization belongs
  in data-layer model classes.
- **Heuristic**: in files under `domain/` whose name does NOT end in `_model.dart`,
  find method or factory declarations matching:
  - `factory .+\.fromJson\(`
  - `factory .+\.fromMap\(`
  - `Map<String, dynamic> toJson\(`
  - `Map<String, dynamic> toMap\(`
  - constructor parameter typed `Map<String, dynamic>`
- **Fix**: extract serialization into a data-layer model class (e.g. `data/models/<name>_model.dart`)
  with a `toEntity()` mapper method that returns the domain entity.
- **autofix_safe**: false (extraction requires adding a new model file and mapper)

---

## UI string rules

### DOMAIN-STR-01
- **Severity**: info
- **Source**: `rules/patterns/no-ui-strings-outside-ui.md`
- **What**: Hardcoded user-facing string literal (≥ 20 chars, > 3 words) in a domain file —
  strings intended for display should live in the presentation layer or be expressed as
  typed exception messages via `.hardcoded`. A `.hardcoded`-suffixed literal, or a `message:`/
  `code:` argument inside an exception's `super(...)` call, is domain data (see
  `patterns/exception-handling.md` §4), not UI copy — presentation maps display text from the
  exception *type*, not from this string. These are exempt from this rule.
- **Heuristic**: in `.dart` files under `domain/`, find string literals matching
  `'[A-Za-z ]{20,}'` or `"[A-Za-z ]{20,}"` that are not in `//` comments, are not assigned to
  identifiers named `url`, `path`, `key`, `tag`, `code`, `name`, `id`, are not immediately
  followed by `.hardcoded`, and are not the value of a `message:` or `code:` named argument
  inside a `super(...)` call within a class extending `AppException` (directly or transitively).
- **Fix**: replace the raw string with a typed exception `message` field (using `.hardcoded`
  extension) or move user-visible copy to a presentation-layer `AppLocalizations` key.
- **autofix_safe**: false (typed enum / l10n design is project-specific)

---

## Adding new rules

1. Add a rule block here following the schema above.
2. Update `SKILL.md` rule count in the usage examples if desired.
3. No other files need changing — Phase 3 reads this catalog at runtime.
