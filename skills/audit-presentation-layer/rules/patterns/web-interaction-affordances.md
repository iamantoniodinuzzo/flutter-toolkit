<!-- source: local (flutter-toolkit) -->
## Web Interaction Affordances in Flutter – Complete Guide

**Goal:** Understand why Flutter widgets intended for touch may be invisible or
inaccessible on web/desktop, and how to add hover and keyboard affordances so
users on pointer-based devices get correct visual feedback and keyboard access.

---

### 1. The problem: touch widgets are transparent to pointer/keyboard

`GestureDetector` and `InkWell` handle tap gestures, but on web/desktop:

- **No hover cursor change** — the browser cursor stays an arrow; users cannot
  tell the widget is interactive.
- **No keyboard focus** — `Tab` navigation skips the widget; keyboard-only users
  cannot activate it.
- **Accessibility tree gap** — screen readers on web may not announce the widget
  as interactive without a `Semantics` role.

Flutter does not automatically promote these affordances when compiling to web.

---

### 2. Known antipatterns and how to fix them

#### 2.1 Bare `GestureDetector` without `MouseRegion`

```dart
// ❌ BAD on web — cursor stays arrow, no hover indication
GestureDetector(
  onTap: () => _handleTap(),
  child: const Text('Click me'),
)
```

Fix:

```dart
// ✅ GOOD — cursor changes to pointer on hover
MouseRegion(
  cursor: SystemMouseCursors.click,
  child: GestureDetector(
    onTap: () => _handleTap(),
    child: const Text('Click me'),
  ),
)
```

#### 2.2 `InkWell` without keyboard `Focus`

`InkWell` has built-in ink-splash on tap and can receive focus if `focusNode` is
provided — but by default it is not keyboard-activatable:

```dart
// ❌ BAD — no keyboard activation
InkWell(
  onTap: () => _handleTap(),
  child: const Padding(
    padding: EdgeInsets.all(8),
    child: Text('Action'),
  ),
)
```

Fix — use `FocusableActionDetector` to bind Enter/Space to the tap:

```dart
// ✅ GOOD — hover cursor + keyboard activation
FocusableActionDetector(
  mouseCursor: SystemMouseCursors.click,
  actions: {
    ActivateIntent: CallbackAction<ActivateIntent>(
      onInvoke: (_) => _handleTap(),
    ),
  },
  child: InkWell(
    onTap: () => _handleTap(),
    child: const Padding(
      padding: EdgeInsets.all(8),
      child: Text('Action'),
    ),
  ),
)
```

Or for simpler cases, supply a `focusNode` + `onFocusChange` to `InkWell` and
wrap in `MouseRegion(cursor: SystemMouseCursors.click, ...)`.

#### 2.3 Custom card / list-tile tappable areas

Any custom interactive surface built from `Stack`, `Container`, or `Column`
with a `GestureDetector` at the root needs both affordances:

```dart
// ❌ BAD
GestureDetector(
  onTap: _open,
  child: Container(
    decoration: ...,
    child: const CardContent(),
  ),
)

// ✅ GOOD
MouseRegion(
  cursor: SystemMouseCursors.click,
  child: Focus(
    child: GestureDetector(
      onTap: _open,
      child: Container(
        decoration: ...,
        child: const CardContent(),
      ),
    ),
  ),
)
```

---

### 3. When this rule does NOT apply

- **`ElevatedButton`, `TextButton`, `FilledButton`, `OutlinedButton`,
  `IconButton`** — Flutter's `ButtonStyleButton` family already handles cursor,
  focus, and hover natively. No additional wrapping needed.
- **`ListTile`** — provides `mouseCursor` and focus built-in.
- **`Tooltip`** — wraps child in `MouseRegion` internally.
- **Non-interactive display widgets** — `Text`, `Image`, `Icon` without a tap
  handler do not need `MouseRegion`.

---

### 4. General DO / DON'T rules

**DO NOT:**
- Use `GestureDetector(onTap: ...)` without `MouseRegion` on widgets that should
  be interactive on web.
- Use `InkWell(onTap: ...)` for surfaces that must be keyboard-navigable without
  adding keyboard affordance (Focus/FocusableActionDetector or `focusNode`).

**DO:**
- Wrap custom tap targets in `MouseRegion(cursor: SystemMouseCursors.click, ...)`
  when targeting web.
- Use `FocusableActionDetector` when you need hover + keyboard in one widget.
- Prefer Flutter's built-in button widgets (`ElevatedButton`, `InkWell` with
  `focusNode`, etc.) over bare `GestureDetector` for semantically interactive
  elements.
- Add `Semantics(button: true, label: '…')` for custom interactive surfaces that
  need proper a11y annotation.

---

### 5. Practical refactoring patterns

- **`GestureDetector(onTap: ...)` on web** → wrap in
  `MouseRegion(cursor: SystemMouseCursors.click, child: GestureDetector(...))`.
- **`InkWell` needing keyboard** → replace with `FocusableActionDetector` wrapping
  `InkWell`, bind `ActivateIntent` to the tap handler.
- **Card / tile custom surfaces** → use `InkWell` with `focusNode` + `MouseRegion`
  instead of `GestureDetector`.
