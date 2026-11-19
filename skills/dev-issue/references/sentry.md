# Sentry detail for dev-issue

Read this only when the issue body cites a Sentry ID or link (`PROJECT-NAME-Q`, `sentry.io/issues/...`, "Fixes PROJECT-NAME-12A"), **and** a Sentry tool is available in the host. No Sentry tool: say so in the Phase 2 report, treat the issue narrative as unverified, and continue. Never invent an event.

SKILL.md points here from Agent A and Agent E.

## Fetch the event (Agent A)

- Fetch the real event through the host's Sentry tool, passing the issue URL when the body has one. Sentry tools may be deferred or unauthenticated: load or authenticate them first, and check each tool name before relying on it.
- Organization slug: take it from the issue link; else from `## Conventions` in `docs/agents/dev-issue.md` (`sentry org`); else ask once and record it in the profile through the plan.
- Report: release, first/last-seen timeline, stack trace with first-party frames, affected users. This is usually more reliable than the narrative in the issue body.
- A 404 means the events are past retention. Read the issue's own history instead (activity or "get issue activity" tool): it works on old issues and gives `first_seen` (the date names the release the event ran) plus earlier resolves, regressions and notes.

## Root-cause cross-checks (Agent E)

- **Timeline.** Does the event predate or postdate the last known fix on that file? An event preceding an already-merged fix can mean the bug is already resolved. Verify regardless; never assume.
- **Read the code as the event ran it.** Map the event's `release` to a git tag (`git tag -l` to confirm the naming) and read the file there with `git show <tag>:<path>`. The development branch may have changed the code since, so a cause built only on the current file can name something the released build never had. When the two differ, find the commit between them: `git log -S"<snippet>" <tag>..HEAD -- <path>`.
- **A Sentry issue count is a group count.** One issue can hold several different messages, so list its events by `message` and `release` before trusting "N occurrences". Events that share a timestamp to the second belong to one causal chain: pair them to find what triggered what.

## Out of scope

Resolving or marking Sentry issues after the merge. The skill only reads Sentry; the user closes the loop there.
