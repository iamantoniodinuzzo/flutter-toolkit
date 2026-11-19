<!-- source: local (flutter-toolkit) -->
## Unused assets (ASSET-03)

**Goal:** Report assets that ship in every build but are never loaded.

A pubspec entry such as `assets/logo/` bundles the whole directory, so unreferenced files cost bytes on web and mobile.

### Heuristic and traps

- Grep file names **quoted** (names may contain spaces).
- Follow `flutter_gen` accessors (`Assets.icons.logo` → file).
- Follow **runtime-built paths**: a registry doing `assetPrefix + enumName + '.png'` never mentions the file names —
  resolve prefix + enum values before declaring anything unused.
- A file read only through `rootBundle.load` is *used* (just not cacheable).

### Fix

**Report only. Never delete.** The user decides whether to remove the file or narrow the pubspec entry.
