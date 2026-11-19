# Web BetterFeedback + CanvasKit Renderer Gate

> Adapted from internal production notes.

---

## Overview

The `feedback` + `feedback_sentry` package pair lets users submit annotated screenshots directly to Sentry's User Feedback dashboard. On Flutter web, screenshot capture requires the **CanvasKit renderer** — the HTML renderer produces blank captures. The implementation gates `BetterFeedback` on the active renderer to avoid crashes and blank submissions.

This approach was chosen over Sentry Session Replay:
- Session Replay requires a paid Sentry plan.
- Session Replay on Flutter web was less mature at the time of integration.
- BetterFeedback is user-triggered (no ambient recording), GDPR-safer.

---

## Packages

| Package | Role |
|---------|------|
| `feedback: ^3.2.0` | Provides `BetterFeedback` widget + screenshot-and-annotate overlay |
| `feedback_sentry: ^3.2.0` | Adds `.showAndUploadToSentry(name, email)` extension on `BetterFeedback.of(context)` |

Verify current versions via `pub.dev` before pinning.

---

## CanvasKit Renderer Detection Utility

Uses Dart's conditional export pattern to provide the correct `isCanvasKitRenderer()` implementation per platform:

```
lib/src/common/utils/renderer/    (adapt path to project conventions)
├── is_canvas_kit.dart    ← public API, conditional exports
├── native.dart           ← iOS / Android / desktop: always false
├── web.dart              ← Flutter web: checks window.flutterCanvasKit via dart:js
└── unsupported.dart      ← fallback stub (never selected by conditional exports)
```

### `is_canvas_kit.dart`
```dart
export 'native.dart'
    if (dart.library.js) 'web.dart'
    if (dart.library.html) 'web.dart';
```

### `native.dart`
```dart
bool isCanvasKitRenderer() => false;
```

### `web.dart`
```dart
// ignore: deprecated_member_use
import 'dart:js' as js;

bool isCanvasKitRenderer() {
  try {
    return js.context.hasProperty('flutterCanvasKit');
  } catch (_) {
    return false;
  }
}
```

The `dart:js` import carries a deprecation warning in favor of `dart:js_interop`. Suppress with `// ignore: deprecated_member_use`. Migration to `dart:js_interop` + `package:web` can be deferred until WASM adoption.

Credit: Andrea Bizzotto — "Conditional Imports for Web/Native APIs" (codewithandrea.com, Jun 2024).

---

## BetterFeedback Widget Tree Placement

In `main.dart`, wrap the app tree conditionally:

```dart
import 'package:feedback/feedback.dart';
import 'package:your_app/src/common/utils/renderer/is_canvas_kit.dart';

Future<void> main() async {
  // ... SentryFlutter.init, ProviderContainer, etc.

  final canCaptureFeedback = !kIsWeb || isCanvasKitRenderer();
  final tree = SentryWidget(child: ProviderScope(child: MyApp()));

  runApp(canCaptureFeedback ? BetterFeedback(child: tree) : tree);
}
```

When `BetterFeedback` is absent from the tree, calling `BetterFeedback.of(context)` would throw. Trigger buttons must use the same gate (see "Gating trigger buttons" below).

---

## SentryFeedbackService Architecture

```
Trigger (e.g. IconButton in AppBar)
  │
  ▼
SentryFeedbackService.show(context)
  │  reads auth provider for pre-fill (optional)
  │  maps empty strings → null
  │
  ▼
BetterFeedback.of(context).showAndUploadToSentry(name, email)
  │  opens full-screen feedback overlay
  │  user annotates screenshot + writes message
  │
  ▼
feedback_sentry (internally)
  ├── Sentry.captureFeedback(SentryFeedback(
  │       message: userText,
  │       name: name,
  │       contactEmail: email,
  │       associatedEventId: Sentry.lastEventId,   // links to last error
  │   ))
  └── attaches screenshot bytes as Sentry attachment
```

Feedback submissions are not subject to the debug-mode noise gate — `options.beforeSendFeedback` is a
deliberate passthrough (see `references/event-filtering-and-sampling.md`), so testing this flow works the
same in a debug build as in release.

---

## Gating Trigger Buttons

Any widget that calls `show(context)` must check that `BetterFeedback` is in the tree:

```dart
import 'package:your_app/src/common/utils/renderer/is_canvas_kit.dart';

// Show feedback button only when capture is functional
final showFeedback = !kIsWeb || isCanvasKitRenderer();

if (showFeedback)
  IconButton(
    icon: const Icon(Icons.feedback_outlined),
    tooltip: 'Send feedback',
    onPressed: () => ref.read(sentryFeedbackServiceProvider).show(context),
  ),
```

Additional gating by flavor (e.g. prod-only):
```dart
final showFeedback =
    getFlavor() == Flavor.prod && (!kIsWeb || isCanvasKitRenderer());
```

---

## Sentry Dashboard Result

Each submission appears under **User Feedback** in the Sentry project with:
- **Message**: text typed in overlay
- **Name / Email**: pre-filled from auth provider (empty → null → not displayed)
- **Associated event**: linked to `Sentry.lastEventId` (most recent error)
- **Screenshot**: attached as a Sentry attachment

---

## Known Limitations

| Limitation | Notes |
|-----------|-------|
| CanvasKit only on web | HTML renderer → blank screenshot. Gate handles this. |
| Platform views invisible | Native components (Maps, WebView) invisible in screenshots. Pure Flutter widgets work. |
| `showDialog` conflict | Dialogs with `useRootNavigator: true` appear above the feedback overlay. Pass `useRootNavigator: false` inside feedback flows. |
| iOS auto-screenshot caveat | `attachScreenshot: true` may fail on iOS crash (UI thread unavailable). Leave disabled by default. |

---

## Future Work

- Enable feedback button on web-canvaskit builds (gate already in place, just change condition).
- Add localization: `feedback` ships localisation delegates — add to `MaterialApp.localizationsDelegates`.
- Migrate `web.dart` to `dart:js_interop` + `package:web` when targeting WASM.
