<!-- source: local (flutter-toolkit) -->
## Warm-up safety and effectiveness (ASSET-04)

**Goal:** A warm-up must neither break startup nor silently miss.

### Flag

1. **Error not handled at creation** — a warm-up `Future` created early with no `onError`/`catchError` attached where it
   is created. If it fails while other startup work runs and nothing listens, it surfaces as an unhandled async error and
   reaches the crash reporter. Fix: `.then<void>((_) {}, onError: ...)` at creation.
2. **Cache key cannot match** — the consuming `SvgPicture.asset` passes `theme:`, `colorMapper:` or `bundle:`, or sits
   under a `DefaultSvgTheme`. Key is `(assetName, packageName, bundle, theme, colorMapper)`; the warm-up misses silently.
3. **Wrong cache** — `precacheImage` used for an asset consumed by an engine-managed cache (Flame `Images`, sprite
   registry); it does nothing for it.
4. **Redundant wrapper** (info) — `svg.cache.putIfAbsent(loader.cacheKey(null), () => loader.loadBytes(null))`;
   `loadBytes` already does it (flutter_svg 2.2.3).

### Correct form

```dart
final warmUp = Future.wait([
  for (final p in const [lightLogoPath, darkLogoPath]) SvgAssetLoader(p).loadBytes(null),
]).then<void>((_) {}, onError: (Object e) => debugPrint('[App] precache failed: $e'));
// ... other startup ...
await warmUp;
runApp(...);
```

On web, await only first-screen assets; heavier sets are an HTTP fetch per file.
