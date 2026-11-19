# 0006 — retro v2: split into `retro` + `tune-setup`

## Status

Accepted (wayfinder ticket #58, map #57). Decision 1 ("`retro` stays exactly as it is") is
partially superseded by [0011](0011-retro-v3-environment-lens.md); decisions 2-6 still hold.

## Context

Map #57 wants `retro` to stop being a pure end-of-task audit and start proposing
evidence-backed optimizations to workflow and configuration — so a session's friction becomes
the next session's config, per the sourced blog post's "Ask reflection questions" and
"Capturing learnings" sections. #58 is the map's first decision ticket: does that new
capability grow inside `retro`, or does `retro` split into two skills? It blocks #62 (question
set) and #63 (config audit surface), which in turn block #64 → #65 → #66.

### What `retro` is today

`skills/retro/SKILL.md` runs 5 deficit-oriented questions (least confident, what the user is
missing, most likely 3-month failure, unstated assumptions, smoother session), backed by
`skills/retro/scripts/session-evidence.js` reading the current session's `.jsonl` transcript.
Its design has two invariants directly relevant to this decision:

- **Runs before compaction** (`SKILL.md:13`): "dopo la compattazione Q5 lavora su un riassunto
  lossy invece che sui fatti" — it is explicitly a tight-context operation, triggered at the
  single worst moment in a session's life for adding more work.
- **`OUTPUT_LINE_CAP = 40`** (`session-evidence.js:39`), with the rationale spelled out in the
  file's own header comment (lines 22–24): "this runs at the end of a session, when context is
  already tightest." The cap exists to protect this specific invariant, not as an arbitrary
  limit.

Persistence already has 3 destinations (auto-memory / `CLAUDE.md` proposal / skill-hook
proposal) and a hard cap of **max 3 proposals**, with 4 categories: `skill gap`, `friction`,
`knowledge`, `automation`. The `automation` category (`SKILL.md:88`) already reads "pattern
ripetuto che potrebbe diventare skill/hook/script."

### Grilling session — facts gathered and decisions made

Per #57 Notes, `grilling` was run on this question (round-based design tree; recommended
answers proposed, decisions left to the user). Two facts were fetched during the session,
not assumed:

- **`~/.claude/skills/handoff`** — per-conversation task-continuity doc for a fresh agent
  picking up mid-task; manual invocation only, single-session scope, no config critique. No
  functional overlap with a setup-tuning capability: different job entirely (carries task
  state forward vs. carries setup-improvement signal forward).
- **Config-audit token cost** — measured on this repo as a stand-in target project: `CLAUDE.md`
  (18 lines / 1,458 chars) + `.claude/settings.json` + `.claude/settings.local.json` (50 lines /
  3,050 chars combined) + `agents/` (372 lines / 12,131 chars) = **440 lines, ~4,160 tokens**.
  That is **~11× `OUTPUT_LINE_CAP`** on this repo's surfaces alone, before counting a real
  target project's larger `agents/` or `.claude/settings.json`. A config audit run inside
  `retro` would violate the exact invariant `OUTPUT_LINE_CAP` exists to protect.

`second-opinion` (`skills/second-opinion/SKILL.md`) was checked and confirmed to have no
overlap: it spawns a Gemini consultant for architecture/implementation-choice review, an
unrelated job. #57's "Not yet specified" flagged this pairing as an open question; it closes
here as *not a real overlap*.

## Decision

**1. Split.** `retro` stays exactly as it is today — 5 deficit questions, runs before
compaction at end-of-task, `OUTPUT_LINE_CAP = 40`, unchanged persistence table and 3-proposal
cap. A new skill, **`tune-setup`**, owns everything cross-session and config-shaped: the
config audit (`CLAUDE.md`, `.claude/settings.json`, hooks, `agents/`, skill descriptions that
should have triggered and didn't — #63's scope) plus whichever of the blog's positive-side
questions survive #62's evidence check (T3/#60 must confirm each is extractable from the
transcript before it enters either skill's question set — the map's non-negotiable rule).

Rationale, both legs independently sufficient: the cadence answer below is incompatible with
`retro`'s every-task-end trigger, and the measured token cost is incompatible with its
tight-context design invariant. Either alone would justify not growing `retro`; together they
rule it out.

