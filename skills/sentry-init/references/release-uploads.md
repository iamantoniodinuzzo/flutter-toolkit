# Release Uploads — Source Maps & Debug Symbols

> Adapted from internal production notes.

---

## Overview

`sentry_dart_plugin` is a Dart build plugin that uploads debug artifacts to Sentry via `sentry-cli`. Two artifact types exist and are **mutually exclusive per build**:

| Build | Artifact | Flag |
|-------|---------|------|
| Web (release) | Source maps + Dart sources | `upload_source_maps=true upload_debug_symbols=false` |
| Android (release with obfuscation) | Debug symbols (dSYM) | `upload_debug_symbols=true upload_source_maps=false` |

Never run both on the same build output.

---

## Installation

```bash
flutter pub add --dev sentry_dart_plugin
```

Minimum-tested baseline: `sentry_dart_plugin: 3.2.0`. Check current version on `pub.dev`.

---

## pubspec.yaml Configuration

Add at the bottom of `pubspec.yaml` (after `dev_dependencies`):

```yaml
# https://docs.sentry.io/platforms/flutter/upload-debug/#available-configuration-fields
sentry:
  project: <your-sentry-project-slug>    # from Sentry dashboard URL
  org: <your-sentry-org-slug>            # from Sentry dashboard URL
  upload_debug_symbols: true
  upload_source_maps: true
  upload_sources: true
  wait_for_processing: false
  commits: auto
  ignore_missing: true
```

Obtain `project` and `org` from your Sentry dashboard URL: `https://sentry.io/organizations/<org>/projects/<project>/`.

The `auth_token` field can also go here, but storing it as an environment variable is more secure (see below).

---

## Authentication

Generate an **Organization Auth Token** in Sentry: **Settings → Auth Tokens → Create New Token**.

Set as environment variable (never commit the token):

```bash
# macOS / Linux — add to ~/.zshrc or ~/.bashrc
export SENTRY_AUTH_TOKEN=sntrys_YOUR_AUTH_TOKEN

# Windows PowerShell — add to $PROFILE
$env:SENTRY_AUTH_TOKEN = "sntrys_YOUR_AUTH_TOKEN"
```

For CI (GitHub Actions), add as a repository secret (name pattern: `<APP>_SENTRY_AUTH_TOKEN`) and pass to the build step:

```yaml
env:
  SENTRY_AUTH_TOKEN: ${{ secrets.APP_SENTRY_AUTH_TOKEN }}
```

---

## Web Release — Source Maps

### Build

```bash
flutter build web --release --source-maps \
  --dart-define-from-file=dart_defines.json
```

The `--source-maps` flag is required — without it, Flutter strips the source map file from the web build output.

### Upload

```bash
dart run sentry_dart_plugin \
  --sentry-define=upload_source_maps=true \
  --sentry-define=upload_sources=true \
  --sentry-define=upload_debug_symbols=false
```

The output folder `build/web/` will contain a `main.dart.js.map` file after the build. The plugin uploads this file along with the Dart sources.

---

## Android Release — Debug Symbols (dSYM)

### Build with obfuscation

```bash
flutter build apk --release \
  --obfuscate \
  --split-debug-info=build/debug-info \
  --dart-define-from-file=dart_defines.json
```

`--obfuscate` minimises Dart identifiers in the release binary. `--split-debug-info=build/debug-info` writes the corresponding debug symbol files to the specified directory.

### Upload

```bash
dart run sentry_dart_plugin \
  --sentry-define=upload_debug_symbols=true \
  --sentry-define=upload_source_maps=false \
  --sentry-define=symbols_path=build/debug-info
```

`symbols_path` must match the `--split-debug-info` path.

---

## GitHub Actions Snippets

### Web workflow step

```yaml
- name: Build web with source maps
  run: |
    flutter build web --release --source-maps \
      --dart-define-from-file=dart_defines.json
  env:
    # pass your DSN if needed at build time
    SENTRY_DSN: ${{ secrets.APP_SENTRY_DSN_PROD }}

- name: Upload source maps to Sentry
  run: |
    dart run sentry_dart_plugin \
      --sentry-define=upload_source_maps=true \
      --sentry-define=upload_sources=true \
      --sentry-define=upload_debug_symbols=false
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.APP_SENTRY_AUTH_TOKEN }}
```

### Android workflow step

```yaml
- name: Build Android APK
  run: |
    flutter build apk --release --obfuscate \
      --split-debug-info=build/debug-info \
      --dart-define-from-file=dart_defines.json

- name: Upload debug symbols to Sentry
  run: |
    dart run sentry_dart_plugin \
      --sentry-define=upload_debug_symbols=true \
      --sentry-define=upload_source_maps=false \
      --sentry-define=symbols_path=build/debug-info
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.APP_SENTRY_AUTH_TOKEN }}
```

---

## Required Secrets

| Secret | Purpose |
|--------|---------|
| `<APP>_SENTRY_AUTH_TOKEN` | Org auth token for plugin uploads |
| `<APP>_SENTRY_DSN_PROD` | Project DSN passed as `--dart-define=SENTRY_DSN` |

---

## Known Limitation: Obfuscated Issue Titles

Even after uploading debug symbols, Sentry issue **titles** may still show obfuscated identifiers. Stack frames within the issue detail are correctly symbolicated.

This is a known Sentry limitation: [getsentry/sentry#48334](https://github.com/getsentry/sentry/issues/48334).

Workaround for local inspection: `flutter symbolize` with the generated `app.android-arm64.symbols` file.

---

## First-Run Verification

After a successful upload, the Sentry CLI confirms with:

```
Finalized release <package_name>@<version>+<build>
```

Check the Sentry dashboard: **Issues → any issue → Stack Trace** — frames should show readable Dart code, not `<anonymous>` or obfuscated identifiers.
