# flutter-toolkit

[![Version](https://img.shields.io/badge/version-4.0.0-blue)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-blueviolet)](https://claude.ai/code)
[![Codex](https://img.shields.io/badge/Codex-compatible-blue)](https://developers.openai.com/codex/skills)
[![skills.sh](https://img.shields.io/badge/skills.sh-npx%20skills%20add-black)](https://www.skills.sh)

Skills and agents that turn any coding agent into a disciplined **Senior Flutter Engineer** — enforcing Riverpod v3 and Clean Architecture. One shared skill catalog for **Claude Code and Codex**, with capability-aware fallbacks for other coding agents via [skills.sh](https://www.skills.sh).

---

## Installation

### Any agent, via `npx` (broadest reach)

`skills/` matches the [skills.sh](https://www.skills.sh) flat catalog layout (`skills/<name>/SKILL.md`) — no extra setup needed:

```bash
npx skills add iamantoniodinuzzo/flutter-toolkit
npx skills update
```

> Tracks `master` HEAD — bleeding edge, no version pinning.

### Individual skills, via `npx`

Run from the target Flutter project. Select the skill and agent explicitly:

```bash
# List available skills without installing them
npx skills add iamantoniodinuzzo/flutter-toolkit --list

# Install one skill for Codex in the current project
npx skills add iamantoniodinuzzo/flutter-toolkit --skill scaffold-feature --agent codex

# Install one skill for Claude Code in the current project
npx skills add iamantoniodinuzzo/flutter-toolkit --skill scaffold-feature --agent claude-code

# Install one skill for Codex across all your projects
npx skills add iamantoniodinuzzo/flutter-toolkit --skill scaffold-feature --agent codex --global
```

Replace `scaffold-feature` with an active skill from the table below. Project installation is the default; `--global` installs for your user. These flags follow the [skills CLI documentation](https://github.com/vercel-labs/skills#readme). Leave archived `build-filter` unselected.

Install shared dependencies together when selecting these workflows:

```bash
# Full feature audits: orchestrator plus all four layer skills
npx skills add iamantoniodinuzzo/flutter-toolkit --agent codex --skill audit-feature audit-domain-layer audit-data-layer audit-application-layer audit-presentation-layer

# Widget tests: shared provider patterns come from unit-test
npx skills add iamantoniodinuzzo/flutter-toolkit --agent codex --skill generate-widget-tests unit-test

# Configuration audit: session parser comes from retro
npx skills add iamantoniodinuzzo/flutter-toolkit --agent codex --skill tune-setup retro
```

Use `--agent claude-code` for Claude Code, and add `--global` if needed. The native plugins include these dependencies together.

### Codex, via native plugin marketplace

```bash
codex plugin marketplace add iamantoniodinuzzo/flutter-toolkit
codex plugin add flutter-toolkit@flutter-toolkit
```

To install the published release reproducibly, use this alternative:

```bash
codex plugin marketplace add iamantoniodinuzzo/flutter-toolkit --ref v3.11.0
codex plugin add flutter-toolkit@flutter-toolkit
```

The native Codex manifest distributes the 21 active skills from the same catalog. The marketplace follows the repository revision you install; use `--ref v<version>` on `marketplace add` to pin a published release. For editable files instead, use `npx skills add iamantoniodinuzzo/flutter-toolkit -a codex`.

Install one channel per agent to avoid duplicate skills.

### Claude Code, via plugin marketplace (stable, pinned)

```bash
claude plugin marketplace add iamantoniodinuzzo/flutter-toolkit
claude plugin install flutter-toolkit@flutter-toolkit
```

Or via `.claude/settings.json` (team/project scope):

```json
{
  "extraKnownMarketplaces": {
    "flutter-toolkit": {
      "source": {
        "source": "github",
        "repo": "iamantoniodinuzzo/flutter-toolkit"
      }
    }
  },
  "enabledPlugins": {
    "flutter-toolkit@flutter-toolkit": true
  }
}
```

> Pins tagged releases — use this in Claude Code for reproducible versions instead of tracking `master` HEAD.

Install issues (stuck versions, SSH errors, how auto-update resolves)? See [ai_docs/TROUBLESHOOTING.md](ai_docs/TROUBLESHOOTING.md).

### Migrating from `claude-flutter`

The repository and marketplace used to be called `claude-flutter` (plugin ID `flutter-toolkit@claude-flutter`). They are now `flutter-toolkit`, the same name as the plugin, so the install ID is `flutter-toolkit@flutter-toolkit`. The plugin name and the command prefix (`/flutter-toolkit:<skill>`, `$flutter-toolkit:<skill>`) did not change.

Claude Code identifies a marketplace by its `name`, so an existing install does not move over by itself. Remove the old one and add the new one:

```bash
# Claude Code
claude plugin uninstall flutter-toolkit@claude-flutter
claude plugin marketplace remove claude-flutter
claude plugin marketplace add iamantoniodinuzzo/flutter-toolkit
claude plugin install flutter-toolkit@flutter-toolkit

# Codex
codex plugin remove flutter-toolkit@claude-flutter
codex plugin marketplace remove claude-flutter
codex plugin marketplace add iamantoniodinuzzo/flutter-toolkit
codex plugin add flutter-toolkit@flutter-toolkit
```

Removing a marketplace also uninstalls its plugins and deletes their data and options, so note any plugin settings first. If you declare the plugin in `.claude/settings.json`, rename the `extraKnownMarketplaces` key and the `enabledPlugins` key as in the snippet above. `npx skills add` users only need the new slug; GitHub forwards the old repository URL.

---

## Skills

The table uses Claude plugin slash commands (`/flutter-toolkit:<name>`). In Codex, invoke plugin skills as `$flutter-toolkit:<name>`; editable skills installed through skills.sh use `$<name>`. Natural-language selection is also available, except `tune-setup`, which requires an explicit request. `build-filter` remains archived; its guard scripts are retained as reference material and it is excluded from the operational Codex catalog.

| Skill | Invoke | Description |
|---|---|---|
| `scaffold-feature` | `/flutter-toolkit:scaffold-feature` or "we're starting a new feature" | Scaffold a new feature: Socratic intake, clean-arch directory scaffold, architecture contract, context seed |
| `flutter-analyze-targeted` | `/flutter-toolkit:flutter-analyze-targeted <path>` | Fast `dart analyze` scoped to a feature path |
| `unit-test` | "write tests for X" | Unit tests with mocktail + GWT + Riverpod v3 |
| `generate-widget-tests` | "write widget tests for X" | Widget tests via Robot Testing pattern |
| `flutter-go-router` | "how do I navigate to X" | GoRouter routes, guards, shell nav, deep linking |
| `flutter-melos-workspace` | "set up Melos" | Monorepo orchestration |
| `maestro-screenshot-flow` | "create maestro flow" | Maestro YAML for Android screenshots — id-based selectors (`Semantics(identifier:)`), immune to translation and UI refactors; edits app source to add missing identifiers |
| `audit-presentation-layer` | "audit presentation layer" | Rules-based static audit: Riverpod, Robot Testing, GoRouter, layout, responsive layout, assets, credential autofill, web affordances, web boot loader (app-root run) — platform-aware (auto-detect / `--platform`) |
| `audit-domain-layer` | "audit domain layer" | Rules-based static audit: infra imports in domain, untyped/non-sealed exceptions, entity serialization, hardcoded UI strings |
| `audit-data-layer` | "audit data layer" | Rules-based static audit: leaky abstractions (raw framework types), missing exception conversion, model mapper gaps, untyped datasource exceptions |
| `audit-application-layer` | "audit application layer" | Rules-based static audit: Flutter framework imports, redundant manual try/catch in notifiers, mutation return types, unconstrained state types |
| `audit-feature` | "audit this feature" or "full feature audit" | Orchestrates per-layer audits with permitted subagents or sequential scans; aggregates into one report; falls back to presentation-only for sub-features |
| `sentry-init` | `/flutter-toolkit:sentry-init` or "set up Sentry" | Bootstrap `sentry_flutter` — installs deps, patches `main.dart`, wires GoRouter observer, Riverpod error capture (LoggerService decorator or a scaffolded ErrorLogger sink), beforeSend/sampling policy, web BetterFeedback, release upload checklist |
| `flutter-flavors` | `/flutter-toolkit:flutter-flavors` or "add flavors to this app" | Init dev/stg/prod flavors (flutter_flavorizr or manual) across Android/iOS/Web + IDE config, or audit and fix an existing broken/partial setup; optional multi-project Firebase |
| `force-update-init` | `/flutter-toolkit:force-update-init` or "add force update" | Bootstrap `force_update_helper` — installs deps, patches AndroidManifest.xml, wires `ForceUpdateWidget`, sets up a remote `required_version` source (Gist, Firebase Remote Config, or a scaffolded Dart Shelf backend), handles non-store distribution, or audits an existing setup for the two silent failure modes (missing `APP_STORE_ID`, missing Android `<queries>` intent) |
| `asset-preload-init` | `/flutter-toolkit:asset-preload-init` or "fix logo pop-in" | Inventory declared assets by loader/cache, generate only the needed first-frame warm-up (SVG `SvgAssetLoader(path).loadBytes(null)` with errors handled at creation; context-based `precacheImage` for raster), and report oversized and unused assets (report only); AUDIT mode checks an existing warm-up (`ASSET-01..04`) |
| `page-transitions-init` | `/flutter-toolkit:page-transitions-init` or "fix page transitions" | Generate an adaptive `PageTransitionsTheme` (native on installed Android/iOS, instant on web/desktop, `kIsWeb`-gated), wire it into every light and dark theme (incl. `FlexThemeData`), and optionally migrate a blanket `NoTransitionPage` router helper to `builder:`; AUDIT mode reports ROUTER-03 mismatches |
| `web-loader-init` | `/flutter-toolkit:web-loader-init` or "flutter web blank page" | Add a boot progress loader to a Flutter web app: accessible overlay in `web/index.html`, `style.css` (light/dark, reduced-motion) and an IIFE-wrapped `flutter_bootstrap.js` that removes the loader on `flutter-first-frame` and emits `serviceWorkerSettings` only when the PWA strategy allows it; AUDIT mode checks an existing loader (`WEB-02`) |
| `second-opinion` | "give me a second opinion" | Independent Flutter/Riverpod review via Gemini (default), Codex, or Claude CLI; asks before changing provider |
| `retro` | `/retro` or "retrospettiva" / "self-audit" | End-of-task self-audit: extracts verifiable evidence (tool errors, repeated commands, a per-branch session diff, transcript-only environment signals) from the session transcript, answers 6 hard questions backed by it, persists learnings to authorized native memory with dedup, or reports them when memory is unavailable, flags unintegrated git work, proposes fixes and environment improvements — Flutter-aware when the transcript shows Flutter work, generic otherwise |
| `tune-setup` | `/tune-setup` or "ottimizza il setup" / "audit config" | On-demand config & workflow audit — the current agent's instructions, settings, hooks, and agents, skill-trigger-miss — cross-referenced against transcript evidence (repeated hook injections, denials); proposes concrete config fixes. Never automatic — generic, not Flutter-specific |

---

## Compatibility and dependencies

Claude Code and Codex packaging, discovery, resource resolution, and helper behavior are tested locally without paid model calls. Other agents use the same instructions with documented capability limits; their model behavior is not certified.

- Resolve scripts and references from each installed skill directory, not from the Flutter app's cwd.
- Questions can be plain text. Delegated audits run sequentially when subagents are absent or not permitted.
- `audit-feature` needs the per-layer audit skills for the layers present; `generate-widget-tests` needs `unit-test` for its shared provider patterns; `tune-setup` needs `retro` for session evidence. Install these dependencies together through skills.sh. Missing dependencies are reported as unavailable checks, never clean results.
- `retro` reads Claude or Codex transcripts (`--agent auto|claude|codex`). Missing, ambiguous, obsolete, malformed, and opaque records limit the report. Claude-only config metrics are unavailable on Codex. Retro v3 on Codex is best-effort: errors, repeated commands and edits come from the real rollout records (`CommandExecution`, `FileChange`), the environment block is "not evaluated" (never "no signal"), and the session diff uses only the git anchor from `session_meta`. The new categories and the diff are verified on Claude.
- `tune-setup` inspects the current agent's actual configuration. Learnings use authorized native memory when available; otherwise they stay in the report.
- `second-opinion` needs Node.js and an authenticated provider CLI. It sends pertinent context through stdin in an isolated session. Missing providers, timeouts, and authentication failures never switch providers silently.

## Validation

```bash
npm run validate
npm test
node scripts/smoke-plugins.js
```

Validation uses Node.js 24. The smoke check requires Claude and Codex CLIs and uses temporary configuration directories. It makes no AI calls and does not change personal installations. CI runs the fixture and simulated-process tests on Windows and Linux.

## Agents

These are Claude subagent definitions. Skill portability does not require native Codex equivalents.

| Agent | Purpose |
|---|---|
| `riverpod-reviewer` | Reviews Riverpod v3 provider code after changes — checks `ref.watch`/`ref.read` placement, `.select()` usage, v3 naming |
| `prompt-engineer` | Designs, tests, and optimizes LLM prompts for production |

---

## Core methodology

1. **Socratic Brainstorming** — design questions before any code (via `scaffold-feature`)
2. **Riverpod Excellence** — no logic in widgets, maximum testability

---

## Release

See [ai_docs/CONTRIBUTING.md](ai_docs/CONTRIBUTING.md) for the full version bump procedure.

```bash
bash scripts/bump-version.sh patch   # or minor / major — syncs all 5 locations
git start release v<version>
# edit CHANGELOG.md — add ## [<version>] section WITHOUT a date
git add package.json .claude-plugin/plugin.json .codex-plugin/plugin.json .claude-plugin/marketplace.json README.md CHANGELOG.md
git c   # chore(release): bump version to <version>
git finish -y   # merges master+develop, tags v<version>, pushes, deletes branch
```

---

## License

MIT — © [Antonio Di Nuzzo](mailto:iamantoniodinuzzo@gmail.com)
