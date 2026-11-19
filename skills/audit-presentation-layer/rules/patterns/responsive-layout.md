<!-- source: local (flutter-toolkit) -->
## Responsive Layout in Flutter – Complete Guide

**Goal:** Understand why hard-coded sizes and `MediaQuery.size`-based branching
are fragile, and how to build layouts that adapt fluidly to any screen or window
size.

---

### 1. Why hard-coded sizes break

Flutter runs on phones, tablets, foldables, desktop windows, and browsers. A
`width: 360.0` or an `if (MediaQuery.of(context).size.width < 600)` baked into
widget code ties the layout to a snapshot of one device class:

- **Refactors relocate widgets** — a widget moved to a different screen inherits
  wrong assumptions.
- **Window resizing** — desktop and web windows resize continuously; a static
  breakpoint check fires only once at build time.
- **`LayoutBuilder` re-runs on constraint change** — `MediaQuery.size` in `build`
  does not.

---

### 2. Known antipatterns and how to fix them

#### 2.1 `MediaQuery.of(context).size` for layout branching

```dart
// ❌ BAD — reads screen size, not the widget's own available space
Widget build(BuildContext context) {
  final width = MediaQuery.of(context).size.width;
  if (width < 600) {
    return const MobileLayout();
  }
  return const DesktopLayout();
}
```

Fix: use `LayoutBuilder` so the decision is based on the widget's *own* constraints,
not the full screen size.

```dart
// ✅ GOOD
Widget build(BuildContext context) {
  return LayoutBuilder(
    builder: (context, constraints) {
      if (constraints.maxWidth < 600) {
        return const MobileLayout();
      }
      return const DesktopLayout();
    },
  );
}
```

#### 2.2 `MediaQuery.sizeOf` without `LayoutBuilder`

`MediaQuery.sizeOf(context)` (Flutter 3.10+) is more efficient than
`MediaQuery.of(context).size` because it only rebuilds when the *size* portion
changes — but it still reads the full screen size. Prefer `LayoutBuilder` for
any layout that needs to react to its own available space.

```dart
// ⚠️ ACCEPTABLE for informational uses (e.g. full-screen dialogs)
final size = MediaQuery.sizeOf(context);

// ❌ BAD for nested widget branching — use LayoutBuilder instead
final size = MediaQuery.sizeOf(context);
return size.width < 600 ? const Narrow() : const Wide();
```

#### 2.3 Hard-coded `width:` / `height:` on layout containers

```dart
// ❌ BAD — breaks on larger/smaller screens
Container(
  width: 360,
  height: 600,
  child: const FormPanel(),
)
```

Fixes depending on intent:

```dart
// ✅ Fractional sizing via FractionallySizedBox
FractionallySizedBox(
  widthFactor: 0.9,
  child: const FormPanel(),
)

// ✅ Flexible inside Row/Column
Flexible(
  flex: 2,
  child: const FormPanel(),
)

// ✅ Constraint-bounded via ConstrainedBox
ConstrainedBox(
  constraints: const BoxConstraints(maxWidth: 600),
  child: const FormPanel(),
)
```

#### 2.4 Exception — small decorative sizes

Hard-coded sizes are **acceptable** for icons, avatars, spacing, and decorative
elements where the semantic meaning is "this is 24 dp regardless of screen":

```dart
// ✅ Fine — icon size, spacing, avatar radius are intentionally fixed
const Icon(Icons.home, size: 24),
const SizedBox(height: 8),
CircleAvatar(radius: 20, ...),
```

The heuristic RESPONSIVE-01 targets **layout containers** (`Container`,
`SizedBox` used for structural sizing), not small fixed-size decorative elements.

---

### 3. General DO / DON'T rules

**DO NOT:**
- Use `MediaQuery.of(context).size` or `MediaQuery.sizeOf` for layout branching
  inside nested widgets — use `LayoutBuilder`.
- Hard-code `width:`/`height:` on `Container`/`SizedBox` used as structural
  layout — use fractional or `Flexible`/`Expanded` sizing.
- Store screen size in a variable at the top of `build` and use it for branching
  throughout the widget tree.

