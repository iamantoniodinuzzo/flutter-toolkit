---
name: audit-data-layer
description: "Audit a Flutter data-layer file or folder against the project's documented repository pattern, exception handling, and cohesion/coupling rules — leaky abstractions (raw framework types in public API), missing exception conversion, model mapper gaps, untyped exceptions in datasources, upward imports (application/presentation), cross-feature data coupling, god repositories, and mixed remote+local datasources. Emits a violations table with file:line and rule ID, then offers to apply fixes. Use proactively when the user says \"audit data layer\", \"review repository\", \"check data layer\", \"find data violations\", \"audit this repository\", or asks to verify a data file against project architecture rules before code review."
user-invocable: true
---

# Audit Data Layer

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

Statically scans Flutter data-layer source files against bundled repository pattern
and exception handling rules. Emits a violations table, then offers targeted fixes.

## Rule source

Rules are bundled locally in `rules`.
This skill does **not** delegate to `ai_toolkit/` — it is self-contained.

---

## Phase 0 — Resolve input

Read the user's request and extract one of:

- **Single file**: a path ending in `.dart`
- **Feature folder**: a path that contains a `data/` directory

If neither is clear, ask exactly one question:

> "Provide a `.dart` file path under `data/`, or a feature folder path containing a `data/` directory."

Do not proceed until a path is confirmed.

---

## Phase 1 — Load rule catalog

Read `rules/CATALOG.md` in full before scanning.

Do not read individual rule doc files yet — the catalog contains all heuristics
needed for Phase 3. Open a specific rule doc only if you need to clarify a
borderline case or produce a more detailed fix explanation.

---

## Phase 2 — Discover files

### Single-file mode

Target file = the provided `.dart` path.

Classify it as one of:
- `repository` — file name contains `repository` or lives in a `repositories/` subdirectory
- `datasource` — file name contains `datasource` or `data_source` or lives in a `datasource/` subdirectory
- `model` — file name ends in `_model.dart` or lives in a `models/` subdirectory
- `data-file` — any other `.dart` file under `data/`

### Folder mode

Discover files with a permitted read-only subagent, otherwise scan directly. Use this prompt:

```
List all .dart files (excluding .g.dart, .freezed.dart) recursively
  under <input_path>/data/ (or under <input_path> if it is already a data/ dir).
  For each file report:
  - Relative path
  - Whether it appears to be a repository, datasource, or model file (from name/path)
  - Line count (approximate)
  Report as a plain table.
```

---

## Phase 3 — Scan

For each file:

1. Read the full file contents.
2. Apply heuristics from `rules/CATALOG.md` by classification:
   - `repository` files → apply: DATA-REPO-01, DATA-LEAK-01, DATA-MOD-01 (if the repo wraps a datasource that exposes raw types), DATA-COUPLE-01, DATA-COUPLE-02, DATA-COHESION-01
   - `datasource` files → apply: DATA-LEAK-01, DATA-EX-01, DATA-COUPLE-01, DATA-COUPLE-02, DATA-COHESION-01, DATA-COHESION-02
   - `model` files → apply: DATA-MOD-01, DATA-COUPLE-01, DATA-COUPLE-02
   - `data-file` → apply all rules
3. For each match: record `{file, line_number, rule_id, severity, message, fix_hint, autofix_safe}`.

Heuristic application notes:

- **DATA-REPO-01**: within a class that appears to be a repository implementation (class name
  ends in `Repository` or file is under `repositories/`), look for `catch` blocks that do NOT
  contain a `throw <TypedExceptionName>` on the same or next non-blank line. Also flag `catch`
  followed immediately by `rethrow` with no conversion. Do NOT flag `catch` blocks in test files.
- **DATA-LEAK-01**: flag return types or method signatures containing any of:
  `DocumentSnapshot`, `QuerySnapshot`, `Query`, `CollectionReference`, `DocumentReference`,
  `QueryDocumentSnapshot`, `Response`, `HttpClientResponse`, `DioResponse`, `dio.Response`
  in public method signatures (not private `_` methods). Also flag these types in class-level
  `Stream<` or `Future<` return types in the file's public API.
