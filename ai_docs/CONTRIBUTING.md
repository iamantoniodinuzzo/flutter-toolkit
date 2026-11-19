# Contributing

## Adding a new skill

Skills are auto-discovered by directory presence under `skills/` — no `marketplace.json` change needed. New skills automatically become available through the Claude Code plugin marketplace and `npx skills add` — no extra manifest edit required for either.

For Codex, also add each active skill directory to `.codex-plugin/plugin.json` (`skills` paths must start with `./`), and provide `agents/openai.yaml`. The validator enforces complete active-catalog coverage. Do not include archived skills.

Keep resource paths independent of the target cwd, declare required sibling skills and unavailable-capability behavior, and preserve explicit-only invocation policies. Run `npm run validate` and `npm test`; `node scripts/smoke-plugins.js` verifies installed CLI discovery without AI calls.

When adding a new skill, update BOTH:
- `README.md` → skills table
- `ai_docs/ARCHITECTURE.md` → Key skills table

Version bump runs **post-merge**, not in the PR. See the Version bump section below for the manual procedure.

## Shared references

A skill is installed on its own, so it cannot read another skill or `ai_docs/`. Text that several skills need is a **byte-identical copy** of one canonical file, and `node scripts/validate-skills.js` fails when a copy drifts. The table of canonical files and copies is the `copies` list in `scripts/validate-skills.js`. The `<!-- source: ... -->` header on a copied rule doc and line endings are not part of the compared text.

To change one: edit the canonical file (under `scaffold-feature/references/`), copy it over every copy the list names, run the validator. Do not edit a copy alone. The validator also rejects project-specific names and Riverpod v2 `<Name>Ref ref` parameters in `skills/`, `agents/` and `ai_docs/`.

## Fetching upstream rule docs (flutter_ai_toolkit)

To copy rule docs from `iamantoniodinuzzo/flutter_ai_toolkit` into a skill's `rules/` folder:

```bash
# Get HEAD SHA for attribution comment
gh api repos/iamantoniodinuzzo/flutter_ai_toolkit/git/refs/heads/main --jq '.object.sha'
# Fetch file content (decoded)
gh api repos/iamantoniodinuzzo/flutter_ai_toolkit/contents/<path> --jq '.content' | base64 -d
```

Add `<!-- source: iamantoniodinuzzo/flutter_ai_toolkit @ <sha> -->` at top of each copied file.

## Version bump

Use `scripts/bump-version.sh` — it syncs all five version locations atomically:
- `package.json` `version` (authoritative)
- `.codex-plugin/plugin.json` `version`
- `.claude-plugin/plugin.json` `version`
- `.claude-plugin/marketplace.json` `source.ref` (vX.Y.Z) ← **critical for auto-update**
- `README.md` version badge

```bash
# patch: x.x.N — fixes
# minor: x.N.0 — new skills
# major: N.0.0 — breaking changes
bash scripts/bump-version.sh patch   # or minor / major / explicit X.Y.Z
```

The script first runs `npm run validate && npm test` and aborts on failure, before touching any file: `git finish` tags and publishes in one step, so CI cannot gate the release.

The script prints the exact follow-up `git start release` / `git c` / `git finish -y` commands.
It does NOT commit or tag — that is owned by git-flow `git finish`.

> **Why `marketplace.json` `source.ref` matters:** Claude Code resolves the version string at the
> pinned ref to detect updates. If `source.ref` stays on the old tag, `marketplace update` is a
> no-op for all consumers. The script always bumps this field so auto-update works correctly.

## Tracking gotcha

Files can exist on disk but be untracked by git. Before closing an issue about file existence, verify with `git ls-files <path>` — not just a filesystem check.

The Codex marketplace uses a local source pointing to the repository root; it inherits the selected checkout revision. It has no independent version field to bump. Pin a published release with `codex plugin marketplace add ... --ref v<version>` when reproducibility is required.
