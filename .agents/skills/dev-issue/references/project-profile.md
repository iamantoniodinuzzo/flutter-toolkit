# Project profile: `docs/agents/dev-issue.md`

The skill carries no project facts. Each project keeps its own in `docs/agents/dev-issue.md`, committed with the code: shared with the team, and untouched by plugin updates (the installed skill directory is replaced on every release, so nothing learned may be stored there).

The profile is a **cache, not a source of truth**: the repo wins. A fact that no longer matches the repo is corrected in the next plan (`MODIFY docs/agents/dev-issue.md`).

## Bootstrap (no profile yet)

Plan mode forbids repo edits, so the profile is born inside the issue's plan:

1. Phase 1 runs the discovery below and uses what it finds right away.
2. The plan lists `CREATE docs/agents/dev-issue.md` with the discovered content, committed on the issue branch with the rest of the work.
3. A profile exists but a fact in it is wrong or a new one was needed: the plan lists `MODIFY docs/agents/dev-issue.md` with the corrected line.

Show the draft profile in the plan; the user approves it with the plan.

## Discovery checklist

Fill each row from the repo. A row with no evidence reads `none` or `unknown`; never guess.

| Fact | Where to look |
|---|---|
| Layout: single app, Melos/pub workspace, packages, apps | `pubspec.yaml` (`workspace:`), `melos.yaml`, `apps/`, `packages/` |
| Project rules the plan must honour | `CLAUDE.md`, `AGENTS.md`, `docs/agents/*`: every "Before X, read Y" line |
| Local gate | `tool/check.dart` (run before `git finish`), else `melos run` scripts, CI workflow commands |
| Analyze command | `tool/`, `melos.yaml`, `analysis_options.yaml`, CI |
| Format command | same sources; note whether it formats only changed lines |
| Test command and test folder layout | `test/` mirrors `lib/`? fakes/robots next to tests? |
| Generated code | `.g.dart` / `.freezed.dart` gitignored? (`git check-ignore -v lib/placeholder.g.dart`), the regen command |
| i18n | `slang`, `*.i18n.json`, `l10n.yaml`: the regen command and when it must run |
| Shared package | a UI/core package the apps depend on, and its public entry point |
| Backend or non-Dart code | `functions/`, `scripts/`, `server/`: the build/lint command |
| Changelog policy | `CHANGELOG.md` location, `## Unreleased` section, lint command |
| Dependency lock | where `pubspec.lock` lives (workspace root vs app) and the pub cache path on this OS |
| Issue conventions | `.github/ISSUE_TEMPLATE/`, label names for bug/feature/epic, starter section format |
| Sentry org | only if the project uses Sentry: slug from `sentry.properties`, `pubspec.yaml`, or an issue link |

## File template

```markdown
# dev-issue project profile

Read by the `dev-issue` skill. Facts are a cache: the repo wins. Update through an issue plan.

## Conventions

- layout: <single app | workspace: apps/*, packages/*>
- local gate: <command or none>
- analyze: <command>
- format: <command>
- test: <command>; tests live in <path pattern>
- codegen: <gitignored yes/no>; regen: <command or none>
- i18n: <command or none>
- shared package: <path or none>
- backend: <path + lint command or none>
- changelog: <path, section, lint command or none>
- pubspec.lock: <path>
- doc gates: <each "Before X, read Y" from CLAUDE.md, one line each>
- sentry org: <slug or none>

## Lessons

<!-- one line each: what went wrong or nearly did, what to do instead, and this project's issue number -->
```

## Lessons

A lesson is a rule this project paid for: something that went wrong, or nearly did, during an issue.

- **Proposed, never silent.** At close-out, in the same message as the deviations, the skill proposes at most **2** lines. It writes them to `## Lessons` only after the user says yes, and they go into the same commit as the work (`git c`).
- **Format.** `- <rule, imperative>. (#<issue> in this project: <what happened>)`. The number is the project's own issue, never one from another repo.
- **Bar.** Skip anything the code, `CLAUDE.md` or git history already records. Skip one-off bad luck. Keep what would change how the next issue is planned.
- **Dedup.** Read `## Lessons` first; update the existing line instead of adding a near-duplicate.
- **Use.** Phase 0.5 reads `## Lessons` and applies each one that matches the issue at hand; the plan names which lesson shaped which step.
