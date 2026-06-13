# Configuration

The skill has one optional config file and one environment variable.
Defaults are picked so a fresh install works without any configuration.

## Resolution order

For every script, the following are tried in order; the first hit wins.

### 1. Environment variables

| Variable                | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `OUTLINE_SKILL_PATH`    | Path to the `outline` skill scripts directory. Overrides config and default. |
| `OUTLINE_API_TOKEN`     | API token for Outline. Read by the `outline` skill itself, not by this one. |

### 2. User config (`config.json` next to `SKILL.md`)

Optional. Copy `config.example.json` to `config.json` and edit. The file is
gitignored by convention (you can add it to your dotfiles repo if you want
machine-portable settings).

```json
{
  "collectionName": "Issues",
  "outlineSkillPath": "~/.agents/skills/outline-skill/scripts"
}
```

| Field             | Default                                      | Purpose                                                                                |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `collectionName`  | `"Issues"`                                   | Name of the Outline collection that holds the project document.                        |
| `outlineSkillPath` | `~/.agents/skills/outline-skill/scripts`     | Directory with the `outline` skill's `*.js` scripts (this skill shells out to them).   |

### 3. Built-in defaults

If neither env var nor user config is set, the skill falls back to:

- collection: `Issues`
- outline skill scripts: `~/.agents/skills/outline-skill/scripts`

Both can be overridden on a per-call basis via `--collection <name>`.

## What the skill does NOT need to know

- **Outline API URL** — read by the `outline` skill from its own `config.json`.
- **API token** — read by the `outline` skill from `OUTLINE_API_TOKEN` (or its
  own `config.json`). This skill never sees the token; it only shells out to
  `outline/scripts/<name>.js --json`.
- **Project document id** — resolved at runtime from `--project <name>`.
  Cached in-memory for the duration of one script invocation only; never
  persisted.
- **Issue document ids** — resolved at runtime from `--issue <N>` (the
  `ISS-<N>:` title pattern). The full `id` is only ever used as an
  intermediate handle inside the script.

## Install checklist

1. Make sure the `outline` skill is installed at the expected path
   (default `~/.agents/skills/outline-skill/`). Verify with
   `ls ~/.agents/skills/outline-skill/scripts/list-collections.js`.
2. Make sure `OUTLINE_API_TOKEN` is exported in your shell rc.
3. (Optional) Copy `config.example.json` to `config.json` and adjust
   `collectionName` / `outlineSkillPath` if your project uses different
   names.
4. Run `bun ~/.agents/skills/issue-lifecycle/scripts/list-issues.js
   --project <name>` to confirm the resolver chain works end-to-end.
