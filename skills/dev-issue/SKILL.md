---
name: dev-issue
description: >
  Starts development of a GitHub issue in any Flutter/Dart project on git-flow: reads the project's own
  conventions (and records them in docs/agents/dev-issue.md the first time), parallel recon of issue, epic and
  code, mismatch detection, decision-tree Q&A in rounds with recommendations, a plan, then branch creation only
  after approval, a local gate before the merge, and a report with evidence per acceptance criterion. Use
  whenever given an issue number to implement, or asked to "start working on issue #NNN" / "pick up #NNN".
  Args: <issue_number> [epic_number]
---

# Issue Development Kickoff

## Runtime and resources

Use the current agent's native file, search, shell and question tools; plain-text questions and direct sequential reads are valid fallbacks. Subagents are optional and need host permission. Bundled paths below are relative to this installed skill directory (`references/`); application paths are relative to the target project. The skill holds no project facts: layout, commands and rules are **read** from the target project (`CLAUDE.md`, `AGENTS.md`, `docs/agents/`, the repo itself) and remembered in the project's own `docs/agents/dev-issue.md` (`references/project-profile.md`). Never store anything inside this skill's directory: a plugin update replaces it. Plan mode: use the host's when it has one; otherwise write the plan, show it, and wait for an explicit "go" before any edit. Required capabilities: `gh` and git-flow aliases (Phase 0). A missing optional capability (Sentry tool, `ctx7`, plan mode) is named in the report, never invented.

Starts development of one GitHub issue. Reads the issue, explores the referenced code, detects scope mismatches, asks the questions that actually need asking with reasoned recommendations, then plans. The branch is created as the **first execution action**, after the plan is approved, never before.

**Args**: `$ARGUMENTS` = `<issue_number>` or `<issue_number> <epic_number>`. Two numbers: check the second one's labels; when it is no epic, or the form is ambiguous, ask.

---

## PHASE 0: Preconditions and classification

1. **Git-flow check.** `git config --get alias.start`. Empty: **stop** and tell the user to install https://github.com/iamantoniodinuzzo/git-flow (do not install it yourself, do not fall back to hand-built branch commands). The flow this skill drives is `git start feature|bugfix <issue>_<slug> --json` → `git c -m "<message>" --json` → `git finish --json` (merges into `develop` with `Close #N`). There is no pull request.
2. `gh issue view <n> --json title,body,labels,state,comments` (the plain form and `--comments` can print nothing, exit 0).
3. Classify **bug** or **feature/task/epic**. It decides which Phase 1 checks fire. The label is a hint, not the truth: an issue whose body says "fails", "error", "crash", a stack trace or a Sentry ID is a bug whatever the label says.
4. **Redirect check, before any recon.** Read the comments for "closed by #N", "duplicate of #N", "superseded by #N", "folded into #N". Found: read #N, then ask one question: continue with #N instead (recommended when #N's body lists this issue under what it closes), or stay on this one.
5. **No repo diff.** When the issue's whole fix lives outside the repo (user-level agent config, the memory index), the plan has no Pre-flight branch and no changelog entry; one line under `## Pre-flight` says why. Close with `gh issue close <n> --comment <file>` after the work; if the permission is denied, hand the command to the user. An issue that also edits repo files has a diff and takes the normal path.

Write a body or comment with backticks to a file and pass it as `--body-file`; an inline string runs the backticks as commands. Use a Bash-compatible shell for `gh` with multi-line text: PowerShell flattens the newlines.

### Issue format

An issue with these sections (`Context and why`, `Binding decisions`, `Files to create or modify`, `Implementation steps`, `Out of scope`, `Depends on`, `Acceptance criteria`, `Definition of done`, `How to verify`) is handled this way:

- `Binding decisions` are **settled**: carry them into `## Decisions to honour`, never reopen them in the question rounds. When the design you are planning breaks one, say so first.
- `Depends on`: `gh issue view` each; an open dependency **stops the skill** (Phase 2C). Report which one and why you stopped.
- `Out of scope` becomes `## Scope guardrails` verbatim.
- Every acceptance criterion and definition-of-done item maps to evidence in the final report (Verification).
- The commands under `How to verify` run **as written**, and their output is reported.

Other formats: read the template in `.github/ISSUE_TEMPLATE/` if present and use the issue's own sections the same way.

---

## PHASE 0.5: Project profile

Read `docs/agents/dev-issue.md`.

