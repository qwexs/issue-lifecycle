#!/usr/bin/env node
// Create a new issue page in the Outline tracker.
// Resolves the collection + project, picks the next ISS-<n>, renders the
// issue body from the standard template, and publishes it under the project
// document. Returns the new page URL.

import { run } from './lib/outline-cli.js';
import { findCollectionId, findProjectId, nextIssueNumber } from './lib/resolve.js';
import { buildBody, TRIAGE_LABELS } from './lib/issue-template.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

if (has('--help')) {
  printHelp();
  process.exit(0);
}

const project = get('--project');
const title = get('--title');
if (!project || !title) {
  console.error('Error: --project and --title are required.');
  printHelp();
  process.exit(1);
}

const status = get('--status') || 'ready-for-agent';
if (!TRIAGE_LABELS.has(status)) {
  console.error(`Error: --status "${status}" is not a known triage label.`);
  console.error(`Allowed: ${[...TRIAGE_LABELS].join(', ')}`);
  process.exit(1);
}

const shortTitle = title.includes(':') ? title.split(':').slice(1).join(':').trim() : title;
const labels = parseList(get('--label'));
const acceptance = parseList(get('--acceptance'));
const context = get('--context') || '';
const sourceRemote = get('--source-remote') || null;
const collectionName = get('--collection') || null;
const explicitNumber = get('--number') ? parseInt(get('--number'), 10) : null;

try {
  const collectionId = await findCollectionId(collectionName || undefined);
  const projectId = await findProjectId(collectionId, project);
  const n = explicitNumber ?? await nextIssueNumber(projectId);
  const id = `ISS-${n}`;
  const created = new Date().toISOString().slice(0, 10);

  const body = buildBody({
    id,
    project,
    status,
    labels,
    created,
    sourceRemote,
    title: shortTitle,
    context,
    acceptance,
  });

  const fullTitle = `${id}: ${shortTitle}`;
  const res = await run('create.js', [
    `--title=${fullTitle}`,
    `--text=${body}`,
    `--parent=${projectId}`,
    '--publish',
  ]);
  const doc = res.data;

  if (has('--json')) {
    console.log(JSON.stringify({ id, projectId, docId: doc.id, url: doc.url, status: 'created' }, null, 2));
    process.exit(0);
  }

  console.log(`✅ Issue ${id} created\n`);
  console.log(`Title:  ${fullTitle}`);
  console.log(`Status: ${status}`);
  console.log(`URL:    ${doc.url || 'N/A'}`);
  console.log(`\nNext steps:`);
  console.log(`  • bun scripts/set-status.js --issue ${n} --status <new>`);
  console.log(`  • bun scripts/log-progress.js --issue ${n} --type progress --text "..."`);
  console.log(`  • bun scripts/close-issue.js --issue ${n} --status done --summary "..."`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function parseList(v) {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function printHelp() {
  console.log(`Usage: new-issue.js --project <name> --title <text> [options]

Required:
  --project <name>       Project document name (e.g. "fsk-shop")
  --title <text>         Issue title; "ISS-<n>:" prefix is added automatically
                         unless --number is also passed.

Options:
  --status <label>       Triage label (default: ready-for-agent).
                         Allowed: needs-triage, needs-info, ready-for-agent,
                         ready-for-human, wontfix, done.
  --label <a,b,c>        Comma-separated domain labels.
  --acceptance <a,b,c>   Comma-separated acceptance criteria.
  --context <text>       Body of the "## Context" section.
  --source-remote <url>  Source remote for the metadata table.
  --collection <name>    Tracker collection name (default from config).
  --number <N>           Use a specific ISS-N (skips auto-increment).
  --json                 Print machine-readable JSON instead of human output.

Examples:
  bun scripts/new-issue.js --project fsk-shop \\
    --title "Phase 16 — refund_reversal" \\
    --context "..." --label phase,loyalty

  bun scripts/new-issue.js --project fsk-shop \\
    --title "Bug: checkout crashes on empty cart" \\
    --status needs-triage --label bug`);
}
