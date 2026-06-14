# Issue template

The exact body rendered by `new-issue.js` and the one `read-issue.js` /
`set-status.js` / `log-progress.js` / `close-issue.js` expect on the page.
The format is fixed — see `docs/agents/issue-tracker.md` in the host repo
for the canonical source.

## Rendered body (project mode)

```markdown
| Field         | Value                              |
| ------------- | ---------------------------------- |
| ID            | ISS-<n>                            |
| Project       | <project-name>                     |
| Status        | <triage-label>                     |
| Labels        | <comma, separated, labels>         |
| Created       | <YYYY-MM-DD>                       |
| Source remote | <git url, optional>                |

# <Short title>

## Context

<markdown body>

## Acceptance criteria

- [ ] <criterion 1>
- [ ] <criterion 2>

## Notes

_No notes yet._
```

## Rendered body (spec mode)

In `--spec` mode, the `Project` row is set to the spec's title and an extra
`Spec` row is appended with a markdown link to the parent spec:

```markdown
| Field         | Value                                                  |
| ------------- | ------------------------------------------------------ |
| ID            | ISS-<n>                                                |
| Project       | <spec-title>                                           |
| Status        | <triage-label>                                         |
| Labels        | <comma, separated, labels>                             |
| Created       | <YYYY-MM-DD>                                           |
| Source remote | <git url, optional>                                    |
| Spec          | [<spec-title>](https://outline.../doc/<spec-id>)       |

# <Short title>

## Context
...
```

`Spec` is rendered only when the issue was created with `--spec`. The
table-parser (`scripts/lib/table-parser.js`) is unaware of the field; it
walks rows in document order, so `Spec` is a normal optional row that
`updateField('Spec', value)` can rewrite in place.

## Field → script-flag map

| Field         | Sourced from                                                  |
| ------------- | ------------------------------------------------------------- |
| `ID`          | Auto-incremented per parent; override with `--number`         |
| `Project`     | `--project <name>` (legacy), or spec title in `--spec` mode   |
| `Status`      | `--status <triage-label>` (default `ready-for-agent`)         |
| `Labels`      | `--label <a,b,c>` (optional, comma-separated)                 |
| `Created`     | `new Date().toISOString().slice(0, 10)` (YYYY-MM-DD)          |
| `Source remote` | `--source-remote <git url>` (optional)                      |
| `Spec`        | Auto-populated in `--spec` mode from the parent spec's title and URL |

The `## Context`, `## Acceptance criteria`, and `## Notes` sections are
driven by the corresponding `--context`, `--acceptance`, and `--notes` flags
on `new-issue.js`. Only `--context` and `--acceptance` are typically used at
create time; notes are appended later through `log-progress.js`.

## Triage label vocabulary

`Status` is restricted to the labels in `docs/agents/triage-labels.md`:

- `needs-triage` — maintainer needs to evaluate this issue
- `needs-info` — waiting on reporter for more information
- `ready-for-agent` — fully specified, ready for an AFK agent
- `ready-for-human` — requires human implementation
- `wontfix` — will not be actioned
- `done` — closed, all work landed (not part of the original 5-state set, but
  used as the standard "closed successfully" sentinel in this skill's scripts)

The skill validates `--status` against this set and exits with a clear error
if an unknown label is passed.

## Notes section

`log-progress.js` and `close-issue.js` append entries to `## Notes`. Each
entry is a level-3 heading `### <YYYY-MM-DD> — <type>` followed by the body.
The three entry types are:

- `progress` — free-form checkpoint note
- `link` — structured pointer to an artifact (`- **<target>**: \`<ref>\``)
- `outcome` — close-time summary, rendered by `close-issue.js`

Notes are append-only: nothing in this skill edits or removes a previous
entry.
