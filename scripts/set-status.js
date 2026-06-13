#!/usr/bin/env node
// Set the Status field in the metadata table of an issue.
// Resolves the issue, reads its body, parses the table, replaces the value
// of the `Status` row, and updates the page.

import { run } from './lib/outline-cli.js';
import { findCollectionId, findProjectId, findIssueByPath } from './lib/resolve.js';
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
const status = get('--status');

if (!issue || !project || !status) {
  console.error('Error: --issue, --project and --status are all required.');
  printHelp();
  process.exit(1);
}
if (!TRIAGE_LABELS.has(status)) {
  console.error(`Error: --status "${status}" is not a known triage label.`);
  console.error(`Allowed: ${[...TRIAGE_LABELS].join(', ')}`);
  process.exit(1);
}

try {
  const collectionId = await findCollectionId(get('--collection') || undefined);
  const projectId = await findProjectId(collectionId, project);
  const issueDoc = await findIssueByPath(projectId, collectionId, issue);
  if (!issueDoc) {
    console.error(`❌ ISS-${issue} not found in project "${project}"`);
    process.exit(2);
  }

  const doc = (await run('read.js', [`--id=${issueDoc.id}`])).data;
  const oldStatus = parseTable(doc.text || '')?.find((r) => r.field === 'Status')?.value || '?';
  if (oldStatus === status) {
    console.log(`No change: ISS-${n} already at status "${status}".`);
    process.exit(0);
  }

  const newBody = updateField(doc.text, 'Status', status);
  await run('update.js', [`--id=${issueDoc.id}`, `--text=${newBody}`]);

  if (has('--json')) {
    console.log(JSON.stringify({ issue: `ISS-${n}`, oldStatus, newStatus: status, ok: true }, null, 2));
    process.exit(0);
  }

  console.log(`✅ ISS-${n} status updated: ${oldStatus} → ${status}`);
  console.log(`URL:  ${doc.url || 'N/A'}`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: set-status.js --project <name> --issue <N> --status <label> [options]

Required:
  --project <name>      Project document name
  --issue <N>           Issue short id (e.g. 13)
  --status <label>      New triage label
                        (needs-triage, needs-info, ready-for-agent,
                         ready-for-human, wontfix, done)

Options:
  --collection <name>   Tracker collection name (default from config)
  --json                Print machine-readable JSON

Examples:
  bun scripts/set-status.js --project fsk-shop --issue 13 --status in-progress
  bun scripts/set-status.js --project fsk-shop --issue 13 --status done --json`);
}