**DO:**
- Use `LayoutBuilder` when the widget needs to adapt to *its own* available width.
- Use `MediaQuery.sizeOf(context)` in top-level routes or dialogs that genuinely
  need the full screen size (e.g. hero-transition sizing, full-screen overlays).
- Use `Flexible`, `Expanded`, `FractionallySizedBox`, `AspectRatio`, or
  `ConstrainedBox` to express sizing intent without hard-coding pixels.
- Define breakpoint constants in one place (e.g. `AppBreakpoints.mobile = 600`)
  and consume them from `LayoutBuilder` constraints.

---

### 4. Practical refactoring patterns

- **Branching in `build` on screen size** → wrap the branching subtree in
  `LayoutBuilder`, switch on `constraints.maxWidth`.
- **Hard-coded `Container(width: N)`** → replace with `FractionallySizedBox`,
  `Flexible`, or `ConstrainedBox(constraints: BoxConstraints(maxWidth: N))`.
- **Reusable breakpoint helper** → extract a static method or extension:

```dart
extension BreakpointX on BoxConstraints {
  bool get isMobile => maxWidth < 600;
  bool get isTablet => maxWidth >= 600 && maxWidth < 1200;
  bool get isDesktop => maxWidth >= 1200;
}
```

---

### 5. Named breakpoints as a layout Strategy (RESPONSIVE-02)

Magic numbers scattered through widget code (`width > 600`, `< 840`, `>= 1240`)
drift out of sync: one screen switches at 600, another at 640, and the app has
no coherent size-class story.

Treat layout selection as a **Strategy pattern** (Head First Design Patterns,
ch. 1): encapsulate the varying part — *which layout for which constraint
class* — behind named breakpoints defined once.

```dart
// ❌ BAD — magic numbers, duplicated and divergent across screens
if (constraints.maxWidth > 600) { ... }
if (MediaQuery.sizeOf(context).width < 840) { ... }

// ✅ GOOD — single source of truth, self-documenting call sites
abstract final class AppBreakpoints {
  static const double compact = 600;   // Material 3 compact/medium boundary
  static const double expanded = 840;  // Material 3 medium/expanded boundary
}

LayoutBuilder(
  builder: (context, constraints) => switch (constraints.maxWidth) {
    < AppBreakpoints.compact => const _CompactLayout(),
    < AppBreakpoints.expanded => const _MediumLayout(),
    _ => const _ExpandedLayout(),
  },
)
```

Each `_XxxLayout` widget is a concrete strategy; the `switch` is the context
that picks one. Adding a size class touches one file.

---

### 6. `Row` with fixed-width children and no flex (RESPONSIVE-03)

A `Row` whose children have hard-coded widths overflows the moment the
available width shrinks below their sum (small phones, split-screen, resized
desktop windows) — the yellow-black overflow stripes.

```dart
// ❌ BAD — 200 + 200 + spacing > many phone widths
Row(children: [
  SizedBox(width: 200, child: _NameField()),
  SizedBox(width: 200, child: _DateField()),
])

// ✅ GOOD — children share whatever width exists
Row(children: [
  Expanded(child: _NameField()),
  const SizedBox(width: 16),
  Expanded(child: _DateField()),
])

// ✅ GOOD — or let items wrap to the next line
Wrap(spacing: 16, children: [ _NameField(), _DateField() ])
```

At least one child of every `Row` containing sized boxes should be
`Flexible`/`Expanded`, or the `Row` should become a `Wrap`.

---

### 7. Fixed `crossAxisCount` grids (RESPONSIVE-04)

`SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2)` renders two
columns on a phone *and* on a 32-inch monitor — giant cards on desktop, or
unreadably narrow ones if the count was tuned for desktop.

```dart
// ❌ BAD — column count frozen at design time
GridView.builder(
  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2),
  ...
)

// ✅ GOOD — column count derived from available width
GridView.builder(
  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
    maxCrossAxisExtent: 240, // each tile at most 240 wide; count adapts
    mainAxisSpacing: 8,
    crossAxisSpacing: 8,
  ),
  ...
)
```

`MaxCrossAxisExtent` expresses the *intent* ("tiles about this wide") and lets
the framework compute the count for any screen.
