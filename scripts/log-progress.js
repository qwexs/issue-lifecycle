#!/usr/bin/env node
// Append a timestamped entry to the `## Notes` section of an issue.
// Three entry types:
//   - progress: free-form text describing what was done in a checkpoint
//   - link:     structured pointer to an artifact (handoff / ROADMAP / SPEC / commit / pr)
//   - outcome:  same shape as progress but uses the close heading prefix

import { run } from './lib/outline-cli.js';
import { resolveContext, readDocument } from './lib/resolve.js';
import { appendToNotes } from './lib/table-parser.js';

const VALID_TYPES = new Set(['progress', 'link', 'outcome']);
const VALID_TARGETS = new Set(['handoff', 'roadmap', 'spec', 'commit', 'pr', 'doc', 'decision']);

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

if (has('--help')) {
  printHelp();
  process.exit(0);
}

const issue = get('--issue');
const project = get('--project');
const spec = get('--spec');
const type = get('--type') || 'progress';
const text = get('--text');
const target = get('--target') || null;
const ref = get('--ref') || null;

if (!issue) {
  console.error('Error: --issue <N> is required.');
  printHelp();
  process.exit(1);
}
if (!project && !spec) {
  console.error('Error: either --project <name> or --spec <docId> is required.');
  printHelp();
  process.exit(1);
}
if (!VALID_TYPES.has(type)) {
  console.error(`Error: --type must be one of: ${[...VALID_TYPES].join(', ')}`);
  process.exit(1);
}
if (!text && !(type === 'link' && target && ref)) {
  console.error('Error: provide --text, or (--type=link) both --target and --ref.');
  printHelp();
  process.exit(1);
}
if (target && !VALID_TARGETS.has(target)) {
  console.error(`Error: --target must be one of: ${[...VALID_TARGETS].join(', ')}`);
  process.exit(1);
}

try {
  const ctx = await resolveContext({ spec, project, collection: get('--collection') || null });
  const issueDoc = await ctx.findIssue(issue);
  if (!issueDoc) {
    const where = ctx.mode === 'spec' ? `spec "${ctx.specTitle}"` : `project "${ctx.projectName}"`;
    console.error(`❌ ISS-${issue} not found in ${where}`);
    process.exit(2);
  }

  const doc = await readDocument(issueDoc.id);
  const entry = buildEntry({ type, text, target, ref });
  const newBody = appendToNotes(doc.text || '', entry, type);

  // Only update if the body actually changed (idempotent for repeated calls).
  if (newBody === doc.text) {
    console.log(`No change: identical entry already present in ISS-${issue}.`);
    process.exit(0);
  }
  await run('update.js', [`--id=${issueDoc.id}`, `--text=${newBody}`]);

  if (has('--json')) {
    console.log(JSON.stringify({ issue: `ISS-${issue}`, type, entry, ok: true }, null, 2));
    process.exit(0);
  }

  console.log(`✅ Logged ${type} entry to ISS-${issue}`);
  console.log(`URL: ${doc.url || 'N/A'}`);
  console.log(`\n--- entry ---\n${entry}\n--------------`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function buildEntry({ type, text, target, ref }) {
  if (type === 'link') {
    // Render as: - **[target]**: <ref> — <optional text>
    const head = `- **${target}**: \`${ref}\``;
    return text ? `${head} — ${text}` : head;
  }
  return text;
}

function printHelp() {
  console.log(`Usage: log-progress.js (--project <name> | --spec <docId>) --issue <N> [--type <kind>] [options]

Required (one of):
  --text <body>                          Free-form text (any type)
  --type link --target <kind> --ref <s>  Structured link to an artifact

Parent (one of):
  --project <name>     Project document name (legacy mode)
  --spec <docId>       Outline document id of the parent spec

Options:
  --issue <N>          Issue short id
  --type <kind>        progress | link | outcome (default: progress)
  --target <kind>      For --type=link: handoff | roadmap | spec | commit | pr | doc | decision
  --ref <ref>          The reference: handoff path, ROADMAP § anchor, commit SHA, PR URL, etc.
  --text <body>        Body of the entry (for --type=link, appended after the ref)
  --collection <name>  Tracker collection name (legacy --project mode only)
  --json               Print machine-readable JSON

Examples:
  bun scripts/log-progress.js --project fsk-shop --issue 13 \\
    --type progress --text "Resolved Q-Q1..Q-Q4"

  bun scripts/log-progress.js --spec LtsW8BKXZf --issue 19 \\
    --type link --target commit --ref aa047719 --text "Phase 16 code"`);
}
