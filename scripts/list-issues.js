#!/usr/bin/env node
// List issues under a project. Walks the collection tree, flattens the
// project's children, and prints them sorted by ISS-<n>. Optionally filter
// by --status (triage label).

import { run } from './lib/outline-cli.js';
import { findCollectionId, findProjectId } from './lib/resolve.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

if (has('--help')) {
  printHelp();
  process.exit(0);
}

const project = get('--project');
if (!project) {
  console.error('Error: --project <name> is required.');
  printHelp();
  process.exit(1);
}

const statusFilter = get('--status') || null;
const showAll = has('--all');

try {
  const collectionId = await findCollectionId(get('--collection') || undefined);
  const projectId = await findProjectId(collectionId, project);
  const tree = await run('tree.js', [`--collection=${collectionId}`]);
  const projectNode = (tree.data || []).find((n) => n.id === projectId);
  if (!projectNode) throw new Error('Project disappeared mid-flight');
  const children = (projectNode.children || []).filter((c) => /^ISS-\d+:/.test(c.title));

  // Build rows. For status filtering we need to read each body — but
  // we keep the common path cheap: when no filter is given we just sort and
  // print titles. When a filter is set we read each page and parse the table.
  const rows = await Promise.all(children.map(async (c) => {
    const n = parseInt(c.title.match(/^ISS-(\d+):/)[1], 10);
    if (!statusFilter) {
      return { n, title: c.title, url: c.url, status: null, id: c.id };
    }
    const doc = await run('read.js', [`--id=${c.id}`]);
    const text = doc.data?.text || '';
    const status = extractStatus(text);
    return { n, title: c.title, url: c.url, status, id: c.id };
  }));

  const filtered = statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;
  filtered.sort((a, b) => a.n - b.n);

  if (has('--json')) {
    console.log(JSON.stringify(filtered, null, 2));
    process.exit(0);
  }

  const label = statusFilter ? ` (status: ${statusFilter})` : '';
  console.log(`Issues in "${project}": ${filtered.length}${label}\n`);
  for (const r of filtered) {
    const status = r.status ? `  [${r.status}]` : '';
    console.log(`  ISS-${String(r.n).padStart(2, '0')}  ${r.title.replace(/^ISS-\d+:\s*/, '')}${status}`);
    if (r.url) console.log(`           ${r.url}`);
  }
  if (filtered.length === 0 && !showAll) {
    console.log(`(no issues match. Use --all to see everything, or check --status spelling.)`);
  }
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function extractStatus(body) {
  // Cheap inline parser: look for `| Status        | <value> |` in the table.
  const m = body.match(/^\|\s*Status\s*\|\s*([^|]+?)\s*\|/m);
  return m ? m[1].trim() : null;
}

function printHelp() {
  console.log(`Usage: list-issues.js --project <name> [options]

Required:
  --project <name>      Project document name (e.g. "fsk-shop")

Options:
  --status <label>      Filter by triage label (needs-triage, needs-info,
                        ready-for-agent, ready-for-human, wontfix, done).
  --collection <name>   Tracker collection name (default from config).
  --all                 Show empty results without a "no issues match" hint.
  --json                Print machine-readable JSON

Examples:
  bun scripts/list-issues.js --project fsk-shop
  bun scripts/list-issues.js --project fsk-shop --status ready-for-agent --json`);
}
