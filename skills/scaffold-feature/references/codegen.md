# Codegen: the one build command

This file is the single statement of how generated code is built. Skills that need it carry a
byte-identical copy (the toolkit validation script fails when a copy drifts). Edit the canonical file in
`scaffold-feature/references/` and copy it.

## The command

Run it from the root of the package that owns the annotated files (the folder with its `pubspec.yaml`).
In a Melos or pub workspace, run it once per package that depends on `build_runner`.

```bash
dart run build_runner build --delete-conflicting-outputs
```

Run it after adding or changing a `@riverpod` / `@Riverpod` provider, a `part '<file>.g.dart';` line, or any
other annotation a generator reads. Afterwards run `git status`: a build can delete committed generated
files or only change their line endings, and either must not slip into the commit unnoticed.

## `--build-filter` is an optional speed-up, not the default

`--build-filter` rebuilds only a subset, which saves time on a large package. Two rules when you use it:

- **Never combine it with `--delete-conflicting-outputs`.** The flag deletes every cached `.g.dart`
  project-wide before building, and only the filtered subset is regenerated, so the rest goes missing.
- **Give it the output path, not the source path.** A `.dart` file becomes `.g.dart`; a directory gets `**`
  appended:

```bash
dart run build_runner build --build-filter="lib/src/features/foo/**"
```

Even without the flag, a filtered build can silently delete unrelated `.g.dart` files when the cached
asset graph is far out of date (for example after many accumulated edits), and it logs nothing. That is why
the full command above is the default. If a filtered build was used, finish with `git status` and, when
files are missing, one full build.
