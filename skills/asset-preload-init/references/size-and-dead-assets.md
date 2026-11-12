<!-- source: local (flutter-toolkit) -->
# Size budget and dead assets

## Size matters more than precaching

Reference case: 16 sprites at 1024×1024 ≈ 22 MB PNG (≈ 64 MB decoded at 4 bytes/px) for markers drawn at ≈ 40 logical px;
on web the whole folder downloads on first use. Downscaled to 256×256 (≈ 6× display, enough for high-DPR screens): 0.38 MB.

**Decoded size** = `width × height × 4` bytes. Always report it next to the file size.

### Oversize threshold (hybrid)

1. Display size known (a `width:`/`height:` on the consuming widget, or a sized parent): flag when
   `source px > display logical px × 3 (max DPR) × 1.5 (margin)`.
2. Display size unknown: flag when decoded size `> 4 MB` per file.

Pixel size sources: PNG/JPEG header (`file`, `identify`, `sips -g pixelWidth`, or read the IHDR bytes); SVG is vector — skip.

### Fixes (propose, never run unasked)

- Resize the file, e.g. `magick in.png -resize 256x256 out.png` (show the command, let the user run it or confirm).
- Files that cannot be edited: `cacheWidth`/`cacheHeight` on `Image.asset`, or wrap in `ResizeImage`, to decode smaller.

## Dead assets

A pubspec entry such as `assets/logo/` bundles the whole directory, so unreferenced files cost bytes on web and mobile.

Detection traps:

- **Names with spaces** — quote when grepping.
- **Runtime-built paths** — a registry doing `assetPrefix + enumName + '.png'` never mentions file names. Before calling
  anything unused, search for: string prefixes ending in `/`, `'assets/…'` concatenation/interpolation, enum `.name`
  mappings, and `flutter_gen` `Assets.*.values` usage. Map prefix + enum values → filenames.
- flutter_gen accessors (`Assets.icons.logo`) reference files indirectly — match generated names back to files.

The audit **only reports**. It never deletes.

## Reference implementation

Engage-srl/pollicino_viewer #1155 (`apps/tomcat_portal`): `lib/main.dart` (warm-up overlapped with container setup,
handler at creation), `lib/src/core/widget/tomcat_logo.dart` (paths public so widget and warm-up share them),
`assets/sprites/vehicles/` 22.0 MB → 0.38 MB, two unused logo files removed. Of 21 image files only 2 logo SVGs needed
warming; 16 sprites were preloaded by their registry, 1 PNG was read only by a PDF, 2 were unreferenced.
