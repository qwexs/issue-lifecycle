#!/usr/bin/env node
// Create a new issue page.
//
// Two parent modes are supported (mutually exclusive):
//
//   --project <name>     Legacy "collection → project → ISS-<n>" mode.
//                        Project doc lives inside a collection; we resolve
//                        it via `tree.js --collection=<id>`. Issue becomes
//                        a child of the project doc.
//
//   --spec <docId>       Spec-rooted mode. The parent is an arbitrary Outline
//                        document (typically a SPEC / Architecture page) in
//                        any collection. Issue becomes a direct child of the
//                        spec doc. No collection-walk needed.
//
// In spec mode, the issue's `Project` row is set to the spec's title and an
// extra `Spec` row is appended (markdown link to the spec) for context.

import { run } from './lib/outline-cli.js';
import { resolveContext } from './lib/resolve.js';
import { buildBody, TRIAGE_LABELS } from './lib/issue-template.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);

if (has('--help')) {
  printHelp();
  process.exit(0);
}

const project = get('--project');
const spec = get('--spec');
const title = get('--title');
if (!title) {
  console.error('Error: --title is required.');
  printHelp();
  process.exit(1);
}
if (!project && !spec) {
  console.error('Error: either --project <name> or --spec <docId> is required.');
  printHelp();
  process.exit(1);
}

const status = get('--status') || 'ready-for-agent';
if (!TRIAGE_LABELS.has(status)) {
  console.error(`Error: --status "${status}" is not a known triage label.`);
  console.error(`Allowed: ${[...TRIAGE_LABELS].join(', ')}`);
  process.exit(1);
}

const shortTitle = title;
const labels = parseList(get('--label'));
const acceptance = parseList(get('--acceptance'));
const context = get('--context') || '';
const sourceRemote = get('--source-remote') || null;
const explicitNumber = get('--number') ? parseInt(get('--number'), 10) : null;

try {
  const ctx = await resolveContext({ spec, project, collection: get('--collection') || null });
  const n = explicitNumber ?? await ctx.nextNumber();
  const id = `ISS-${n}`;
  const created = new Date().toISOString().slice(0, 10);

  // In spec mode we render an extra `Spec` row pointing back to the parent.
  const specUrl = ctx.mode === 'spec' && ctx.specUrl && ctx.specTitle
    ? `[${ctx.specTitle}](${ctx.specUrl})`
    : null;

  const projectField = ctx.mode === 'spec' ? ctx.specTitle : ctx.projectName;

  const body = buildBody({
    id,
    project: projectField,
    status,
    labels,
    created,
    sourceRemote,
    specUrl,
    title: shortTitle,
    context,
    acceptance,
  });

  const fullTitle = `${id}: ${shortTitle}`;
  const res = await run('create.js', [
    `--title=${fullTitle}`,
    `--text=${body}`,
    `--parent=${ctx.mode === 'spec' ? ctx.specId : ctx.projectId}`,
    '--publish',
  ]);
  const doc = res.data;

  if (has('--json')) {
    console.log(JSON.stringify({
      id,
      mode: ctx.mode,
      parentId: ctx.mode === 'spec' ? ctx.specId : ctx.projectId,
      docId: doc.id,
      url: doc.url,
      status: 'created',
    }, null, 2));
    process.exit(0);
  }

  console.log(`✅ Issue ${id} created\n`);
  console.log(`Title:  ${fullTitle}`);
  console.log(`Status: ${status}`);
  console.log(`Mode:   ${ctx.mode}${ctx.mode === 'spec' ? ` (spec: ${ctx.specTitle})` : ` (project: ${ctx.projectName})`}`);
  console.log(`URL:    ${doc.url || 'N/A'}`);
  console.log(`\nNext steps:`);
  console.log(`  • bun scripts/set-status.js --${ctx.mode === 'spec' ? `spec ${ctx.specId}` : `project ${ctx.projectName}`} --issue ${n} --status <new>`);
  console.log(`  • bun scripts/log-progress.js --${ctx.mode === 'spec' ? `spec ${ctx.specId}` : `project ${ctx.projectName}`} --issue ${n} --type progress --text "..."`);
  console.log(`  • bun scripts/close-issue.js --${ctx.mode === 'spec' ? `spec ${ctx.specId}` : `project ${ctx.projectName}`} --issue ${n} --status done --summary "..."`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function parseList(v) {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function printHelp() {
  console.log(`Usage: new-issue.js (--project <name> | --spec <docId>) --title <text> [options]

Required (one of):
  --project <name>       Project document name (e.g. "fsk-shop"); legacy
                          collection-rooted mode.
  --spec <docId>         Outline document id of the parent spec; the issue
                          becomes a direct child of that spec. The spec can
                          live in any collection.

Options:
  --title <text>         Issue title; "ISS-<n>:" prefix is added automatically
                          unless --number is also passed.
  --status <label>       Triage label (default: ready-for-agent).
                          Allowed: needs-triage, needs-info, ready-for-agent,
                          ready-for-human, wontfix, done.
  --label <a,b,c>        Comma-separated domain labels.
  --acceptance <a,b,c>   Comma-separated acceptance criteria.
  --context <text>       Body of the "## Context" section.
  --source-remote <url>  Source remote for the metadata table.
  --collection <name>    Tracker collection name (legacy --project mode only).
  --number <N>           Use a specific ISS-N (skips auto-increment).
  --json                 Print machine-readable JSON instead of human output.

Examples (spec mode):
  bun scripts/new-issue.js --spec LtsW8BKXZf \\
    --title "OpenAI/ChatGPT on mobile network (unresolved)" \\
    --status ready-for-agent --label mobile,openai

Examples (project mode):
  bun scripts/new-issue.js --project fsk-shop \\
    --title "Phase 16 — refund_reversal" \\
    --context "..." --label phase,loyalty`);
}