- **Present**: load `## Conventions` and `## Lessons`. Check each convention you rely on against the repo before using it; the repo wins, and a stale fact becomes a `MODIFY` of the profile in the plan. A lesson that matches this issue shapes the plan; name which lesson shaped which step.
- **Missing**: run the discovery checklist in `references/project-profile.md`, use the results now, and put `CREATE docs/agents/dev-issue.md` in the plan with the draft content. Plan mode forbids writing it earlier.

Also read the target project's `CLAUDE.md` / `AGENTS.md` / `docs/agents/`: they outrank anything this skill assumes.

---

## PHASE 1: Parallel recon (no user interaction)

Pick the mode first:

- **Inline** (default when the issue sits in one feature dir): run the checks below yourself with Read, Grep, `gh` and `git`, in parallel tool calls. A subagent starts cold and re-derives context you already hold.
- **Agents**: when the scope spans several unrelated feature dirs, or the user asks. Launch the agents in parallel as read-only searchers (they only locate and read code), only where the host allows spawning. Root-cause verification (Agent E) is judgment, not search: run it inline.

**Agent A: Issue + epic**

- The issue JSON from Phase 0: title, full body, acceptance criteria, linked issues, labels.
- `<epic_number>` given: `gh issue view <epic_number> --json title,body,state,comments`. Otherwise search the body for "Part of #NNN" and read that issue.
- Prerequisites ("requires #NNN", `Depends on`): is each still open?
- Read the resolution comments of every closed decision issue the body or its comments link, plus every issue that cites this one: `gh issue list --state all --search "#<issue_number> in:body,comments"`. A decision's resolution often names the tickets it binds without being linked back. They hold the decisions the plan must honour.
- **Sentry ID or link in the body**: read `references/sentry.md` §Fetch the event, if a Sentry tool is available.

**Agent B: Code referenced in the issue**

- Extract every file path mentioned in the issue body.
- Read those files plus the obvious neighbours (feature: the overlay if it is about a chart, the provider if it is about a widget; bug: every reader and writer of the field or state involved). Grep every caller of what you would touch.
- Search the repo for partial implementations using keywords from the issue title.
- **Existing dependencies before new math.** For every calculation the plan would hand-write (geometry, unit conversion, parsing, date/time), grep the `pubspec.yaml` dependencies of the touched packages for a library that offers it, then read the pinned version's source in the pub cache for the function and its edge behaviour. Hand-write what no dependency offers, and name those parts in the plan.
- **Helper warnings before bypassing it.** When the plan skips a shared helper (an animation, a loader, a guard) to do the work another way, read the helper's doc comment and its tests: every warning in them goes into `## Unverified` (or `## Decisions to honour` when the behaviour is a contract), with what would settle it.
- **Don't assume Dart-only.** The repo can hold backend code beside the app (`functions/`, `scripts/`, `server/`). If the issue talks about an external trigger, webhook or backend, check whether such a directory exists before calling it out of scope.
- Feature/task only: check whether a shared package (profile: `shared package`) already partially covers the work.

**Agent C: Shared package + workspace context** *(feature/task/epic; skip or shrink for a bug isolated to one file)*

- Read the shared package's `pubspec.yaml` and entry point (from the profile).
- Check whether the needed dependencies are already present across the apps' pubspecs.
- Identify a prior architectural pattern to follow as reference.

**Agent D: Build environment state** *(feature/task/epic)*

- Generated code: per the profile, or `git check-ignore -v <a .g.dart path>`. Gitignored and nothing generated yet: the regen command is **step 0** of the plan, before any implementation.
- Package APIs the plan names: run the **API check** below (it runs for bugs too).

**Agent E: Root-cause verification** *(replaces Agent D for bugs)*

The issue narrates a cause ("trigger X doesn't do Y", "field Z is missing"). **Do not treat it as established.** Verify it against the code:

- `git log --oneline -- <file>` and `git log -L <lines>:<file>`: was the behaviour already fixed by a commit after the event or issue date?
- Read the current code at the cited location and confirm the defect line by line, not just "plausible".
- The code **contradicts** the narrative (the issue says the trigger never writes the error field, the code always writes it): that is a **mismatch for Phase 2**, not a detail to drop.
- A linked Sentry event exists: run `references/sentry.md` §Root-cause cross-checks.

**API check** *(every issue type, before Phase 4: the plan names a package symbol)*

List every package symbol the plan will call, import or read: class, method, parameter, enum, field, import path. A package already in `pubspec.yaml` counts as much as a new one. Settle three facts per symbol, at the version in the project's `pubspec.lock` (its location is in the profile):

