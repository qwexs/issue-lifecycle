# Workflow

The intended rhythm for using this skill across sessions in a single
project. Mirrors the pattern that already runs in `fsk-shop` and similar
single-context repos that track issues on Outline Wiki.

## Lifecycle of a single issue

```mermaid
stateDiagram-v2
    [*] --> needs-triage : new-issue (raw)
    needs-triage --> needs-info : needs more info
    needs-triage --> ready-for-agent : brief written
    needs-info --> needs-triage : reporter replied
    ready-for-agent --> in_progress_note : first log-progress
    in_progress_note --> in_progress_note : log-progress
    in_progress_note --> done : close-issue --status done
    in_progress_note --> ready-for-human : blocked on human
    in_progress_note --> wontfix : cancelled
    done --> [*]
    ready-for-human --> [*]
    wontfix --> [*]
```

> "in_progress_note" is not a tracker label — it's a working state inside the
> page body (Notes section) that the agent uses as a mental marker. The
> actual `Status` field stays at `ready-for-agent` while work proceeds and is
> only changed by `close-issue.js` at the end.

## Three phases of a session

### 1. Start of session — publish the brief as an issue

1. Read the user's brief carefully. Identify: title, scope, acceptance
   criteria, references (handoff, ROADMAP, SPEC, git state), open questions.
2. Run `new-issue.js` with `--project`, `--title`, `--context`, `--acceptance`.
   Default status is `ready-for-agent`.
3. Print the returned URL at the top of the session output. The user will
   reference it for the rest of the session, and the next session will resume
   from it.

This is the **only** step that creates pages. Never edit a tracker page by
hand for a brief — always go through `new-issue.js` so the table and section
order are consistent.

### 2. During the session — track progress in `## Notes`

- After every meaningful checkpoint, run `log-progress.js --type progress --text "..."`.
  Entries are timestamped, so chronology is preserved across sessions.
- When a handoff doc, ROADMAP update, SPEC section, or commit lands, log it
  with `--type link --target <kind> --ref <path-or-sha>`. This keeps the
  issue a self-contained index of everything the session produced.
- For status changes mid-session (rare — most issues stay at
  `ready-for-agent` until close), use `set-status.js`. Avoid moving to
  `in-progress` style labels that don't exist in the tracker vocabulary.
- Never edit the body directly with `outline update.js` for routine progress.
  Going through `log-progress.js` keeps entries uniform and idempotent.

### 3. End of session — close with a structured outcome

1. Run `close-issue.js --status done --summary "..."` with the artifacts
   produced this session: `--commit <sha>` (repeatable), `--handoff <path>`
   (repeatable), `--pr <url>` (repeatable), `--followup <text>` (repeatable).
2. The script writes an `## Outcome` block into `## Notes` (with summary +
   artifact list) and updates `Status` in one pass.
3. Print the canonical URL one more time. The next session's handoff doc
   should link to the closed issue as proof of completion.

If a session ends with work remaining, use `--status ready-for-human` and
list the follow-ups via `--followup`. If the work is cancelled, use
`--status wontfix` and put the reason in `--summary`.

## Cross-session reads

When resuming a previous session, the typical bootstrap is:

```bash
# Find the project doc and list its issues.
bun scripts/list-issues.js --project fsk-shop --status ready-for-agent

# Read the relevant one.
bun scripts/read-issue.js --project fsk-shop --issue 13
```

`list-issues.js` filters by status, so `ready-for-agent` is the natural
"queue for an AFK agent" view.

## What this skill does not do

- It does not move issues to `wontfix` or `ready-for-human` without an
  explicit `--status` flag from the caller. The skill's own scripts default
  to `done` and only switch on user request.
- It does not edit or delete existing `## Notes` entries. The tracker
  history is append-only from this skill's perspective.
- It does not touch issues outside the configured project document. Cross-
  project work is out of scope — if you need it, run with a different
  `--project` and `--collection` per call.
- It does not commit, push, or open PRs. The git workflow is a separate
  concern; the issue just records the resulting SHAs in the `Outcome` block.
