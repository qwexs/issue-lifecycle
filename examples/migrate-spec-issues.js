#!/usr/bin/env node
// One-off helper: lift numbered issues from a SPEC / runbook into child
// ISS-<n> pages.
//
// USAGE
//   bun examples/migrate-spec-issues.js --spec <docId> --map <path> [--apply]
//
// DRY-RUN (default)
//   Reads the spec, parses every `### N. <title>` block, looks up each N in
//   the map JSON, and prints the planned actions. Makes no API writes.
//
// APPLY
//   With --apply, builds the same body that new-issue.js would build and
//   calls `outline/scripts/create.js` directly via the shared `run()` helper
//   (no subprocess, no child_process). After each create it prints the
//   canonical URL. After all creates it prints a replacement plan for the
//   parent spec.
//
// MAP FILE FORMAT (--map)
//   { "issues": [ { "n": 1, "status": "done", "labels": ["a", "b"] }, ... ] }

import { readFileSync } from 'fs';
import { run } from '../scripts/lib/outline-cli.js';
import { buildBody, TRIAGE_LABELS } from '../scripts/lib/issue-template.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

if (has('--help')) { printHelp(); process.exit(0); }

const spec = get('--spec');
const mapPath = get('--map');
const dryRun = !has('--apply');
const verbose = has('--verbose');

if (!spec || !mapPath) { console.error('Error: --spec <docId> and --map <path> are required.'); printHelp(); process.exit(1); }

try {
  const specDoc = await readSpec(spec);
  const specText = specDoc.text || '';
  const specTitle = specDoc.title;
  const specUrl = specDoc.url;

  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const issuesByN = new Map((map.issues || []).map((i) => [i.n, i]));

  const blocks = parseIssueBlocks(specText);

  const plan = [];
  const skipped = [];
  for (const b of blocks) {
    const entry = issuesByN.get(b.n);
    if (!entry) { skipped.push({ n: b.n, title: b.title, reason: 'no map entry' }); continue; }
    if (!TRIAGE_LABELS.has(entry.status)) { skipped.push({ n: b.n, title: b.title, reason: `unknown status "${entry.status}"` }); continue; }
    plan.push({ n: b.n, title: b.title, status: entry.status, labels: entry.labels || [], content: b.content.trim() });
  }

  console.log(`📄 Spec: ${specTitle}  (${specUrl})`);
  console.log(`🔢 Parsed ${blocks.length} \`### N.\` blocks, ${plan.length} matched to map, ${skipped.length} skipped.\n`);

  for (const p of plan) {
    console.log(`  ISS-${String(p.n).padStart(2, '0')}: ${p.title}`);
    console.log(`    status:  ${p.status}`);
    console.log(`    labels:  ${p.labels.join(', ') || '—'}`);
    const preview = p.content.split('\n').filter(Boolean)[0] || '';
    console.log(`    preview: ${preview.slice(0, 100)}${preview.length > 100 ? '…' : ''}`);
  }
  if (skipped.length) {
    console.log(`\n⚠ Skipped:`);
    for (const s of skipped) console.log(`    ISS-${s.n}: ${s.title} (${s.reason})`);
  }

  if (dryRun) { console.log(`\n(dry-run; pass --apply to create pages.)`); process.exit(0); }

  console.log(`\n🚀 Applying…\n`);
  const created = [];
  for (const p of plan) {
    if (verbose) console.log(`  → ISS-${p.n}: ${p.title}`);
    const result = await createIssue(p, specDoc);
    created.push({ n: p.n, title: p.title, url: result?.url || '(no url)' });
  }

  console.log(`\n✅ Created ${created.length} ISS pages under spec ${specTitle}.`);
  console.log(`\nCreated URLs:`);
  for (const c of created) console.log(`  ISS-${String(c.n).padStart(2, '0')}  ${c.url}`);

  console.log(`\n📝 Next: replace each \`### N. <title>\` block in the parent spec with a link to the new ISS page. Suggested replacement pattern:\n`);
  for (const p of plan) console.log(`  ### N. [ISS-${p.n}: ${p.title}](<paste URL here>)`);
} catch (e) { console.error(`❌ ${e.message}`); process.exit(1); }

async function readSpec(specId) {
  const res = await run('read.js', [`--id=${specId}`]);
  if (!res?.data) throw new Error(`Spec ${specId} unreadable`);
  return res.data;
}

function parseIssueBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let current = null;
  let inContent = false;
  for (const line of lines) {
    const m = line.match(/^###\s+(\d+)\.\s+(.+?)\s*$/);
    if (m) {
      if (current) blocks.push(finalizeBlock(current));
      current = { n: parseInt(m[1], 10), title: m[2].trim(), content: '' };
      inContent = true;
      continue;
    }
    if (inContent && /^##\s/.test(line)) {
      blocks.push(finalizeBlock(current));
      current = null; inContent = false;
      continue;
    }
    if (inContent && current) current.content += line + '\n';
  }
  if (current) blocks.push(finalizeBlock(current));
  return blocks;
}

function finalizeBlock(b) { return { n: b.n, title: b.title, content: b.content.trim() }; }

async function createIssue(p, specDoc) {
  const id = `ISS-${p.n}`;
  const created = new Date().toISOString().slice(0, 10);
  const specUrl = specDoc.url ? `[${specDoc.title}](${specDoc.url})` : null;
  const body = buildBody({
    id,
    project: specDoc.title,
    status: p.status,
    labels: p.labels,
    created,
    sourceRemote: null,
    specUrl,
    title: p.title,
    context: p.content,
    acceptance: [],
  });
  const fullTitle = `${id}: ${p.title}`;
  const res = await run('create.js', [
    `--title=${fullTitle}`,
    `--text=${body}`,
    `--parent=${specDoc.id}`,
    '--publish',
  ]);
  return res.data;
}

function printHelp() {
  console.log(`Usage: migrate-spec-issues.js --spec <docId> --map <path> [--apply]

Required:
  --spec <docId>     Outline document id of the spec page to migrate.
  --map <path>       Path to a JSON map of { issues: [{n, status, labels}, ...] }.

Options:
  --apply            Actually create the ISS pages via outline/scripts/create.js.
  --verbose          Print per-issue progress during --apply.
  --help             Show this help.`);
}
