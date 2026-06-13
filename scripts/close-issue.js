#!/usr/bin/env node
// Close an issue: append an `## Outcome` block to `## Notes`, then update
// the Status field. The two updates are done sequentially; if the first
// fails the status is not touched.
//
// The Outcome block is structured so the next session can resume from it:
// - one-line summary
// - bullet list of artifacts (handoff / commits / PRs)
// - bullet list of follow-ups (anything that escaped this session)

import { run } from './lib/outline-cli.js';
import { findCollectionId, findProjectId, findIssueByPath } from './lib/resolve.js';
import { appendToNotes, parseTable, updateField } from './lib/table-parser.js';
import { TRIAGE_LABELS } from './lib/issue-template.js';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
const has = (flag) => args.includes(flag);
const getAll = (flag) => {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) out.push(args[i + 1]);
  }
  return out;
};

if (has('--help')) {
  printHelp();
  process.exit(0);
}

const issue = get('--issue');
const project = get('--project');
const status = get('--status') || 'done';
const summary = get('--summary') || null;
const handoffs = getAll('--handoff');
const commits = getAll('--commit');
const prs = getAll('--pr');
const followups = getAll('--followup');
const labels = get('--label'); // optional, comma-separated

if (!issue || !project) {
  console.error('Error: --issue and --project are required.');
  printHelp();
  process.exit(1);
}
if (!TRIAGE_LABELS.has(status)) {
  console.error(`Error: --status "${status}" is not a known triage label.`);
  console.error(`Allowed: ${[...TRIAGE_LABELS].join(', ')}`);
  process.exit(1);
}
if (status === 'wontfix' || status === 'ready-for-human') {
  // Allowed but worth a warning if no reason provided.
  if (!summary) {
    console.error(`Error: --summary is required when closing as "${status}".`);
    process.exit(1);
  }
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

  // 1. Append the Outcome block.
  const outcome = buildOutcome({ summary, handoffs, commits, prs, followups });
  let newBody = appendToNotes(doc.text || '', outcome, 'outcome');

  // 2. Optionally update Labels row.
  if (labels) {
    newBody = updateField(newBody, 'Labels', labels);
  }

  // 3. Update Status.
  newBody = updateField(newBody, 'Status', status);

  await run('update.js', [`--id=${issueDoc.id}`, `--text=${newBody}`]);

  if (has('--json')) {
    console.log(JSON.stringify({
      issue: `ISS-${n}`,
      oldStatus,
      newStatus: status,
      outcome: outcome.trim(),
      ok: true,
    }, null, 2));
    process.exit(0);
  }

  console.log(`✅ ISS-${n} closed\n`);
  console.log(`Status: ${oldStatus} → ${status}`);
  console.log(`URL:    ${doc.url || 'N/A'}`);
  console.log(`\n--- outcome ---\n${outcome}\n----------------`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

function buildOutcome({ summary, handoffs, commits, prs, followups }) {
  const out = [];
  if (summary) out.push(summary);
  const lines = [];
  if (handoffs.length) lines.push(`- **handoff**: ${handoffs.map((h) => `\`${h}\``).join(', ')}`);
  if (commits.length)  lines.push(`- **commits**: ${commits.map((c) => `\`${c}\``).join(', ')}`);
  if (prs.length)      lines.push(`- **prs**: ${prs.map((p) => `${p}`).join(', ')}`);
  if (followups.length) lines.push(`- **follow-ups**:\n${followups.map((f) => `  - ${f}`).join('\n')}`);
  if (lines.length) {
    out.push('');
    out.push('Artifacts:');
    out.push(...lines);
  }
  return out.join('\n');
}

function printHelp() {
  console.log(`Usage: close-issue.js --project <name> --issue <N> [options]

Required:
  --project <name>      Project document name
  --issue <N>           Issue short id
  --summary <text>      One-line summary of what was done (or why cancelled)
                        (required when --status is "wontfix" or "ready-for-human")

Options:
  --status <label>      Final triage label (default: done)
                        Allowed: done, ready-for-human, wontfix
  --label <a,b,c>       Replace the Labels row (optional)
  --handoff <path>      Path to a handoff doc (repeatable)
  --commit <sha>        Commit SHA (repeatable)
  --pr <url>            Pull request URL (repeatable)
  --followup <text>     Follow-up item that escaped the session (repeatable)
  --collection <name>   Tracker collection name (default from config)
  --json                Print machine-readable JSON

Examples:
  bun scripts/close-issue.js --project fsk-shop --issue 13 --status done \\
    --summary "Phase 16 implemented: deferred earn + refund_reversal + cron" \\
    --commit aa047719 --commit a43ba921 \\
    --handoff docs/agents/handoff/2026-06-XX-phase16-done-phase17-next.md

  bun scripts/close-issue.js --project fsk-shop --issue 13 --status wontfix \\
    --summary "Cancelled: deferred earn conflicts with cashback accounting"`);
}