- **DATA-MOD-01**: in `*_model.dart` files or files under `models/`, check that at least one
  method named `toEntity()` (or a named constructor of the domain entity type) is declared.
  Flag the class declaration line if no such mapper is found.
- **DATA-EX-01**: in datasource files (or any file under `data/`), flag `throw Exception(`,
  `throw StateError(`, `throw Error(` — generic throws that should be typed exceptions.
- **DATA-COUPLE-01**: in files under `data/`, flag `import` lines whose path contains
  `/application/` or `/presentation/` (relative or package imports).
- **DATA-COUPLE-02**: in `features/<name>/data/` files, flag imports matching
  `features/<other>/data/` where `<other>` ≠ own feature.
- **DATA-COHESION-01**: count public (non-`_`) method declarations per repository/datasource
  class; flag the class line when > 10, or when method names reference ≥ 3 distinct entity nouns.
- **DATA-COHESION-02**: flag datasource classes whose file imports at least one remote-infra
  package ({`dio`, `http`, `cloud_firestore`, `firebase_storage`}) AND at least one local-storage
  package ({`hive`, `hive_flutter`, `sqflite`, `shared_preferences`, `drift`, `isar`}).

---

## Phase 4 — Report

Emit the violations grouped by file:

```
## Audit Results — Data Layer

### lib/.../auth/data/repositories/firestore_auth_repository.dart
| Line | Rule ID | Severity | Message |
|------|---------|----------|---------|
| 45 | DATA-REPO-01 | error | catch block does not convert FirebaseException → typed domain exception |
| 78 | DATA-LEAK-01 | error | watchUsers() returns Stream<QuerySnapshot> — expose Stream<List<AppUser>> instead |

### lib/.../auth/data/models/app_user_model.dart
| Line | Rule ID | Severity | Message |
|------|---------|----------|---------|
| 12 | DATA-MOD-01 | warning | No toEntity() mapper found — add AppUser toEntity() to map model → domain entity |

---
**Summary**: 3 violations across 2 files (2 errors, 1 warning, 0 info)
```

If no violations are found, say so explicitly:

```
No violations found in <path>. All checked rules pass.
```

---

## Phase 5 — Fix prompt

After the report, ask:

```
Apply fixes for which rule IDs? (comma-separated list, "all", or "none")
Auto-fix safe: (none)
Requires judgment: DATA-REPO-01, DATA-LEAK-01, DATA-MOD-01, DATA-EX-01,
                   DATA-COUPLE-01, DATA-COUPLE-02, DATA-COHESION-01, DATA-COHESION-02
```

On response:

- **"none"** or no response: done.
- **"all"** or specific IDs:
  1. For each violation matching the selected IDs:
     - If `autofix_safe: true`: apply the edit directly, show diff.
     - If `autofix_safe: false`: show the specific change needed and ask the
       user to confirm before editing. Provide the exact code transformation.
  2. After all edits, re-run Phase 3 on touched files only.
  3. Confirm which violations were resolved.

Never edit files that were not explicitly approved by the user.

---

## Usage examples

- `audit the data layer of features/auth`
- `audit this repository: lib/src/features/auth/data/repositories/firestore_auth_repository.dart`
- `find data violations in features/booking/data/`
- `/audit-data-layer lib/src/features/auth/data/`
- `/audit-data-layer lib/src/features/booking/`

---

## Notes

- Application paths resolve from the project root; bundled references resolve from this installed skill directory.
- This skill does not shell out to `dart analyze`; it reads files directly.
- It does not overlap with `audit-domain-layer` (which audits domain entity and exception
  definitions) or `audit-application-layer` (which audits notifier/provider code).
- To add or modify rules, edit `rules/CATALOG.md` only.
