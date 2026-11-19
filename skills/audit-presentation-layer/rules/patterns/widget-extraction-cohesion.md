<!-- source: local (flutter-toolkit) -->
# Widget Extraction, Cohesion & Coupling in the Presentation Layer

**Goal:** Widgets that are small, single-purpose, and depend only on what they
actually need. Grounded in two classic principles (Head First Design Patterns):

- **Single Responsibility** — a class should have one reason to change. A
  200-line `build` method changes for header reasons, list reasons, and footer
  reasons at once.
- **Principle of Least Knowledge (Law of Demeter)** — talk only to your
  immediate friends. A widget that receives a whole entity but reads two fields
  is coupled to the entity's entire shape.

Plus the clean-architecture **dependency rule**: source dependencies point
inward. Presentation depends on application/domain — never on `data/`.

---

## 1. Oversized `build` methods (EXTRACT-01)

A `build` method beyond ~80 lines is a cohesion smell: it composes several
logical sections (header, form, list, actions) that each change independently.

Extract each section into a **private widget class** (not a helper method —
see `widget-classes-no-build-helpers.md` for why classes beat methods:
element identity, `const`-ability, isolated rebuilds, devtools visibility).

```dart
// ✅ GOOD — screen build reads as a table of contents
@override
Widget build(BuildContext context) {
  return Scaffold(
    appBar: AppBar(title: const Text('Booking')),
    body: const Column(
      children: [
        _BookingHeader(),
        Expanded(child: _BookingSlotList()),
        _BookingActionBar(),
      ],
    ),
  );
}
```

Each extracted class can be `const`, which also makes it rebuild-immune
(see `rebuild-isolation.md` §1).

---

## 2. Functions returning `Widget` (EXTRACT-02)

LAYOUT-02 flags private *methods* returning `Widget`. The same problem applies
to **top-level and `static` functions** returning `Widget`: no element of their
own, no `const`, rebuilt inline with the caller, invisible in the widget
inspector.

```dart
// ❌ BAD — top-level function widget
Widget buildAvatar(String url) => CircleAvatar(backgroundImage: NetworkImage(url));

// ✅ GOOD — widget class
class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.url});
  final String url;
  @override
  Widget build(BuildContext context) =>
      CircleAvatar(backgroundImage: NetworkImage(url));
}
```

---

## 3. Pass fields, not whole objects (COHESION-01)

When a widget's constructor takes a full entity/state object but its `build`
reads only one or two fields, the widget knows too much:

- It rebuilds (or is re-instantiated non-`const`) when *any* field changes.
- It cannot be reused with data from another source.
- Tests must construct the entire entity to render a label.

```dart
// ❌ BAD — knows the whole Booking, uses two fields
class BookingTile extends StatelessWidget {
  const BookingTile({super.key, required this.booking});
  final Booking booking;
  @override
  Widget build(BuildContext context) =>
      ListTile(title: Text(booking.pilotName), subtitle: Text(booking.slotLabel));
}

// ✅ GOOD — Law of Demeter: depends only on what it renders
class BookingTile extends StatelessWidget {
  const BookingTile({super.key, required this.pilotName, required this.slotLabel});
  final String pilotName;
  final String slotLabel;
  @override
  Widget build(BuildContext context) =>
      ListTile(title: Text(pilotName), subtitle: Text(slotLabel));
}
```

**Exception:** a widget that legitimately renders *most* of the object
(a detail card showing 5+ fields) should keep the object parameter. The rule
targets ≤ 2 fields used.

---

## 4. No `data/` imports in presentation (COUPLING-01)

Presentation must consume state via application-layer providers and domain
types. Importing a repository implementation, datasource, or data model from a
widget couples the UI to infrastructure and bypasses the single-error-channel
and caching semantics of the application layer.

```dart
// ❌ BAD — widget reaches two layers down
import '../../data/repository/firestore_booking_repository.dart';

// ✅ GOOD — widget watches the application-layer provider
import '../../application/booking_service.dart';
final bookings = ref.watch(bookingListProvider);
```

Fix: route the call through an application provider/notifier; if none exists,
that is the missing abstraction to create — not a reason to import `data/`.

---

## 5. No cross-feature presentation imports (COUPLING-02)

`features/a/presentation/` importing `features/b/presentation/` creates a
lateral dependency web: feature B can no longer change (or be deleted) without
recompiling and re-testing feature A.

Options, in order of preference:

1. **Navigate** — if feature A only needs to *show* feature B's screen, use the
   router (`context.goNamed(...)`), not a direct widget embed.
2. **Promote to shared UI** — if a widget is genuinely reused by 2+ features,
   move it to the shared/common UI package (e.g. `lib/src/common_widgets/` or
   the design-system package) and have both features depend on it.
3. **Duplicate deliberately** — two similar-but-diverging widgets are often
   cheaper than one coupled one.

---

## DO / DON'T summary

**DO**
- Keep `build` methods under ~80 lines; extract sections as private widget classes.
- Give every reusable fragment a widget class with `const` constructor.
- Pass primitives/small value objects into leaf widgets.
- Depend on application providers and domain entities only.

**DON'T**
- Write `Widget`-returning helper functions (methods, statics, or top-level).
- Hand a whole entity to a widget that renders two fields.
- Import `data/` or another feature's `presentation/` from a widget.