- **Exists.** Read the source in the pub cache (`hosted/pub.dev/<package>-<version>/lib` under the pub cache directory of this OS).
- **Reachable.** Which package to import it from: grep the `export` lines of `lib/<package>.dart`; the symbol can live in a transitive package the one you depend on does not re-export. A widget can also keep what you want in a private field: read the constructor and the fields, not only the docs.
- **Meaning.** What a mode, default or parameter does and gives up. When `ctx7` (or another docs tool) is available, ask it (`npx ctx7@latest library "<Name>" "<question>"`, then `docs <libraryId> "<question>"`, at most 3 commands per question); the pub-cache source answers Exists and Reachable.

A symbol you could not open goes in `## Unverified`, with the plan line that depends on it. One that does not exist in the pinned version gets a concrete alternative in the plan.

**Doc gates** *(every issue type, before Phase 4)*

Walk each "Before X, read Y" line of the loaded `CLAUDE.md` / `AGENTS.md` files and of the profile's `doc gates`, and ask whether the plan touches its trigger (a repository layer, a logging call, generated code, a role or capability, an external call). For each trigger the plan touches, open the doc now. `## Context` then names the doc and the rule from it that shaped the plan. A doc you could not open goes in `## Unverified`. Done when every triggered doc is opened or listed there.

---

## PHASE 2: Mismatch detection (before any question)

Always check and report:

**A. Scope mismatch.** Does the issue body describe something different from how the user framed the task? Surface it before proceeding:
> ⚠ **Issue #NNN specifies X. The initial description suggested Y. The plan will follow X (issue text). Confirm, or redefine scope?**

**B. Partial implementation.** Does code already satisfy part of the criteria? Report it with path and assessment ("coverable with a wrapper" / "needs refactor" / "unusable").

**C. Open prerequisites.** Does the issue depend on another issue that isn't closed?
> ⚠ **Prerequisite #NNN still open. Recommendation: [proceed in parallel / unblock first / temporary mock]. Reason: …**

An open `Depends on` in the starter format **stops** here: report it, do not plan around it unless the user says so.

**D. Scope creep.** Narrow acceptance criteria but the context pushes toward more? Call it out; put the extra in the plan as OUT OF SCOPE.

**E. Unverified claim (bug).** Is the narrated root cause (Agent E) confirmed by the current code, or disproven/stale? Always report the outcome, even when confirmed:
> ⚠ **Issue claims X as the cause. Verification at `<file>:<lines>` (commit `<hash>`) shows Y: [confirmed / disproven / partially true]. Plan proceeds on [issue narrative / code evidence].**

If the code disproves the narrated cause and there is no solid alternative, say so before writing the plan. Do not force a narrative the facts do not support.

**Recon changed the cause or the scope** (any of A-E): draft the corrected issue body and the changelog line to a temporary file (`issue<N>_body.md` in the OS temp dir) and show both in the Phase 3 round. `gh issue edit <N> --body-file <file>` runs only after the user accepts: the issue stays the source of truth, and the question that hangs off the new outcome is asked after it.

---

## PHASE 3: Q&A in rounds (decision tree)

Ask about every decision that can't be derived unambiguously from the issue text, the codebase, the profile, or a reasonable default. No artificial cap on question count; the goal is to surface real ambiguity, not hit a quota. `Binding decisions` are never asked again.

### Rule: work the decision tree in rounds

Open decisions form a tree: each decision opens the ones that hang off it. Walk it in rounds:

- **Round = frontier.** The frontier is every decision whose prerequisites are already settled. Ask only those. A question whose options depend on another question still open belongs to a *later* round.
- **One round = one set of at most 4 questions**, asked together through the host's question tool (or as one numbered plain-text list). When the frontier is wider, ask first the decisions that unblock the most branches.
- **Round 1 carries the Phase 2 scope decisions** (mismatch A, C, D): everything else hangs off them.
- **Recommended option first**, so accepting it is the default.
- After each round, recompute the frontier from the answers and ask the next. Phase 3 ends when the frontier is empty: nothing left silently assumed. Zero rounds is a valid outcome when the issue, recon and defaults decide everything (typical of a small, well-specified bug).
- **A fact an answer makes you need is yours to find**, never the user's: look it up (in the background if the host allows), ask the questions that don't depend on it now, and hold the downstream ones until it arrives.
- No closing "do we agree?" question: plan approval is the gate.

### Rule: every question carries a reasoned recommendation

No open-ended questions. Each option needs a clear description of what it implies, an explicit recommendation (marked `(Recommended)`), and the reasoning (1-2 lines: why it fits this context better).

> **Which data model should we use?**
> - `ElevationSample { distanceM, vehicleAltM, terrainEltM? }` *(Recommended)*: decouples the widget from app-specific types; each app maps its own payload without touching the widget
> - Pass the app's own waypoint list directly: less boilerplate in the app, but ties the widget to one app's type

