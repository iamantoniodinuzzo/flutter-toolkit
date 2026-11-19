<!-- source: local (flutter-toolkit) -->
# Domain Layer — Cohesion & Coupling Rules

**Goal:** A domain layer that is the innermost, most stable ring of the
architecture: pure Dart, zero knowledge of other layers or features, made of
small cohesive entities and value objects.

Grounding:

- **Clean-architecture dependency rule** — everything depends on domain; domain
  depends on nothing outward. Any import of `data/`, `application/`, or
  `presentation/` from a domain file inverts the whole architecture.
- **Single Responsibility / high cohesion** (Head First Design Patterns) — an
  entity that accretes every field remotely related to its noun becomes a god
  object with dozens of reasons to change.
- **DDD aggregates & value objects** — group fields that change together into
  value objects; keep aggregates small.

---

## 1. No outward layer imports (DOMAIN-COUPLE-01)

`DOMAIN-DEP-01` bans external infra *packages* (`cloud_firestore`, `dio`, …).
This rule bans **project-internal** outward imports, which are just as fatal:

```dart
// ❌ BAD — domain entity knows its own persistence model
import '../data/models/booking_model.dart';

// ❌ BAD — domain "validator" reads notifier state
import '../application/booking_service.dart';

// ❌ BAD — domain exception imports a widget for its message
import '../presentation/widgets/booking_error_banner.dart';
```

Typical root causes and fixes:

- **Entity references its model** (e.g. a `toModel()` convenience) → mapping
  belongs in the data layer: the *model* has `toEntity()` / `Model.fromEntity()`
  (Adapter direction points inward).
- **Domain logic needs a service value** → pass it in as a method/constructor
  parameter; domain declares *interfaces*, outer layers implement them.
- **Domain wants to format for display** → it must not; expose typed
  values/exceptions, let presentation map them to strings (see
  `no-ui-strings-outside-ui.md`).

Also fatal: `import 'package:flutter/...'` in domain — the domain must compile
without the Flutter SDK (pure `dart test`, reuse in CLI/server contexts).
`DOMAIN-DEP-01` covers this.

---

## 2. Cross-feature domain imports (DOMAIN-COUPLE-02)

`features/a/domain/` importing `features/b/domain/` is sometimes legitimate
(a `Booking` genuinely references a `Pilot`), but each such import is a seam
worth examining:

- **One or two imports** of a stable neighboring entity — acceptable; document
  why.
- **A type used by 3+ features** — it is *shared kernel* material: move it to a
  core/shared domain module (e.g. `lib/src/core/domain/`) so features depend on
  core, not on each other.
- **Import of another feature's exceptions or repository interface** — usually
  a sign the calling code belongs in that other feature.

Severity is `info`: the audit surfaces the seam, the team decides.

---

## 3. God entities (DOMAIN-COHESION-01)

An entity with 15+ fields (or a 400+ line file) has usually absorbed several
concepts that change for different reasons:

```dart
// ❌ BAD — one class, four concepts
class Pilot {
  // identity
  final String id; final String name; final String email;
  // license
  final String licenseNo; final DateTime licenseExpiry; final List<String> ratings;
  // preferences
  final bool darkMode; final String locale; final bool notifications;
  // stats
  final int totalFlights; final Duration totalHours; final DateTime lastFlight;
}

// ✅ GOOD — cohesive value objects composed into a small aggregate
class Pilot {
  final String id;
  final PilotIdentity identity;
  final PilotLicense license;
  final PilotPreferences preferences;
  final FlightStats stats;
}
```

Benefits: each value object gets its own equality/validation, `copyWith`
churn shrinks, `.select()` watches in the presentation layer become natural
(`pilot.license.expiry`), and tests construct only the fragment they need.

---

## DO / DON'T summary

**DO**
- Keep domain files importing only Dart core, other domain files, and allowed annotations (`riverpod_annotation`).
- Declare interfaces in domain; let data/application implement them.
- Move types shared by 3+ features into a core/shared domain module.
- Split 15+-field entities into value objects grouped by change-reason.

**DON'T**
- Import `data/`, `application/`, `presentation/`, or `package:flutter/` from domain.
- Put `toModel()` on entities — mapping lives on the model (data layer).
- Let one entity accumulate identity + config + stats + preferences.
