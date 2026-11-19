<!-- source: local (flutter-toolkit) -->
## Asset size budget (ASSET-02)

**Goal:** Catch raster assets far larger than they are ever displayed.

Decoded size = `width × height × 4` bytes. 16 sprites at 1024×1024 ≈ 22 MB on disk, ≈ 64 MB decoded, drawn at ≈ 40 px;
on web the whole folder downloads on first use.

### Threshold (hybrid)

1. Display size known: flag when `source px > display logical px × 3 (max DPR) × 1.5`.
2. Display size unknown: flag when decoded size `> 4 MB` per file.

SVG is vector — skip.

### Scope

Needs the project root (`pubspec.yaml`). In single-file mode, check only assets referenced by the file.

### Fix

Resize to about display × 6 (e.g. 256×256 for ~40 px markers). Never resize automatically — show the command and ask.
If files cannot be edited: `cacheWidth`/`cacheHeight` on `Image.asset`, or `ResizeImage`.
