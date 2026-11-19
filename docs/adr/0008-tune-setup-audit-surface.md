# 0008 — `tune-setup`'s config audit surface, and how it gets evidence

## Status

Accepted (wayfinder ticket #63, map #57). Amended by
[ADR 0014](0014-tune-setup-surface-scope-and-memory-index.md): `--surface` scopes the audit to one
surface, `memory-index` is reachable only that way, and a size trigger skips the transcript evidence.

## Context

ADR 0006 (#58) created `tune-setup` specifically to hold config-audit-shaped work that's too
expensive and too differently-paced for `retro`. ADR 0007 (#62) then scoped `retro`'s own
question set and explicitly left `tune-setup`'s content undecided. #63 is that decision: what
does `tune-setup` actually read and critique, and what transcript evidence backs each claim,
per the map's non-negotiable rule (no config-change proposal without a verifiable event).

The issue named five candidate surfaces and one concrete worked example: a hook in this very
session injecting "MANDATORY: run graphify before reading source files" repeatedly — the kind
of pattern (`repeated instruction via hook, ignored or followed at cost`) a config audit should
be able to name and propose revising.

#60 (T3)'s inventory supplies the evidence base this ticket draws on:

- `Skill` `tool_use` blocks (structured: name, `input.skill`, `input.args`) — reliable.
- `skill_listing` events record which skills were *offered* in a turn; cross-referenced
  against which `Skill` blocks actually fired, this yields "available but never invoked."
- `hook_additional_context` / `hook_system_message` — both carry `hookName` + injected
  content; the graphify-reminder pattern named in the issue is literally repeated occurrences
  of the same `hookName` with the same (or near-identical) content.
- `hook_cancelled` — a hook that timed out or was killed; a config-health failure signal, not
  a repetition pattern.
- `toolDenialKind` (`user-rejected` / `permission-rule` / `automode-blocked`) — #60 already
  established only `user-rejected` represents real friction; the other two are guardrails
  working as configured.

## Decision

**1. All five named surfaces are in scope for v1**: `CLAUDE.md` (target project root),
`.claude/settings.json` + `.claude/settings.local.json`, hook definitions (wherever
configured — inline in `settings.json` or a dedicated hooks file), `agents/`, and
skill-trigger-miss detection. ADR 0006 already accepted the cost of auditing all of these
(the ~4,160-token measurement was taken across exactly this surface set) — trimming any of
them now would leave the concrete example the issue opens with (the repeated hook) out of
scope, which defeats the ticket.

**2. Evidence mechanism: extend `session-evidence.js`, gated behind an opt-in flag — not a
second script.** The transcript-derived half of the audit (skill invocations, hook-repetition
detection, `hook_cancelled`, `toolDenialKind` breakdown) reuses the same `.jsonl` parser
`session-evidence.js` already has, verified correct in #59/#61, rather than duplicating that
parsing logic in a new file. But `retro` calls this script on every task end, and ADR 0006
protects that call's cost specifically (`OUTPUT_LINE_CAP = 40`) — so the new blocks must not
appear in `retro`'s default invocation.

Concretely: a new flag (e.g. `--config-audit`) turns the new blocks on; without it, the
script's output is byte-for-byte what it is today. `retro` never passes the flag. `tune-setup`
always does. The new blocks use their own line cap, separate from `OUTPUT_LINE_CAP`, sized
larger since `tune-setup`'s cost budget is already a different class from `retro`'s (ADR
0006). The exact cap number is #66's implementation call, not gated here — the only
requirement this ADR sets is that it exists as a distinct constant and is not silently folded
into `OUTPUT_LINE_CAP`.

Reading the config *files themselves* (`CLAUDE.md`, `settings.json`, `settings.local.json`,
`agents/*`) is not part of this script at all — those are single small files read directly via
the `Read` tool when `tune-setup` runs, the same way any skill reads project files. Only the
`.jsonl`-derived counters go through the extended script.

**3. Repeated-hook-injection rule: same `hookName` + content appearing more than twice.**
Matches the threshold already established for "files edited >2x" in the same file, rather than
inventing a new number — 2 is the boundary between "happened once or twice, unremarkable" and
"happened repeatedly, worth a line." The bash-command threshold (`>1`) is deliberately not
reused here: a hook firing on every matching tool call is normal by design (that's what a hook
does); it takes an actual repeat run to distinguish signal from the hook simply doing its job
a modest number of times.

**4. `hook_cancelled` is reported on any occurrence — no threshold.** A hook timing out or
being killed is a failure, not a repetition pattern; the count that matters is whether it
happened at all, not how many times.

**5. `toolDenialKind` reporting keeps the three values distinct, per #60's caveat.**
`user-rejected` counts as friction and is reported with its paired `userFeedback` text quoted
when present — the user's own stated reason, directly actionable. `permission-rule` and
`automode-blocked` are reported separately, framed as confirmation the config enforced itself
correctly, not as friction — conflating them with `user-rejected` would misreport working
guardrails as user pushback.

**6. Skill-trigger-miss allows semantic judgment, anchored to a structural fact.** The
extended script supplies the anchor: skill X appeared in `skill_listing` at turn N and was
never invoked as a `Skill` `tool_use` anywhere in the session. `tune-setup` itself — not the
script — then reasons about whether X's frontmatter description matches what happened at turn
N closely enough that it should have fired, and states that judgment citing the turn and the
skill's own description text as evidence. This is deliberately different from `retro`'s Q5,
which is restricted to pure structural aggregation because it runs at the tightest, most
compaction-exposed point in a session; `tune-setup` runs on-demand with more room and exists
specifically to make judgment calls and propose changes, not just tally events. The
non-negotiable rule ("no proposal without a verifiable event") is satisfied by the structural
anchor; the judgment layered on top is `tune-setup`'s actual job, not a violation of the rule.

## Consequences

- **#66** (build) now has `tune-setup`'s complete audit spec: five surfaces, an opt-in
  `--config-audit` flag on `session-evidence.js` with a separate output cap, five concrete
  detection rules (repeated hook >2, `hook_cancelled` any, `toolDenialKind` 3-way split with
  `userFeedback` quoting, skill-listing-vs-invoked structural anchor, semantic trigger-miss
  judgment on top of it). `retro`'s own call site is untouched — confirmed here, not just
  assumed: it must keep omitting the new flag.
- **#64** (proposal routing) now knows what kinds of findings `tune-setup` produces — a hook
  worth revising, a permission rule worth loosening, a skill description worth rewriting, an
  agent file worth checking — each needing a persistence destination, on top of the two
  ADR-0006 destinations (auto-memory / cross-repo toolkit issue) `retro` already has.
- **#65** (report prototype) drafts `tune-setup`'s own report shape against this concrete
  surface list, not an abstract one — it can use this session's own repeated graphify-hook
  reminder as its worked example, since that's the exact case the issue and this ADR both
  anchor to.
- `session-evidence.js` is not touched by this ticket — the flag, new blocks, and separate cap
  are #66's implementation work, matching the pattern already set by ADR 0006/0007 (decision
  tickets record what and why; build tickets touch files).
