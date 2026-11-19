# Troubleshooting

## Plugin stuck on old version / install fails with SSH error

Claude Code clones plugins via SSH by default. If SSH keys are not configured, installation fails silently or the cached version never updates. Fix:

```bash
# Force HTTPS for GitHub (run once, global)
git config --global url."https://github.com/".insteadOf "git@github.com:"

# Refresh marketplace index, then update
claude plugin marketplace update flutter-toolkit
claude plugin update flutter-toolkit@flutter-toolkit
```

Restart Claude Code after updating.

## How auto-update works

This marketplace uses pinned-tag version resolution. When a new release is published:

1. A git tag (`vX.Y.Z`) is pushed to GitHub.
2. `marketplace.json` `source.ref` is updated to point to that tag.
3. `plugin.json` `version` field changes to `X.Y.Z`.

Claude Code detects the update **only when the resolved version string changes at the pinned ref** (both the tag and the ref must be in sync). If `source.ref` is stale, `marketplace update` is a no-op. The `scripts/bump-version.sh` script keeps all four locations in sync atomically.

To get the latest version:

```bash
claude plugin marketplace update flutter-toolkit
claude plugin update flutter-toolkit@flutter-toolkit
```