**2. Cadence: on-demand only, explicit invocation.** `tune-setup` never fires automatically —
not at every task end, not at milestone or release boundaries. The user invokes it by name
(`/tune-setup`, "ottimizza il setup", "audit config") when they actually want a setup review.
This keeps `retro`'s per-task cost flat regardless of `tune-setup`'s existence.

**3. `automation` overlap: absorb, don't duplicate.** Of the blog's four positive questions,
two ("What repetitive instructions could become a slash command?", "Should this workflow
become a custom agent or skill?") are already `automation`'s job in `retro`
(`SKILL.md:88`). They are **not** re-asked in `tune-setup` — `automation`'s wording gets
rewritten (by #66) to cover them explicitly, closing the gap in place. Only the other two
("What worked well that we should standardize?", "Which prompts/approaches were particularly
effective?") are genuinely new content, and only if #60 confirms the transcript exposes
evidence for them; that confirmation and the final question wording are #62's job, not this
ticket's.

**4. Repo-boundary ownership: always `retro`.** When friction traces back to a toolkit skill
itself (not the target project), the cross-repo proposal — an issue on
`iamantoniodinuzzo/flutter-toolkit` — stays `retro`'s responsibility, independent of the split.
`retro` already runs once per task and already sees the toolkit-vs-project distinction in its
own evidence; `tune-setup` runs rarely and on a schedule the user controls, which is the wrong
cadence for catching this in the moment. This settles ownership only — the routing mechanics
and whether it shares `retro`'s 3-proposal cap are #64's job.

**5. Handoff: none.** No data channel between the two skills. `retro`'s final report may
mention `tune-setup` by name (e.g., "for a broader setup review, run `tune-setup`") but passes
no state, evidence, or accumulated signal across the boundary. Consistent with on-demand-only
cadence: the user decides if and when to run `tune-setup`, so there is nothing for `retro` to
stage in advance.

**6. Multi-transcript aggregation: deferred, out of scope for v1.** #57 made this
conditional on the split winning; it has now won, but no evidence yet exists on how
`session-evidence.js`'s single-transcript model would scale to multiple `.jsonl` files — that
characterization is T3/#60's job and hasn't run. `tune-setup` v1 operates on the current
session only, same as `retro` today. Multi-transcript aggregation becomes a future issue once
#60 lands, not part of #66's build.

## Consequences

- **#62** (question set) now knows: it is choosing `tune-setup`'s question set, not adding to
  `retro`'s. The two `automation`-overlapping blog questions are pre-decided out; only the
  "worked well" / "effective prompts" pair remains open, gated on #60's evidence confirmation.
- **#63** (config audit surface) now knows: it is scoping `tune-setup`, not `retro` — the
  ~4,160-token measurement above is the number it should treat as the floor for what would
  have broken `retro`'s cap, not a ceiling it needs to hit itself.
- **#64** (proposal routing) now knows: two skill files exist, not one — its persistence-table
  extension covers both, and the repo-boundary destination is confirmed `retro`'s regardless
  of anything else #64 decides.
- **#65** (report prototype) drafts two reports, not one: `retro`'s unchanged
  Applied/Proposed/No-action shape, and a first draft of `tune-setup`'s own report shape
  (not yet designed — this ADR does not specify it).
- **#66** (build + release) now knows the file surface: `skills/retro/SKILL.md` gets the
  `automation` category rewrite only (no new questions, no structural change); a new
  `skills/tune-setup/SKILL.md` (and any supporting scripts #63/#65 call for) is created from
  scratch. Two skills to register, not one, in `README.md` / `ai_docs/ARCHITECTURE.md`'s
  skill surface listing.
- **Repo has no skill-behavior test mechanism.** Carried forward from #57's "Not yet
  specified" without being resolved here: #66 ships both `retro`'s rewrite and `tune-setup`
  unverified by any automated check, same as every other skill in this repo today. Recording
  it here so #66 doesn't have to re-derive it from #57.
- `skills/retro/**` is untouched by this ticket. This ADR is a decision record only — the
  `automation` rewrite and the new `tune-setup/SKILL.md` are #66's build work.
