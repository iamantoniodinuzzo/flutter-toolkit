# 0009 — proposal routing and caps across the repo boundary

## Status

Accepted (wayfinder ticket #64, map #57). Amended by
[ADR 0013](0013-retro-q2-q3-actions-and-closing-question.md): a destination "Issue nel repo del
progetto" and a separate pool of at most 3 issue drafts; the cap of 3 for `Proposed` is unchanged.
Amended by [ADR 0014](0014-tune-setup-surface-scope-and-memory-index.md): a `tune-setup` batch
counts as one proposal in its cap of 5 and always waits for an ok.

## Context

`retro`'s current persistence table (`skills/retro/SKILL.md:56-66`) has three destinations —
auto-memory (auto-applied), `CLAUDE.md` of the target project (proposed), and a generic
"skill / hook spec" (proposed) — under a hard cap of max 3 proposals per report. ADR 0006
(#58) and ADR 0008 (#63) between them introduced surfaces this table doesn't yet name: the
full config-audit surface (`settings.json`, hooks, `agents/`, not just `CLAUDE.md`), new
automation-target shapes (a slash command, a subagent — not just "a skill or hook"), and a
destination that crosses a repository boundary entirely: an issue on
`iamantoniodinuzzo/flutter-toolkit` itself, when the friction traces back to a toolkit skill
rather than the target project retro/`tune-setup` are running in.

ADR 0006 stated cross-repo ownership "always retro," reasoning that retro's every-task cadence
catches this kind of friction in the moment while `tune-setup` runs rarely, on the user's own
schedule. But ADR 0006 also decided there is **no handoff channel** between the two skills
(decision 5) — so if `tune-setup`'s own audit (specifically its skill-trigger-miss check,
ADR 0008 decision 6) surfaces a toolkit-caused problem, there is no mechanism for it to route
that finding through `retro`. This ticket resolves that gap: ADR 0006's "always retro" is
refined here to describe the *typical* case, not an exclusivity rule neither skill can act
outside of.

## Decision

**1. Persistence table, extended to five rows:**

| Destination | When | Who approves |
|---|---|---|
| Auto-memory topic file + `MEMORY.md` line | Default; unchanged from today | Auto-applied |
| Config of the target project (`CLAUDE.md` / `.claude/settings.json` / hooks / `agents/`) | Permanent convention that should guide every future session, or a config surface ADR 0008 flagged as broken/stale | Proposed — awaits ok |
| Automation spec (skill / hook / slash command / subagent) | Repeated pattern that should become reusable automation — generalizes the existing "skill / hook spec" row to also cover the two new shapes named in this ticket ("effective repeated prompt" → slash command, "recurring domain expertise" → subagent) | Proposed — awaits ok |
| Cross-repo toolkit issue (`iamantoniodinuzzo/flutter-toolkit`) | Friction traces back to a toolkit skill itself, not the target project | Proposed — awaits ok |

The "config of the target project" row generalizes the old "`CLAUDE.md` del progetto" row —
same approval tier, wider scope, aligned to ADR 0008's full audit surface. The "Automation
spec" row generalizes the old "Skill / hook spec" row the same way, absorbing the two new
shapes rather than adding two more standalone rows — they share one approval tier and one
underlying judgment ("this pattern is worth turning into reusable automation"), so a single
row stays truer to the table's existing shape than fragmenting it by artifact type.

**2. Cross-repo issue mechanism: `gh issue create --repo iamantoniodinuzzo/flutter-toolkit`,
explicit repo flag.** Never inferred from the current directory's `git remote` — that remote
points at the target project, not the toolkit, precisely because retro/`tune-setup` run
*in* the target project. Always "Proposed — awaits ok": opening a public issue on a different
repository is never a silent default, regardless of which skill is proposing it.

**3. Both skills can produce a cross-repo issue proposal, independently.** ADR 0006's "always
retro" described the common case — retro's every-task cadence usually catches toolkit-caused
friction first — but does not prohibit `tune-setup` from producing the same destination type
when its own audit (in particular skill-trigger-miss) implicates a toolkit skill. Given ADR
0006 already ruled out a handoff channel between the two, requiring the finding to wait for
`retro` would just lose it. Each skill must be self-sufficient with the destinations it needs.

**4. Caps: separate pools, owned by the producing skill, not the destination type.** `retro`
keeps its existing cap of max 3 proposals per report, unchanged (ADR 0006). `tune-setup` gets
its own independent cap, sized for the fact that it runs rarely, on-demand, over a five-surface
audit that can legitimately turn up more than three findings in one pass — a default of **5**,
one per audited surface as a rough guide, tunable by #66 if a real audit run proves that number
wrong in practice. A proposal counts against whichever skill's report it appears in — a
cross-repo issue found by `retro` counts in retro's 3; the same destination type found by
`tune-setup` counts in tune-setup's 5. Caps protect a report's share of the user's attention,
not a destination type's; splitting them by producer rather than by shape keeps that intent
intact now that two skills produce overlapping destination types.

## Consequences

- **#65** (report prototype) now has the complete destination vocabulary and both caps to
  draft against — five destinations, retro capped at 3, `tune-setup` capped at 5 (default,
  adjustable), ownership resolved per-producer not per-destination.
- **#66** (build) implements the extended table in `skills/retro/SKILL.md` (rows 2 and 3
  generalized as above, row 4 added) and specs the equivalent table for the new
  `skills/tune-setup/SKILL.md`, including the `gh issue create --repo` mechanism and its
  "always proposed" rule in both places.
- This ADR narrows ADR 0006's "confine di repo sempre di competenza di retro" language: it
  now reads as the expected common case, not a rule that blocks `tune-setup` from acting on
  its own evidence. Anyone reading ADR 0006 in isolation should be pointed here for the
  refinement.
