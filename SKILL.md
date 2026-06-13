---
name: issue-lifecycle
description: Manage issues through their full lifecycle on the Outline Wiki tracker — create from a brief, update status, append progress notes, link to handoff/ROADMAP/SPEC/commits, close as done/ready-for-human/wontfix. Use when user wants to publish a new issue from a phase brief, track progress on an existing ISS-N, or close out a phase at end of a session.
---

# Issue Lifecycle

Work with issues on the project issue tracker (Outline Wiki, collection `Issues`). Wraps the generic `outline` skill with project-aware helpers: auto-increment `ISS-<n>`, render the metadata table from `docs/agents/issue-tracker.md`, and parse/update it in place.

## Quick start

```bash
# 1. Start of session — publish a new issue from a brief
bun scripts/new-issue.js --project fsk-shop --title "ISS-13: Phase 16 — refund_reversal" \
  --context "..." --acceptance "..." --label phase,loyalty

# 2. During work — append progress / link to handoff
bun scripts/log-progress.js --issue 13 --type progress --text "Resolved Q-Q1..Q-Q4"
bun scripts/log-progress.js --issue 13 --type link --target handoff --ref docs/agents/handoff/2026-06-XX.md

# 3. End of session — close
bun scripts/close-issue.js --issue 13 --status done \
  --summary "Phase 16 implemented: deferred earn + refund_reversal + cron" \
  --commits aa047719 a43ba921
```

All scripts take `--help`, support `--json`, and print a canonical URL on success.

## Commands

| Command | Purpose |
|---|---|
| `new-issue.js` | Create an issue page (resolves project, auto-numbers, renders template) |
| `read-issue.js` | Read one issue by `ISS-<n>` or document id |
| `list-issues.js` | List issues in a project, optional `--status <triage-label>` filter |
| `set-status.js` | Update the `Status` field in the metadata table |
| `log-progress.js` | Append a timestamped entry to `## Notes` (types: `progress`, `link`, `outcome`) |
| `close-issue.js` | Set final status + append `## Outcome` block with summary and artifacts |

Every command resolves collection / project / issue ids at runtime via the `outline` skill — no hardcoded page ids in output or in the issue body.

## Workflow

### Start of session (publish a brief)

1. Read the brief carefully. Identify the title, context (links to handoff/ROADMAP/SPEC), acceptance criteria, and any prior discussion.
2. Run `new-issue.js --help` to confirm flags, then build the call. Default status is `ready-for-agent`.
3. Print the returned URL. The user will reference it for the rest of the session.

### During the session (track progress)

- After every meaningful checkpoint, `log-progress.js --type progress --text "..."`. The entry is timestamped and prefixed with `### <ISO date> — progress`.
- When you produce a handoff, ROADMAP update, or commit, `log-progress.js --type link --target <kind> --ref <path-or-sha>`. Type is one of `handoff` / `roadmap` / `spec` / `commit` / `pr`.
- Never edit the body directly with `outline update.js` for routine progress — go through `log-progress.js` so entries stay uniform.

### End of session (close)

- Run `close-issue.js --status done` (or `ready-for-human` if something remains, or `wontfix` if cancelled).
- The script writes an `## Outcome` block into `## Notes` (with summary, commits, linked handoff) and updates `Status` in one pass.

### Cross-session reads

- `read-issue.js --issue 13` returns the full page; use it to resume from a previous session.
- `list-issues.js --status ready-for-agent` shows what is queued for an AFK agent.

## Configuration

Optional `config.json` next to this `SKILL.md` (gitignored). All fields have defaults — copy `config.example.json` to override:

```json
{
  "collectionName": "Issues",
  "outlineSkillPath": "~/.agents/skills/outline-skill/scripts"
}
```

Environment overrides: `OUTLINE_SKILL_PATH` (path to the `outline` skill scripts). The `outline` skill itself must be installed at that path; the API token comes from `OUTLINE_API_TOKEN` (handled by the `outline` skill, not by this one).

## Conventions enforced by this skill

- Issue title: `ISS-<n>: <short title>` — `n` is project-local and increments.
- Metadata table is exactly the one defined in `docs/agents/issue-tracker.md` (when working inside a repo that defines it); field order and names are kept stable.
- `Status` is restricted to the triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`); see `docs/agents/triage-labels.md`.
- Notes entries are always timestamped (`### <ISO date> — <type>`) and never deleted, only appended.
- The skill does not move issues to `wontfix` or `ready-for-human` without an explicit user instruction.

## References

- [references/workflow.md](references/workflow.md) — full workflow with state-machine diagram
- [references/template.md](references/template.md) — exact issue body template
- [references/config.md](references/config.md) — config resolution and precedence
