# 0007 — retro v2: the sixth question, "What worked well"

## Status

Accepted (wayfinder ticket #62, map #57). Amended by [ADR 0012](0012-retro-positive-loop.md): Q6 may
now produce one evidence-backed proposal (decision 4 and the #64 consequence no longer hold).
Amended by [ADR 0013](0013-retro-q2-q3-actions-and-closing-question.md): a closing step follows
Q6 and `Ambiente`; the set stays six questions.

## Context

ADR 0006 (#58) decided `retro` splits from a new `tune-setup` skill rather than growing to
absorb every positive-side question from the blog source, but left one thing open: of the
blog's four positive-reflection questions, two ("What repetitive instructions could become a
slash command?", "Should this workflow become a custom agent or skill?") were pre-decided as
absorbed into `retro`'s existing `automation` category rather than entering as new questions.
The other two — "What worked well in this session that we should standardize?" and "Which
prompts or approaches were particularly effective?" — were left conditional on #60 (T3)
confirming the underlying evidence is actually extractable from the transcript, per the map's
non-negotiable rule: no question without a verifiable event.

#60 closed with exactly that confirmation. Relevant findings carried over into this decision:

- `Skill` `tool_use` blocks (name, `input.skill`, `input.args`) are fully structured and
  reliably extractable — same shape as the `Bash`/`Edit` blocks `session-evidence.js` already
  reads.
- `skill_listing` events record which skills were *offered* for a turn, so cross-referencing
  against which `Skill` blocks actually fired gives "available but unused" as a byproduct —
  relevant to #63, not directly needed here.
- No new field was found that positively signals "this specific approach succeeded" beyond
  what `session-evidence.js`'s existing counts already imply by absence (zero errors on a
  tool, no repeated commands). A "worked well" answer is gounded the same way retro's Q1–Q4
  already are: the model's own record of what it did this session, optionally cross-checked
  against Passo 0's counts — not a new structured extractor.

`retro`'s design already has a load-bearing asymmetry worth restating here: only **Q5**
(smoother session / friction) is required to cite Passo 0's script output, because it's the
one question at risk of the model fabricating a plausible-sounding failure that never
happened. Q1–Q4 are self-reflective and draw on the model's own in-context memory of the
session, which is reliable pre-compaction — the exact condition under which retro is designed
to run (`SKILL.md:13`).

## Decision

**1. One new question enters `retro` as Q6 — "What worked well".** Not "which prompts were
effective": that candidate is dropped as redundant, since in practice both would draw on the
identical evidence (a skill invocation or pattern that produced a clean run) and phrasing them
separately would just pay context twice for one answer. "What worked well" subsumes it.

Wording, matching the existing five questions' style (`SKILL.md:43-47`):

> 6. **What worked well** — Name one concrete pattern from this session worth repeating: a
> skill invocation that paid off, a sequence that avoided rework, a decision that held up
> under later pressure. Must name a specific artifact (skill name, tool sequence, file, commit)
> — no generic praise ("things went smoothly"). If nothing genuinely stands out, say so plainly
> instead of manufacturing a compliment — same standard Q5 already applies to its negative
> case.

**2. `retro` grows to 6 questions, not 5 rewritten into fewer.** The five existing
deficit-oriented questions are unchanged — this ticket doesn't touch their wording, and doing
so wasn't its job. Q6 is appended as a sixth, independent section, same report structure
(separate section, same "cite a concrete artifact" rule from the skill's intro).

**3. Q6 lives in `retro`, not `tune-setup`.** ADR 0006's rationale for the split was
specifically the config audit's cadence (on-demand) and cost (~4,160 tokens, ~11× the evidence
cap) — neither applies here. Q6's evidence is pure transcript self-reflection, the same cost
class as Q1–Q4, and fits retro's per-task cadence exactly as they do. Splitting it into
`tune-setup` purely for positive/negative symmetry would have been framing-driven, not
evidence- or cost-driven, and the map's own rule is evidence-driven.

**4. No `session-evidence.js` change required.** Q6 does not need a new Passo 0 extractor.
It follows the same pattern as Q1–Q4: self-reflective, grounded in the model's own record of
the session, not gated on the script. This keeps #61's fix as the last required change to that
file for this map — #66 does not need to reopen it for Q6's sake. (A future skill-invocation
counter in Passo 0 remains a reasonable enhancement on its own merits, but it is not a
prerequisite for Q6 and is not decided here.)

**5. The two ADR-0006-absorbed questions are not reopened.** "Repetitive instructions → slash
command" and "should this become an agent/skill" stay merged into `retro`'s existing
`automation` category rewrite (still #66's job), not promoted to standalone questions. This
ticket confirms that call rather than re-litigating it.

## Consequences

- **#66** (build) now has the complete question-set spec for `retro`: six questions total,
  Q1–Q5 verbatim as they exist today, Q6 as worded above appended after Q5, `automation`
  category rewritten per ADR 0006 to explicitly cover the two absorbed blog questions. No
  `session-evidence.js` changes needed beyond #61's already-merged fix.
- **#64** (proposal routing) is unaffected by this ticket — Q6 produces a reflection answer in
  the report body, not a `Persistenza`-table proposal, so it doesn't interact with the
  3-proposal cap or the destination table `#64` is extending.
- **#65** (report prototype) drafts the sample report with Q6 included as a sixth section,
  ordered after Q5, before the Ship handoff section.
- `tune-setup`'s own question set remains undecided — #62 was scoped to `retro`'s set only,
  since ADR 0006 already established that config-audit-shaped content (its actual job) is
  separate work with separate evidence, not something this ticket needed to spec.
