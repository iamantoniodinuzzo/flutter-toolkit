---
name: audit-domain-layer
description: "Audit a Flutter domain-layer file or folder against the project's documented clean-architecture rules — dependency isolation (no infra or Flutter imports), outward layer imports (data/application/presentation), cross-feature domain coupling, god entities, typed and sealed/exhaustive exceptions, entity purity (no serialization logic), and hardcoded UI strings. Emits a violations table with file:line and rule ID, then offers to apply fixes. Use proactively when the user says \"audit domain layer\", \"audit this entity\", \"review domain\", \"check domain rules\", \"find domain violations\", or asks to verify a domain file against project architecture rules before code review."
user-invocable: true
---

# Audit Domain Layer

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

Statically scans Flutter domain-layer source files against bundled architecture rules.
Emits a violations table, then offers targeted fixes.

## Rule source

Rules are bundled locally in `rules`.
This skill does **not** delegate to `ai_toolkit/` — it is self-contained.

---

## Phase 0 — Resolve input

Read the user's request and extract one of:

- **Single file**: a path ending in `.dart`
- **Feature folder**: a path that contains a `domain/` directory

If neither is clear, ask exactly one question:

> "Provide a `.dart` file path under `domain/`, or a feature folder path containing a `domain/` directory."

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

Classify it:
- `domain-file` if it is under `domain/` in the feature tree.
- If it is NOT under `domain/`, apply `DOMAIN-STR-01` only and state the
  classification at the top of the report.

### Folder mode

Discover files with a permitted read-only subagent, otherwise scan directly. Use this prompt:

```
List all .dart files (excluding .g.dart, .freezed.dart) recursively
  under <input_path>/domain/ (or under <input_path> if it is already a domain/ dir).
  For each file report:
  - Relative path
  - Line count (approximate)
  - First import line (if any)
  Report as a plain table.
```

Classify each file as `domain-file`.

---

## Phase 3 — Scan

For each `domain-file`:

1. Read the full file contents.
2. Apply every heuristic in `rules/CATALOG.md`:
   - All rules apply to `domain-file` targets.
3. For each match: record `{file, line_number, rule_id, severity, message, fix_hint, autofix_safe}`.

Heuristic application notes:

- **DOMAIN-DEP-01**: flag any `import 'package:cloud_firestore/...`, `import 'package:http/...`,
  `import 'package:dio/...`, `import 'package:firebase_core/...`, any `import 'package:flutter/...`
  (material, widgets, cupertino, foundation), or any other infra/data-layer package in a file
  under `domain/`. Domain files may import `package:riverpod_annotation` and Dart core
  (`dart:...`) without triggering this rule.
- **DOMAIN-COUPLE-01**: in files under `domain/`, flag `import` lines whose path contains
  `/data/`, `/application/`, or `/presentation/` (relative or package imports).
- **DOMAIN-COUPLE-02**: in `features/<name>/domain/` files, flag imports matching
  `features/<other>/domain/` where `<other>` ≠ own feature.
- **DOMAIN-COHESION-01**: count `final <Type> <name>;` instance fields per domain class; flag
  the class line when > 15. Also flag domain files > 400 lines as a secondary signal.
- **DOMAIN-FAIL-01**: flag `throw Exception(`, `throw StateError(`, or any `throw` whose
  expression does not start with a class name that plausibly extends `AppException` or a named
  feature-level sealed exception. Also flag `throw ArgumentError(` and similar stdlib errors
  when inside domain logic (not in factory constructors performing validation).
- **DOMAIN-FAIL-02**: flag `abstract class <X> extends AppException` or
  `abstract class <X>Exception extends <Y>` in `domain/` when the declaration lacks the `sealed`
  modifier. Do not flag concrete leaf classes extending that base.
- **DOMAIN-ENT-01**: flag method or factory declarations matching `fromJson(`, `toJson(`,
  `fromMap(`, `toMap(`, or a parameter of type `Map<String, dynamic>` in entity/value-object
  classes directly in `domain/`. Do NOT flag model classes under `domain/` if the file name
  ends in `_model.dart` (data-layer model accidentally placed; flag separately as an info note).
- **DOMAIN-STR-01**: flag string literals matching `'[A-Za-z ]{20,}'` (≥ 20 chars, proxy for
  multi-word human-readable copy) that are not in comments and not assigned to `const` technical
  identifiers (e.g. `url`, `path`, `key`, `tag`, `code`). Exempt literals suffixed `.hardcoded`
  and literals passed as `message:`/`code:` named arguments inside a `super(...)` call within an
  exception class — those are domain data (typed exception messages), not UI copy.

---

## Phase 4 — Report

Emit the violations grouped by file:

```
## Audit Results — Domain Layer

### lib/.../auth/domain/app_user.dart
| Line | Rule ID | Severity | Message |
|------|---------|----------|---------|
| 12 | DOMAIN-ENT-01 | warning | fromJson() in entity — serialization belongs in the data-layer model |
| 34 | DOMAIN-STR-01 | info | Hardcoded string 'User not found in database' — use typed exception message |

---
**Summary**: 2 violations across 1 file (0 errors, 1 warning, 1 info)
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
Requires judgment: DOMAIN-DEP-01, DOMAIN-COUPLE-01, DOMAIN-COUPLE-02,
                   DOMAIN-COHESION-01, DOMAIN-FAIL-01, DOMAIN-FAIL-02,
                   DOMAIN-ENT-01, DOMAIN-STR-01
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

- `audit the domain layer of features/auth`
- `audit this entity: lib/src/features/auth/domain/app_user.dart`
- `find domain violations in features/booking/domain/`
- `/audit-domain-layer lib/src/features/auth/domain/`
- `/audit-domain-layer lib/src/features/booking/`

---

## Notes

- Application paths resolve from the project root; bundled references resolve from this installed skill directory.
- This skill does not shell out to `dart analyze`; it reads files directly.
- It does not overlap with `riverpod-reviewer` (which audits provider declarations in
  the application layer) or `audit-application-layer` (which audits notifier/provider code).
- To add or modify rules, edit `rules/CATALOG.md` only.