| Category | When to ask |
|---|---|
| **Scope boundary** | The boundary is unclear ("just the widget, or also wiring in the apps?") |
| **Data model** | Neutral vs app-specific types, nullable fields, structure the issue doesn't specify |
| **Customization strategy** | Theme-agnostic vs explicit config, callback vs param, if the issue doesn't say |
| **Integration point** | Where in the UI, if the issue doesn't specify |
| **Prerequisites** | A prerequisite is open: unblock strategy or temporary mock |
| **Feature scope** | Edge behaviours the issue doesn't cover (empty state, network error) |
| **Root cause (bug)** | Agent E can't confirm the cause, or needs external data before deciding the fix |
| **Fix scope (bug)** | Backend + client vs one side; optional hardening in or out |

### Don't ask about

- Anything in the issue body or acceptance criteria, or in `Binding decisions`
- Minor implementation details you can decide alone (internal naming, private helpers)
- Plan confirmation ("does this look right?"): approval of the plan is that

---

## PHASE 4: The plan

Once the questions are answered, enter plan mode (or write the plan for explicit approval) and write it to the host's plan file. The terminal state is the host's plan-approval step, never a free-text "ok?".

The plan must contain:

```
## Context
Why this change exists: problem, motivation, expected outcome. Reference to the issue and epic.
If a bug: what Agent E confirmed or disproved. Names each doc gate opened and the rule it gave.

## Decisions to honour
Each decision the issue, its epic or a linked decision issue already made (including `Binding decisions`):
one line with the decision, its source (#NNN), and the Verification step that goes red if the code breaks it.
Take them from the linked issues' resolution comments, not their titles. Write "none" only after reading
every closed linked issue. When the design you are planning breaks one, say so to the user in this turn
(Phase 3 question or the plan note), before the plan is final.

## Unverified
Every causal or factual claim in Context is either observed (file:line, event, command output) or listed here:
a cause attributed by elimination, an event or stack trace you could not fetch, an API you did not open, an
assumption about behaviour on a real device, a guard, redirect or gate whose entry paths (cold load,
in-session navigation) you did not each trace to the guarded line. One line each: the claim, why it is
unobserved, what would settle it. Write "none" only after walking Context line by line.

## Scope guardrails
Explicit list of what is OUT OF SCOPE (the issue's `Out of scope` first). Each item justified in one line.

## Pre-flight (first execution action)
  git start <type> <issue_number>_<snake_case slug, 3-5 words from the title> --json
Type from the label: "bug" → bugfix; "feature"/"task"/other → feature. Never default a bug to feature.
(An epic has no branch.) git-flow aliases are mandatory (Phase 0).

## Files
### CREATE: full path, the file's responsibility
### MODIFY: full path, what changes and why
### CREATE or MODIFY: docs/agents/dev-issue.md, when the profile is missing or a fact in it is stale
### MODIFY: the changelog the profile names, per its policy

## Public API (if widget/model/service)
Constructor, params, types, typedefs, defaults, callback signatures.

## Implementation strategy
For every non-trivial file: key approach + 1-line rationale. Reference reusable existing files (with path).

## Verification
0. Generated code gitignored and not yet built: the profile's regen command once, BEFORE any implementation.
0a. After implementation, regenerate changed providers/models with the profile's regen command; `git status`
    afterwards (a build can delete committed generated files or churn line endings). i18n sources edited:
    the profile's i18n command after it.
1. Branch created (pre-flight).
2. Dependencies resolved (`flutter pub get`, or the workspace bootstrap).
3. Analyze the touched files, test files included: ZERO errors. It only sees files that exist, so run it once
   the tests are written. The repo may not be analyze-clean: a diagnostic is pre-existing when its line lies
   outside the `+` ranges of `git diff -U0`. Use the profile's analyze command; without one,
   `dart analyze --no-fatal-warnings <files>` (explicit files, never directories).
3a. Format the lines you added with the profile's format command (a skipped run ships unformatted lines).
4. Run the tests: all green.
5. Backend code touched: its build/lint on the touched files.
6. The issue's `How to verify` commands, exactly as written, with their output.
7. Changelog policy from the profile applied (entry present, linted).
7a. Every line under "Decisions to honour" has a test or a manual step that proves it; name it here.
    Close-out, before `git c`: re-read those lines against the diff and report each to the user as the test
    that now covers it (file and name) or `manual, not run`; a test the plan promised and the diff lacks is
    written first, or reported as undelivered in that message. Then re-read `## Implementation strategy`,
    `## Scope guardrails` and the test levels in `## Files` against the diff. Every choice the diff made that
    the plan did not state (a rule applied more strictly or loosely, another source or algorithm, a test at
    another level) goes in that same message as a deviation: the choice, the alternative, a recommendation.
    A deviation already raised in chat during the work is listed again with the answer.
