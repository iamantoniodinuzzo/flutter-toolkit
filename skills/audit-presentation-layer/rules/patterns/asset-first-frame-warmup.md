<!-- source: local (flutter-toolkit) -->
## Asset first-frame warm-up (ASSET-01)

**Goal:** Avoid one-to-two-frame pop-in of logos/icons on the first route.

Flutter loads an asset the first time a widget asks for it. A `SvgPicture.asset` or `Image.asset` on the first route or
app shell draws late unless its cache was warmed during startup.

### Flag

`SvgPicture.asset(` / `Image.asset(` / `AssetImage(` in a first-route or shell widget (splash, home shell, app bar logo)
when no warm-up for that path exists in `main.dart`/startup code.

### Severity

- **warning** — SVG: the cache is reachable before `runApp`, so a one-line fix exists.
- **info** — raster: needs a `BuildContext`; fix is a post-first-frame/splash `precacheImage`.

### Do not flag

- Assets preloaded by an engine registry (Flame `Images`, sprite registry).
- `rootBundle.load` consumers (no cache).
- Assets not visible on the first frame.

### Fix

SVG: `SvgAssetLoader(path).loadBytes(null)` in `main()` before `runApp` (see ASSET-04 for safe form).
Raster: `precacheImage(AssetImage(path), context)` once a `MaterialApp` exists.
Run `/asset-preload-init` for the full inventory-driven fix.
