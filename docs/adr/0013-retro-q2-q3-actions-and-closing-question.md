# 0013 — retro: an action for every Q2/Q3 finding, and a closing question

## Status

Accepted (issue #108). Amends ADR 0007 (the question set gains a closing step, not a Q7) and
ADR 0009 (a new destination and a second, separate cap). Leaves the cap of 3 for `Proposed`
(ADR 0006, ADR 0009) unchanged.

## Context

Q2 ("what the user is missing") and Q3 ("most likely 3-month failure") end on a diagnosis. The
report format (`Applied` / `Reported` / `Proposed` / `No action`) covers what the session
*learned* (memory, configuration, automation), not the work Q2 and Q3 *discover* on the
deliverable. In a real session (three issues in a Flutter monorepo) Q2 and Q3 produced seven
findings, none with an owner or a next step; the user had to ask separately for issues and
noticed that the skill never suggested it.

## Decision

**1. Every Q2 and Q3 finding closes with `Azione:`**, one of `issue`, `test`, `doc`, `memoria`,
`nessuna (<motivo>)`. `issue` carries a two-line draft (title; what must be true when the work is
done). In Q3 the cheapest mitigation is the finding's action. `nessuna (<motivo>)` is a valid
value; inventing an action to fill the field is an anti-pattern.

**2. A closing question**, asked verbatim in English after Q6 and the `Ambiente` block: "Is there
anything else substantial that is worth saving for later from the context of this session?" The
answer is written in the conversation language and contains only what is not already in
`Applied`, `Reported`, `Proposed` or a Q2/Q3 `Azione:`. It is a step, not a seventh question: the
set of questions stays six.

**3. New destination "Issue nel repo del progetto"**, always "Proposta — aspetta l'ok". `retro`
presents title and draft; it never runs `gh issue create` and never reads the project's issue
templates (ADR 0011: no configuration files are read). Creation is left to the user or their
issue skill. It is distinct from the cross-repo toolkit issue of ADR 0009.

**4. Separate cap.** Issue drafts have their own pool of **at most 3**, ordered by origin
(Q3, Q2, closing question), the rest going to `No action` with the reason. The pool neither uses
nor frees slots of the `Proposed` cap. Rationale: drafts are follow-up work on the deliverable,
not learnings about the session; a shared cap would let one kind displace the other. A report can
therefore hold up to 3 + 3 items.

**5. Source of the phrasing.** The wording comes from an r/ClaudeCode post pointed to by the
user. The page answers 403 to automated clients, so its content could not be checked: `SKILL.md`
cites the link and states that the attribution is unverified.

## Consequences

- `skills/retro/SKILL.md`: `Azione (Q2, Q3)` paragraph under Q3, new `## Domanda di chiusura`
  section between `Ambiente` and `Ship handoff`, new row in `Persistenza`, new `Issue da aprire`
  block in the report, extended "one fact once" rule and anti-patterns.
- No change to `session-evidence.js` or any Passo 0 extractor: the new steps use no new evidence.
- `skill-structure.test.js` checks section order, the presence of the action values, the verbatim
  question, the new destination and the report block; `BEHAVIOR_CHECKLIST.md` gains the properties
  only a reading of the report can show.
- A report can be longer. The cap of 3 drafts and the "one fact once" rule bound it.
- Out of scope: opening issues automatically, reading the project's issue templates, sections
  beyond the closing question.
- Version bump follows the release flow after merge (`scripts/bump-version.sh`).