7b. Every acceptance criterion and definition-of-done item maps to evidence (file and line, command output,
    test name) in that same message. A criterion with no evidence is listed as not verified.
7c. Lessons (`references/project-profile.md` §Lessons): in the same message, propose at most 2 lines for
    `## Lessons`, or none. They are written only if the user says yes, and go into the same commit.
8. Local gate: the project has `tool/check.dart` → `dart run tool/check.dart` on the final commit, exit 0,
   and only then `git finish`. In projects derived from the starter a hook refuses `git finish` otherwise.
   Other local gate in the profile: run that instead.
9. Close: `git c -m "<message>" --json`, then `git finish --json` (merge into `develop`, `Close #N`).
```

Before writing the plan's `## Files`, Glob the test folder for each touched lib file. Tests usually mirror `lib/`, but the folder can differ, and fakes or robots beside it (`*_fakes.dart`, `*_robot.dart`) are reusable. An existing test file is a MODIFY.

---

## PHASE 5: Self-reflection

Answer internally; the answers feed `## Unverified`, which is always written:

- What am I least confident about in this plan?
- What assumptions did I make without stating them in the plan?
- When the plan orders two or more side effects (a reject then a write, a delete then a save): in what state does each partial failure leave things, and what does the user lose if they then cancel? One `## Unverified` line per state.

Surface to the user **only** an answer that carries real signal (an actual risk, a non-obvious gap). Zero surfaced answers beats filler. A partial-failure state that loses user data or a backend result always counts. Present it as a separate note right after the plan, before the approval step, kept short:
> ⚠ **Note**: [answer]. [1-line reasoning/impact].

---

## PHASE 6: Closing an epic (when the user asks for it)

Before `gh issue close <epic>`: `gh issue view` every linked sub-issue for its state, then take the epic's **Completion Criteria** one by one. Each gets evidence (file and line, command output, issue state), read, not counted: a `grep -c` of an issue number proves nothing about a doc. A criterion with no evidence goes in the close comment as not verified, with what would settle it. The comment is in the issue's language; the user hears the same list in chat.

---

## Invariant behaviors

- **Preconditions first**: no git-flow aliases, no plan. Stop with the install pointer; never install them yourself.
- **Branch in the plan, not before**: the branch is the first execution action, after approval.
- **Branch type = issue label**: bug → bugfix, everything else → feature.
- **Local gate before the merge**: `tool/check.dart` (or the profile's gate) green on the final commit, then `git finish`.
- **The repo is the truth, the profile a cache**: a stale convention is fixed through the plan, not worked around.
- **Learn on the project, never in the skill**: facts and lessons go to `docs/agents/dev-issue.md`; lessons only on the user's yes.
- **Scope first, then the frontier**: Phase 2 mismatches are round 1; never ask a question whose options depend on an unanswered one; never reopen a `Binding decision`.
- **Never trust a narrated root cause without verification (bug)**: read the current code and git history of the cited file before planning a fix.
- **Don't assume Dart-only**: check for backend code (`functions/`, `scripts/`) before declaring something out of the repo.
- **Every question carries a recommendation**: guide the user, don't offload the decision.
- **Plan approval is the gate**: no free-text "ok?".
- **No goldplating**: don't add features or refactors the issue didn't ask for.
- **Deviations go to the user, in chat**: when the code cannot meet a "Decisions to honour" line, or you notice the approved plan breaks one, stop and tell the user in that turn with the alternatives and a recommendation. The same holds for any behaviour you are about to implement that the plan states differently or not at all: raise it the moment you choose; 7a is the backstop. A code comment or a plan footnote does not count as telling them.
- **Verify APIs before planning around them**: every package symbol the plan names goes through the **API check** in Phase 1, not during implementation.
- **Null-safe Dart**: never `.catchError((_) => null)` on `Future<T?>`; use try/catch, the runtime rejects a bare `null` return from the handler.
- **Riverpod autoDispose in tests**: `container.listen(provider, cb)` without assigning gets garbage-collected immediately; always `final sub = container.listen(...); try { await ... } finally { sub.close(); }`.
- **Other skills, when installed**: `superpowers:brainstorming` and `superpowers:writing-plans` are replaced by Phase 3 and Phase 4 inside this skill; at execution, test-first and verify-before-completion habits apply. Absent: nothing to do.
