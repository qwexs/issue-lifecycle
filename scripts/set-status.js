#!/usr/bin/env node
// Set the Status field in the metadata table of an issue.
// Resolves the issue via --project or --spec, reads its body, parses the
// table, replaces the value of the `Status` row, and updates the page.

import { run } from './lib/outline-cli.js';
import { resolveContext, readDocument } from './lib/resolve.js';
import { parseTable, updateField } from './lib/table-parser.js';
import { TRIAGE_LABELS } from './lib/issue-template.js';

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
const status = get('--status');

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
if (!status) {
  console.error('Error: --status <label> is required.');
  printHelp();
  process.exit(1);
}
if (!TRIAGE_LABELS.has(status)) {
  console.error(`Error: --status "${status}" is not a known triage label.`);
  console.error(`Allowed: ${[...TRIAGE_LABELS].join(', ')}`);
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
  const oldStatus = parseTable(doc.text || '')?.find((r) => r.field === 'Status')?.value || '?';
  if (oldStatus === status) {
    console.log(`No change: ISS-${issue} already at status "${status}".`);
    process.exit(0);
  }

  const newBody = updateField(doc.text, 'Status', status);
  await run('update.js', [`--id=${issueDoc.id}`, `--text=${newBody}`]);

  if (has('--json')) {
    console.log(JSON.stringify({ issue: `ISS-${issue}`, oldStatus, newStatus: status, ok: true }, null, 2));
    process.exit(0);
  }

  console.log(`✅ ISS-${issue} status updated: ${oldStatus} → ${status}`);
  console.log(`URL:  ${doc.url || 'N/A'}`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: set-status.js (--project <name> | --spec <docId>) --issue <N> --status <label> [options]

Required:
  --issue <N>           Issue short id (e.g. 13)
  --status <label>      New triage label
                        (needs-triage, needs-info, ready-for-agent,
                         ready-for-human, wontfix, done)

Parent (one of):
  --project <name>      Project document name (legacy collection-rooted mode)
  --spec <docId>        Outline document id of the parent spec

Options:
  --collection <name>   Tracker collection name (legacy --project mode only)
  --json                Print machine-readable JSON

Examples:
  bun scripts/set-status.js --project fsk-shop --issue 13 --status in-progress
  bun scripts/set-status.js --spec LtsW8BKXZf --issue 19 --status done --json`);
}
