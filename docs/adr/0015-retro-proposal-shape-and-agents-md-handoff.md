# 0015 — retro: proposal shape and the `global agents.md` handoff

## Status

Accepted (issue #110). Amends ADR 0011: the `global agents.md` signal prints an explicit handoff
to `tune-setup`. The invariant "retro never reads a configuration file" keeps no exception.

## Context

Running both `flutter-toolkit:retro` and `mattpocock-skills:retro` on the same session showed
the two are complementary. The toolkit retro gave the measurable base (loaded instructions total,
the largest file, a denial, a file edited three times) and, by ADR 0011, could not judge file
content, so it only deferred to `tune-setup`. The other retro read the instruction files and,
above all, turned a prose proposal (a line with a character cap) into a hook that warns at
every session start. Two gaps follow in `retro`: a mechanical constraint is proposed as prose,
and the `global agents.md` line says "defer" without a list or a command.

## Decision

**1. Handoff, not a reading exception.** With the signal on, `retro` does not read the loaded
instruction files. The line prints the exact handoff command, `tune-setup --surface
memory-index` when the largest file is the native memory index (type `AutoMem`) and
`--surface istruzioni` otherwise, and lists up to `AGENTS_MD_LIST_MAX` files by size, with a
`... +k file` line for the rest. The option of a limited reading exception was rejected: it
breaks the event-versus-file boundary of ADR 0011, and makes every retro with the signal on
read the largest files. `--surface` (ADR 0014) makes the second, explicit run cheap.

**2. Mechanical constraint → check.** Before a `config` or `knowledge` proposal the violation is
classified. Mechanical (a numeric cap, a fixed pattern, a path) → a hook, script or CI job;
a judgment → prose.

**3. Pointer before content.** When a rule existed and did not fire, the proposal first
rewords the pointer (the case and the condition), and moves content only if that is not enough.
The wording rules stay in `references/writing-for-agents.md`.

**4. A moved rule carries a test and a way back.** A proposal that moves a rule from
always-loaded to a skill or on-demand carries `prova:` (a question for a new session, with the
expected behaviour) and `ripristino:`.

**5. Evidence rule unchanged.** These rules shape a proposal that already has its transcript
event; none creates one. "No proposal without a transcript event" holds for every category.

## Consequences

- `skills/retro/scripts/retro-lens.js`: new constant `AGENTS_MD_LIST_MAX`; the `global agents.md`
  line changes from "largest file" to the handoff command, followed by the size-ordered list.
  Output grows by up to four lines, inside `AMBIENTE_LINE_CAP`.
- `skills/retro/SKILL.md`: `### Forma della proposta` in `Persistenza`, a report example, two
  anti-patterns. `references/environment-lens.md`: the signal row names the handoff.
- `tune-setup` is unchanged. `--config-audit` output is unchanged.
- The comparison behind the issue is one session, by the same agent for both retros, with the
  first retro's evidence reused by the second: it is not a neutral test.
- Version bump follows the release flow after merge (`scripts/bump-version.sh`).
