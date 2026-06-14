#!/usr/bin/env node
// List issues under a project or a spec.
//
// In --project mode, walks the collection tree, flattens the project's
// children, and prints them sorted by ISS-<n>.
//
// In --spec mode, lists direct children of the spec doc via
// `list.js --parent=<specId>`, then filters on the ISS-<n> title prefix.
// No collection-walk is performed in spec mode.

import { run } from './lib/outline-cli.js';
import { resolveContext } from './lib/resolve.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

if (has('--help')) {
  printHelp();
  process.exit(0);
}

const project = get('--project');
const spec = get('--spec');
if (!project && !spec) {
  console.error('Error: either --project <name> or --spec <docId> is required.');
  printHelp();
  process.exit(1);
}

const statusFilter = get('--status') || null;
const showAll = has('--all');

try {
  const ctx = await resolveContext({ spec, project, collection: get('--collection') || null });
  const children = await listChildren(ctx);

  // Build rows. For status filtering we read each body; the no-filter path
  // stays cheap by reading only the listing data.
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
    console.log(JSON.stringify({ mode: ctx.mode, ...filtered }, null, 2));
    process.exit(0);
  }

  const label = statusFilter ? ` (status: ${statusFilter})` : '';
  const parentLabel = ctx.mode === 'spec' ? ctx.specTitle : ctx.projectName;
  console.log(`Issues in "${parentLabel}" [${ctx.mode}]: ${filtered.length}${label}\n`);
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

async function listChildren(ctx) {
  if (ctx.mode === 'spec') {
    const res = await run('list.js', [`--parent=${ctx.specId}`]);
    return (res.data || []).filter((c) => /^ISS-\d+:/.test(c.title));
  }
  // project mode: walk the collection tree.
  const tree = await run('tree.js', [`--collection=${ctx.collectionId}`]);
  const projectNode = (tree.data || []).find((n) => n.id === ctx.projectId);
  if (!projectNode) throw new Error('Project disappeared mid-flight');
  return (projectNode.children || []).filter((c) => /^ISS-\d+:/.test(c.title));
}

function extractStatus(body) {
  // Cheap inline parser: look for `| Status        | <value> |` in the table.
  const m = body.match(/^\|\s*Status\s*\|\s*([^|]+?)\s*\|/m);
  return m ? m[1].trim() : null;
}

function printHelp() {
  console.log(`Usage: list-issues.js (--project <name> | --spec <docId>) [options]

Required (one of):
  --project <name>      Project document name (e.g. "fsk-shop")
  --spec <docId>        Outline document id of the parent spec

Options:
  --status <label>      Filter by triage label (needs-triage, needs-info,
                        ready-for-agent, ready-for-human, wontfix, done).
  --collection <name>   Tracker collection name (legacy --project mode only).
  --all                 Show empty results without a "no issues match" hint.
  --json                Print machine-readable JSON

Examples:
  bun scripts/list-issues.js --project fsk-shop
  bun scripts/list-issues.js --spec LtsW8BKXZf --status ready-for-agent --json`);
}
