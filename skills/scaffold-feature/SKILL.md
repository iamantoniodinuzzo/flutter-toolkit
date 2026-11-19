---
name: scaffold-feature
description: "Scaffold a new Flutter feature respecting clean architecture (feature-first), repository pattern with dependency inversion, Riverpod v3 DI, go_router navigation, structured logging, and explicit exception handling. Use when the user says they are starting a new feature, scaffolding feature folders, or kicking off feature implementation. Does NOT handle git, issues, or branches — those stay manual."
user-invocable: true
---

# scaffold-feature

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

## Phase 1 — Socratic intake

Ask the user in **one message** (do not proceed until all answers are received):

1. **Scope**: Top-level feature or sub-feature of an existing parent?
   - If sub-feature: which parent? (verify `lib/src/features/<parent>/` exists on disk)
2. **Name**: Short `snake_case` name for the feature.
3. **Purpose**: One-line description of what this feature does.
4. **Design probes** (tailor to the description):
   - What data sources does it touch? (Firestore / REST / local DB / none)
   - What is the navigation entry point? (deep link / tab / modal / nested route)
   - What is the primary state shape? (list / single entity / form / real-time stream)
   - What failures can the repository surface? (e.g. not-found, permission-denied, network)

Wait for the user's full answers before proceeding.

---

## Phase 2 — Scaffold clean-architecture directories

Use the `Write` tool with empty `.gitkeep` content to create parent directories implicitly.

### Top-level feature → `lib/src/features/<name>/`

```
lib/src/features/<name>/domain/entities/.gitkeep
lib/src/features/<name>/domain/repositories/.gitkeep
lib/src/features/<name>/domain/exceptions/.gitkeep
lib/src/features/<name>/data/models/.gitkeep
lib/src/features/<name>/data/repositories/.gitkeep
lib/src/features/<name>/application/.gitkeep
lib/src/features/<name>/presentation/screens/.gitkeep
lib/src/features/<name>/presentation/widgets/.gitkeep
```

Controllers (`Notifier` / `AsyncNotifier`) live directly in `application/`. A datasource, when the feature has
one, is a file under `data/` (for example `data/<name>_datasource.dart`), not a folder.

### Sub-feature → `lib/src/features/<parent>/<name>/`

Sub-features are UI-only. Domain, data, and application layers are provided by the parent feature.

```
lib/src/features/<parent>/<name>/presentation/screens/.gitkeep
lib/src/features/<parent>/<name>/presentation/widgets/.gitkeep
```

---

## Phase 3 — Load architectural context

Read the following files **in parallel** from inside this skill's own `references/` folder.

### Mandatory (always load)

**Breaking changes — language and async safety**
- `references/breaking/dart-language.md`
- `references/breaking/dart-async-errors.md`
- `references/breaking/riverpod-core.md`
- `references/breaking/riverpod-async-mutations.md`
- `references/breaking/riverpod-flutter.md`

**Architecture patterns**
- `references/patterns/feature-creation.md`
- `references/patterns/repository-pattern.md`
- `references/patterns/exception-handling.md`
- `references/patterns/go-router-navigation-conventions.md`
- `references/patterns/async-notifier-command-api.md`
- `references/patterns/riverpod-rebuild-optimization.md`
- `references/patterns/no-ui-strings-outside-ui.md`
- `references/patterns/widget-classes-no-build-helpers.md`
- `references/patterns/flutter-side-effects.md`

**Logging and codegen**
- `references/logging.md`
- `references/error-logging-contract.md`
- `references/codegen.md`

### Conditional (load only when Phase 1 answer matches)

| Condition | File |
|---|---|
| Primary state shape is real-time stream | `references/breaking/riverpod-streams-lifecycle.md` |

Internalize rules silently — do not echo back unless the user explicitly asks.

---

## Phase 4 — Architecture contract

Print a compact contract derived from Phase 1 answers + the loaded references.
Use this template, filling in every `<…>` from the intake answers:

```
Feature: <name>  (<top-level> | <sub-feature of parent>)

Domain
  - Entities:           <e.g. Order, OrderItem>
  - Repository iface:   <Name>Repository  (always created, in domain/repositories/)
  - Exceptions:         sealed <Name>Exception extends AppException
                        <e.g. FetchOrderException, OrderNotFoundException>

Data
  - Source:             <Firestore | REST endpoint | SQLite | none>
  - Model:              <Name>Model  →  fromMap() / toMap() / toEntity()  (entities have no serialization)
  - Repo impl:          <Name>RepositoryImpl maps infrastructure errors → <Name>Exception
  - Provider:           <name>Repository provider returns the <Name>Repository interface

Application
  - Controller:         <feature>Controller  (extends Notifier<<State>>), calls the repository;
                        a service only if logic spans repositories
  - State:              <AsyncValue<T> | record | sealed class>
  - Side effects:       command pattern — mutation methods return Future<void>

Presentation
  - Screen:             <Feature>Screen  (ConsumerWidget)
  - Watches:            ref.watch(<provider>.select(…))  — one .select() per field read
  - Navigation:         context.goNamed('<routeName>')  (never push for deep-linkable routes)

Logging
  - Logger:             LoggerService via loggerServiceProvider (notifier: ref.read; repo/datasource: constructor)
                        message tag: [<feature>][<layer>]
  - Async errors:       AsyncErrorLogger handles them — no manual try/catch in async providers
                        (contract: references/error-logging-contract.md)

GoRouter notes (critical for web / deep-link targets)
  - push() does NOT update browser URL in go_router v11.1.2+; use go/goNamed always
  - AppBar default back button does not update GoRouter URL; override leading with
    BackButton → context.goNamed(parentRoute) when query params or path segments must clear
  - Multiple Scaffolds → consolidate into one outer Scaffold for unified back-button override
```

Ask the user to confirm or correct the contract before moving to implementation.

---

## Phase 5 — Closing summary

```
✅ Scaffolded:          lib/src/features/<[parent/]name>/
✅ Architecture loaded: 17 reference files (breaking + patterns + logging + error contract + codegen)
✅ Contract confirmed above — ready to implement

Next manual steps (not handled by this skill):
  - gh issue create …                        (if issue not yet created)
  - git start feature <n>_<name>             (creates feature/<n>_<name> from develop)
  - Implement layers: domain → data → application → presentation
  - codegen: the command in references/codegen.md          (after adding @riverpod or any generated part)
  - /unit-test                               (domain + application layer tests)
  - gh issue close <N>                       (GitHub does NOT auto-close on PR merge)
```
