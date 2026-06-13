#!/usr/bin/env node
// Read a single issue by short id (ISS-<n>) or by full document id.
// Prints title, status, labels, URL, and the full body.

import { run } from './lib/outline-cli.js';
import { findCollectionId, findProjectId, findIssueByShortId, readDocument } from './lib/resolve.js';
import { parseTable } from './lib/table-parser.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

if (has('--help')) {
  printHelp();
  process.exit(0);
}

const issue = get('--issue');
const docId = get('--id');
const project = get('--project');

if (!issue && !docId) {
  console.error('Error: --issue <N> or --id <uuid> is required.');
  printHelp();
  process.exit(1);
}

try {
  let document;
  if (docId) {
    document = await readDocument(docId);
  } else {
    if (!project) {
      console.error('Error: --project <name> is required when using --issue <N>.');
      process.exit(1);
    }
    const collectionId = await findCollectionId(get('--collection') || undefined);
    const projectId = await findProjectId(collectionId, project);
    const n = parseInt(issue, 10);
    const issueDoc = await findIssueByShortId(projectId, n);
    if (!issueDoc) {
      console.error(`❌ ISS-${n} not found in project "${project}"`);
      process.exit(2);
    }
    document = await readDocument(issueDoc.id);
  }

  const table = parseTable(document.text || '');
  const find = (f) => table?.find((r) => r.field === f)?.value || '?';
  const status = find('Status');
  const labels = find('Labels') === '?' ? '' : find('Labels');
  const idField = find('ID');

  if (has('--json')) {
    console.log(JSON.stringify({
      id: idField,
      documentId: document.id,
      title: document.title,
      url: document.url,
      status,
      labels,
      updatedAt: document.updatedAt,
      body: document.text,
    }, null, 2));
    process.exit(0);
  }

  console.log(`Title:   ${document.title}`);
  console.log(`ID:      ${idField}`);
  console.log(`Status:  ${status}`);
  if (labels) console.log(`Labels:  ${labels}`);
  console.log(`Updated: ${document.updatedAt?.slice(0, 10) || 'N/A'}`);
  console.log(`URL:     ${document.url || 'N/A'}`);
  console.log('\n---\n');
  console.log(document.text || '(empty)');
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: read-issue.js --project <name> --issue <N> [options]
       read-issue.js --id <uuid> [options]

Required (one of):
  --project <name> --issue <N>   Short id (e.g. 13) under a named project
  --id <uuid>                    Outline document id

Options:
  --collection <name>   Tracker collection name (default from config)
  --json                Print machine-readable JSON

Examples:
  bun scripts/read-issue.js --project fsk-shop --issue 13
  bun scripts/read-issue.js --id 9a2d1298-9ae7-4169-9082-a2aef835a2e0 --json`);
}
