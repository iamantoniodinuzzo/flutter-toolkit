# 0014 — tune-setup: single-surface scope and memory-index pruning

## Status

Accepted (issue #109). Amends ADR 0008 (audit surface and evidence: a scope argument, and a
size trigger that skips the transcript evidence) and ADR 0009 (a batch counts as one proposal
and always waits for an ok). Leaves the `--config-audit` output of `session-evidence.js`
unchanged.

## Context

`retro` lights the `global agents.md` signal (loaded instructions above `AGENTS_MD_TOTAL_CHARS`)
and defers the judgment on content to `tune-setup`. Run on a real case, pruning a `MEMORY.md`
index of about 150 notes and 14,900 characters, the skill had no path for it:

- Passo 0 and Passo 1 went through all five surfaces even for a request about one file.
- The transcript evidence is empty for a size trigger (0 errors, 0 hooks, 0 denials, 67 offered
  skills never invoked, all irrelevant) and the skill asked for it anyway.
- There were no criteria for judging a memory index; they were improvised by hand.
- The report had no shape for "applied": a prune is one batch edit, not five proposals, and needs
  a before/after and a check that every pointer still resolves.
- The session that prunes keeps seeing the old loaded total, because `retro` reads loaded
  instructions from the transcript.

## Decision

**1. `--surface <nome>` limits Passo 0 and Passo 1 to one surface.** Values: `istruzioni`,
`impostazioni`, `hook`, `agenti`, `skill-trigger`, `memory-index`. Without it the audit is the
five surfaces of ADR 0008. The other surfaces do not appear in a scoped report, not even as
"nessun finding"; one line states the scope.

**2. The memory index is not a sixth surface of the full audit.** It is reached only with
`--surface memory-index`. The full audit keeps its five surfaces and its cost.

**3. Size trigger.** When the cause is a size threshold, transcript counters (errors, hooks,
denials, offered skills) are not evidence for the finding. Valid evidence is size per file and
length per line, measured in Passo 1. With `memory-index` Passo 0 does not run; unscoped it runs
and the report says its output is not evidence for that finding.

**4. Pruning criteria for a memory index**, each with its proof: an entry citing a closed issue
(checked read-only with `gh issue view`), a line carrying the fact instead of a condition to read
the note, and reachability of a removed entry by Glob/Grep over the memory directory. A pointer
check closes the step: every index link resolves, every file is indexed or declared orphan.

**5. A prune is a batch, always a proposal.** One proposal in the cap of 5, however many entries
it touches, and never applied without an explicit ok, even when native memory writes are
authorized: removing entries is hard to undo. After the ok it is applied and reported as `Lotto`
with measured before/after, the removed and rewritten entries, and the pointer check.

**6. Re-measure in a new session.** The before/after in the report is measured on disk. The
loaded total is confirmed by `retro` (`global agents.md` line) in a new session.

## Consequences

- `skills/tune-setup/SKILL.md`: new `## Ambito` section, size-trigger paragraph in Passo 0, scoped
  read in Passo 1, `### Indice di memoria` subsection, new row in `Persistenza`, `Lotto` block and
  `batch` category in the report, four new anti-patterns.
- No change to `session-evidence.js`, `retro-lens.js` or the `--config-audit` output: the new steps
  use no new evidence, and ADR 0008's byte-for-byte guarantee holds.
- Out of scope: the `navigation` counting of Grep calls with results (#103), automatic pruning,
  and a memory-index check inside `retro` (ADR 0011: `retro` reads no configuration files).
- Version bump follows the release flow after merge (`scripts/bump-version.sh`).
