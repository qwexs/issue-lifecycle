# issue-lifecycle

> Manage issues through their full lifecycle on the Outline Wiki tracker: create, update, log progress, close.

A thin wrapper around the [`outline`](https://github.com/qwexs/outline-skill) skill that knows about the three-level issue hierarchy (Collection → Project → Issue) and the metadata-table format from your `docs/agents/issue-tracker.md`. Provides six CLI scripts for the publish / track / close rhythm that runs inside a single session.

## Why

Working from a phase brief in a single-context repo, you end up doing the same three things over and over:

1. Publishing a new issue with the brief, links, and acceptance criteria
2. Logging progress / linking to handoff / ROADMAP / SPEC / commits in `## Notes` as the session proceeds
3. Closing the issue with a structured `## Outcome` block and the artifact list

`outline` already gives you `create / read / update / search / tree`. This skill adds:

- Auto-incrementing `ISS-<n>` from a project document
- The metadata table rendered to the exact format defined in `docs/agents/issue-tracker.md`
- Table update that preserves column alignment when values change in length
- `## Notes` append that is timestamped, idempotent, and never overwrites prior entries

## Install

```bash
# Peer dependency — install first.
git clone https://github.com/qwexs/outline-skill.git ~/.agents/skills/outline-skill

# This skill.
git clone https://github.com/qwexs/issue-lifecycle.git ~/.agents/skills/issue-lifecycle
```

The `outline` skill needs an `OUTLINE_API_TOKEN` env var and a `config.json` — see its README. Nothing else is required: zero npm dependencies, zero build step.

## Quick start

```bash
# 1. Start of session — publish the brief as an issue.
bun ~/.agents/skills/issue-lifecycle/scripts/new-issue.js \
  --project fsk-shop \
  --title "Phase 16 — refund_reversal" \
  --context "..." --label phase,loyalty

# 2. During the session — log progress / link artifacts.
bun ~/.agents/skills/issue-lifecycle/scripts/log-progress.js \
  --project fsk-shop --issue 13 --type progress --text "Resolved Q-Q1..Q-Q4"

bun ~/.agents/skills/issue-lifecycle/scripts/log-progress.js \
  --project fsk-shop --issue 13 --type link --target commit --ref aa047719

# 3. End of session — close with an Outcome block.
bun ~/.agents/skills/issue-lifecycle/scripts/close-issue.js \
  --project fsk-shop --issue 13 --status done \
  --summary "Phase 16 implemented: deferred earn + refund_reversal + cron" \
  --commit aa047719 --commit a43ba921
```

The full guide is in [`SKILL.md`](SKILL.md) — start there for the workflow, conventions, and the complete flag reference. Template, workflow state diagram, and config resolution live in [`references/`](references/).

## Commands

| Command | Purpose |
|---|---|
| `new-issue.js` | Create an issue page (resolves project, auto-numbers, renders template) |
| `read-issue.js` | Read one issue by `ISS-<n>` or document id |
| `list-issues.js` | List issues in a project, optional `--status <label>` filter |
| `set-status.js` | Update the `Status` field in the metadata table |
| `log-progress.js` | Append a timestamped entry to `## Notes` |
| `close-issue.js` | Set final status + append `## Outcome` block with summary and artifacts |

All scripts take `--help`, support `--json`, and resolve collection / project / issue ids at runtime — no hardcoded page ids in output or in the issue body.

## Conventions

- Issue title format: `ISS-<n>: <short title>` (project-local sequence)
- Metadata table exactly as defined in `docs/agents/issue-tracker.md`
- `Status` is restricted to the triage labels in your `docs/agents/triage-labels.md`
- Notes are append-only, never edited or deleted
- Status transitions to `wontfix` / `ready-for-human` only happen on explicit `--status` flag

## License

MIT — see [`LICENSE`](LICENSE).
