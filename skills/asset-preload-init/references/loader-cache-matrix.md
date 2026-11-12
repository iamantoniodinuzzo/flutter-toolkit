<!-- source: local (flutter-toolkit) -->
# Loader / cache matrix

Each asset loader fills its **own** cache, so one generic `precacheAssets` helper does not fit all.

| How the asset is consumed | Cache it fills | Precache with | Needs `BuildContext`? |
|---|---|---|---|
| `SvgPicture.asset` | flutter_svg `svg.cache` | `SvgAssetLoader(path).loadBytes(null)` | no |
| `Image.asset` / `AssetImage` | Flutter `ImageCache` | `precacheImage(AssetImage(path), context)` | yes (needs a `MaterialApp`) |
| Game-engine image caches (Flame `Images`, sprite registries loading bytes themselves) | the engine's own cache | the engine's own preload — `precacheImage` does nothing for it | no |
| `rootBundle.load` (PDF builders, etc.) | none | nothing to precache | — |

## SVG: the wrapper is redundant

`SvgAssetLoader.loadBytes` already calls `svg.cache.putIfAbsent` (flutter_svg 2.2.3). Do **not** generate
`svg.cache.putIfAbsent(loader.cacheKey(null), () => loader.loadBytes(null))` — `SvgAssetLoader(path).loadBytes(null)` is enough.
Verify against the installed flutter_svg version before generating.

## Cache-key preconditions

The cache key is `(assetName, packageName, bundle, theme, colorMapper)`. A warm-up only helps if the key equals what
`SvgPicture.asset` builds at runtime. It silently misses when the consuming widget:

- passes `theme:`, `colorMapper:` or `bundle:`, or
- sits under a `DefaultSvgTheme` ancestor.

Check all three **before** generating. If any holds: do not generate a warm-up for that asset; report why.

## Where to run

- **SVG**: no context needed → `main()`, before `runApp`. Start the `Future` early so it **overlaps** other startup work;
  `await` it just before `runApp`.
- **Raster**: needs a context → post-first-frame step or a splash widget, never before `runApp`.

## Error handling at creation

If the warm-up future fails while other startup work is still running and nothing listens yet, the error surfaces as an
unhandled async error (and reaches the crash reporter). Attach the handler where the future is created:

```dart
final warmUp = Future.wait([
  for (final p in const [lightLogoPath, darkLogoPath]) SvgAssetLoader(p).loadBytes(null),
]).then<void>((_) {}, onError: (Object e) => debugPrint('[App] precache failed: $e'));
// ... other startup ...
await warmUp;
runApp(...);
```

On failure the asset loads lazily as before — the optimisation must never break startup.

## Web

Local files on mobile cost only decode time; on web every file is an HTTP fetch. Await only what the first screen shows;
background or lazily load the rest. Do not move heavy preloads to startup on web.

## Theme / adaptive variants

Warm both light and dark variants of a themed asset (theme can change at runtime). Nothing else is platform-specific
beyond the web rule above.

## Adjacent (optional)

For images that cannot be precached (network, unbounded lists), cross-fade from a flat placeholder with `image_fade`'s
`ImageFade` (any `ImageProvider`; plain grey/shimmer placeholder, small icon on error).
