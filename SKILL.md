---
name: issue-lifecycle
description: "Manage issues through their full lifecycle on the Outline Wiki tracker — create from a brief, update status, append progress notes, link to handoff/ROADMAP/SPEC/commits, close as done/ready-for-human/wontfix. Use when user wants to publish a new issue from a phase brief, track progress on an existing ISS-N, or close out a phase at end of a session. Supports two parent modes: a project doc inside a tracker collection (legacy), or an arbitrary spec/architecture doc anywhere in the wiki (--spec mode)."
---

# Issue Lifecycle

Work with issues on the Outline Wiki tracker. Two parent modes are supported
on every command (mutually exclusive):

- `--project <name>` — legacy mode. Project doc lives inside a tracker
  collection; issues are children of the project. Used for repos like
  `fsk-shop` where the tracker is a dedicated `Issues` collection.
- `--spec <docId>` — spec-rooted mode. The parent is an arbitrary Outline
  document (typically a SPEC / Architecture / Runbook page) in any
  collection. Issues become direct children of the spec, with an extra
  `Spec` row in the metadata table that links back. Use this when issues
  belong to a specific design document and you want them indexed next to
  it.

Both modes share the same issue body format (metadata table + `# Title` +
`## Context` / `## Acceptance criteria` / `## Notes`), the same `ISS-<n>:`
title prefix, the same triage vocabulary, and the same Notes format
(timestamped level-3 headings, append-only).

## Quick start

### Spec mode (recommended for spec-rooted work)

```bash
# 1. Start of session — publish a new issue under a spec
bun scripts/new-issue.js --spec LtsW8BKXZf \
  --title "ChatGPT/Claude on mobile network (unresolved)" \
  --context "..." --label mobile,ipv6,openai

# 2. During work — append progress / link to handoff
bun scripts/log-progress.js --spec LtsW8BKXZf --issue 19 \
  --type progress --text "Confirmed IPv6 leak; filter-AAAA helps"
bun scripts/log-progress.js --spec LtsW8BKXZf --issue 19 \
  --type link --target commit --ref abc1234

# 3. End of session — close
bun scripts/close-issue.js --spec LtsW8BKXZf --issue 19 --status done \
  --summary "Filter-AAAA kept, app-side checks tolerated" \
  --commit abc1234
```

### Project mode (legacy tracker collection)

```bash
bun scripts/new-issue.js --project fsk-shop \
  --title "Phase 16 — refund_reversal" \
  --context "..." --acceptance "..." --label phase,loyalty

bun scripts/log-progress.js --project fsk-shop --issue 13 --type progress --text "..."
bun scripts/log-progress.js --project fsk-shop --issue 13 --type link --target handoff --ref docs/agents/handoff/2026-06-XX.md

bun scripts/close-issue.js --project fsk-shop --issue 13 --status done \
  --summary "Phase 16 implemented" --commits aa047719 a43ba921
```

All scripts take `--help`, support `--json`, and print a canonical URL on
success.

## Commands

| Command | Purpose |
|---|---|
| `new-issue.js` | Create an issue page (resolves parent, auto-numbers, renders template) |
| `read-issue.js` | Read one issue by `ISS-<n>` or document id |
| `list-issues.js` | List issues under a project or spec, optional `--status` filter |
| `set-status.js` | Update the `Status` field in the metadata table |
| `log-progress.js` | Append a timestamped entry to `## Notes` |
| `close-issue.js` | Set final status + append `## Outcome` block with summary and artifacts |
| `examples/migrate-spec-issues.js` | One-off helper: parse numbered issues from a spec doc and create child ISS pages |

Every command resolves parent / project / issue ids at runtime via the
`outline` skill — no hardcoded page ids in output or in the issue body.

## Workflow

### Start of session (publish a brief)

1. Read the brief carefully. Identify the title, context, acceptance criteria,
   and any prior discussion.
2. Run `new-issue.js --help` to confirm flags, then build the call. Default
   status is `ready-for-agent`. Choose the parent mode:
   - `--spec <docId>` when the issue belongs to a specific spec / runbook.
   - `--project <name>` when working inside a tracker collection.
3. Print the returned URL at the top of the session output.

### During the session (track progress)

- `log-progress.js --type progress --text "..."` after every checkpoint.
- `log-progress.js --type link --target <kind> --ref <path-or-sha>` when you
  produce a handoff, ROADMAP update, or commit.
- Never edit the body directly with `outline update.js` for routine progress.

### End of session (close)

- Run `close-issue.js --status done` (or `ready-for-human` / `wontfix`).
- The script writes an `## Outcome` block into `## Notes` and updates
  `Status` in one pass.

### Cross-session reads

- `read-issue.js --issue 19` (with `--project` or `--spec`) returns the
  full page; use it to resume from a previous session.
- `list-issues.js --status ready-for-agent` shows what is queued for an
  AFK agent.

## Migrating a spec doc into child issues

When a SPEC / runbook already contains numbered issues as inline text
(e.g. `### 1. <title>`, `### 2. <title>`, …), use
`examples/migrate-spec-issues.js` to lift each block into a child
`ISS-<n>:` page:

```bash
# dry-run first
bun examples/migrate-spec-issues.js --spec LtsW8BKXZf \
  --map examples/migration-maps/vpn-apriori-vm.json

# apply once the plan looks right
bun examples/migrate-spec-issues.js --spec LtsW8BKXZf \
  --map examples/migration-maps/vpn-apriori-vm.json --apply
```

The script parses `### N. <title>` sections, calls `outline create.js`
directly (via the shared `run()` helper, no subprocess) for each one
using the same body that `new-issue.js` would build, and prints the
replacements to make in the parent spec.

## Configuration

Optional `config.json` next to this `SKILL.md` (gitignored). All fields have
defaults — copy `config.example.json` to override:

```json
{
  "collectionName": "Issues",
  "outlineSkillPath": "~/.agents/skills/outline-skill/scripts"
}
```

Environment overrides: `OUTLINE_SKILL_PATH`. The `outline` skill itself
must be installed at that path; the API token comes from `OUTLINE_API_TOKEN`
(handled by the `outline` skill, not by this one).

## Conventions enforced by this skill

- Issue title: `ISS-<n>: <short title>` — `n` is parent-local and
  auto-increments per parent (project or spec).
- Metadata table fields (always rendered): `ID`, `Project`, `Status`,
  `Labels`, `Created`, `Source remote`. In `--spec` mode an extra
  `Spec` row is appended with a markdown link to the parent spec.
- `Status` is restricted to the triage labels (`needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human`, `wontfix`, `done`).
- Notes entries are always timestamped (`### <ISO date> — <type>`) and
  never deleted, only appended.
- The skill does not move issues to `wontfix` or `ready-for-human` without
  an explicit user instruction.

## References

- [references/workflow.md](references/workflow.md) — full workflow with
  state-machine diagram
- [references/template.md](references/template.md) — exact issue body
  template
- [references/config.md](references/config.md) — config resolution and
  precedence
- [examples/migrate-spec-issues.js](examples/migrate-spec-issues.js) —
  one-off helper for lifting numbered issues out of a spec doc
