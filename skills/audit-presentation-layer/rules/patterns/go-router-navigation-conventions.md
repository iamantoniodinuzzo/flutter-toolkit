<!-- source: iamantoniodinuzzo/flutter_ai_toolkit @ bac1f742129af4c111381d9cdb576a3e90f1b412 -->
## GoRouter navigation conventions (Flutter)

Use this guide in apps that use GoRouter to avoid inconsistent navigation code.

### 1) Prefer GoRouter APIs for app navigation

In screens/pages:

- prefer `context.go(...)`, `context.push(...)`
- for back navigation, prefer `context.pop(...)`

---

### 2) Dialogs: `Navigator.pop` vs `context.pop`

Both are acceptable. Team convention: use `context.pop(...)` when the file
already depends on GoRouter for uniform style.

---

### 3) Returning values from dialogs

- Dialog validates input and returns a value via `pop(value)`.
- Caller awaits `showDialog<T>()` and performs async work outside the dialog.

---

### 4) `go` vs `push` on web: URL behavior (go_router v11.1.2+)

**Breaking change**: `push` no longer updates the browser URL. Use `go` to update the address bar.

| Method | Browser URL updated | Flutter stack |
|--------|---------------------|---------------|
| `context.go(path)` | Yes | Rebuilds full stack to match path |
| `context.push(path)` | **No** | Adds on top of current stack |
| `context.replace(path)` | Yes (replaces current entry) | Replaces top |

```dart
// ✅ Navigates AND updates browser URL (use for deep-linkable screens)
context.goNamed(AppRoute.someScreen.name, pathParameters: {'id': id});

// ❌ On web, does NOT update browser URL in go_router v11.1.2+
context.pushNamed(AppRoute.someScreen.name, pathParameters: {'id': id});
```

**Rule**: whenever the destination is a deep-linkable route, use `goNamed` / `go`.

---

### 5) Back navigation and URL sync on web

The **AppBar back button uses `Navigator.maybePop()`**, which pops the Flutter
stack but does **not** update GoRouter's URL.

**Fix**: override `leading` in the AppBar with an explicit `BackButton`:

```dart
// ✅ Back button that also updates the browser URL
AppBar(
  leading: BackButton(
    onPressed: () => context.goNamed(
      AppRoute.parentScreen.name,
      pathParameters: {'id': parentId},
    ),
  ),
)
```

Required when a screen:
1. was reached via `goNamed` (not `push`), AND
2. carries query parameters or path segments that must disappear on back navigation.

---

### 6) Consolidate Scaffolds when overriding the back button

If a screen has multiple `Scaffold`/`AppBar` widgets, consolidate them into a
single outer `Scaffold` so the back button override only needs to live in one place.

```dart
// ❌ Two Scaffolds — back button must be duplicated
class MyScreen extends ConsumerWidget {
  Widget build(BuildContext context, WidgetRef ref) {
    if (condition) return const _EmptyState(); // its own Scaffold
    return Scaffold(appBar: AppBar(...), body: ...);
  }
}

// ✅ Single Scaffold — one AppBar with correct leading
class MyScreen extends ConsumerWidget {
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: () => context.goNamed(AppRoute.parent.name)),
      ),
      body: condition ? const _EmptyBody() : const _RealContent(),
    );
  }
}
```

---

### 7) Nested routes inside `StatefulShellBranch`

- Nested route paths are **relative** — no leading `/`.
- Declare nested routes in the `routes:` list of their **parent** `GoRoute`.
- Use `goNamed` to navigate to nested routes.
- Back navigation must call `context.go(AppRoute.parent.path)`, not `context.pop()`.

<!-- local addition (flutter-toolkit) — audit rule ROUTER-03 -->
### 8) Page transitions

A common helper disables transitions everywhere (added for the web, where URL navigation should not slide):

```dart
NoTransitionPage<void> _page(Widget child) => NoTransitionPage<void>(child: child);
// every route: pageBuilder: (context, state) => _page(const SomeScreen())
```

It also removes the native transitions on Android/iOS, and it **bypasses `ThemeData.pageTransitionsTheme`**:
a page built with `NoTransitionPage` never asks the theme, so setting a theme alone changes nothing.

**Fix**: decide once, in the theme, and let routes use plain `MaterialPage` (or omit `pageBuilder` and use `builder`):

```dart
const PageTransitionsTheme appPageTransitionsTheme = PageTransitionsTheme(
  builders: {
    // Mobile browsers report android/iOS too, so gate on kIsWeb.
    TargetPlatform.android: kIsWeb ? _NoPageTransitionsBuilder() : ZoomPageTransitionsBuilder(),
    TargetPlatform.iOS: kIsWeb ? _NoPageTransitionsBuilder() : CupertinoPageTransitionsBuilder(),
    TargetPlatform.macOS: _NoPageTransitionsBuilder(),
    TargetPlatform.windows: _NoPageTransitionsBuilder(),
    TargetPlatform.linux: _NoPageTransitionsBuilder(),
    TargetPlatform.fuchsia: _NoPageTransitionsBuilder(),
  },
);
// _NoPageTransitionsBuilder extends PageTransitionsBuilder:
// transitionDuration = reverseTransitionDuration = Duration.zero; buildTransitions returns child.
```

Result: native transitions on installed Android/iOS apps, instant navigation on web and desktop.

To generate the theme, wire it into every light/dark theme and migrate the router, run `/page-transitions-init`.

Notes:

- `.android:` dot-shorthand needs Dart 3.10+; otherwise write `TargetPlatform.android`.
- A `const` map with `kIsWeb ? const A() : const B()` values is a valid compile-time constant.
- Apply the theme to **both** light and dark `ThemeData` (easy to miss when separate providers build them).
- A route that must stay instant on mobile too (e.g. a full-screen cockpit) may keep an explicit `NoTransitionPage`/`CustomTransitionPage` — ROUTER-03 targets only the blanket helper.
- `StatefulShellRoute.indexedStack`: branch switches never animate; only pushes inside a branch do.
- `PredictiveBackPageTransitionsBuilder` can replace `ZoomPageTransitionsBuilder` on Android 14+.
