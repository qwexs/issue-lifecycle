// Build the issue body from the template defined in
// `docs/agents/issue-tracker.md`. The metadata table is rendered as a
// markdown table that the table-parser can later update in place.

import { loadConfig } from './config.js';

const config = loadConfig();
const FIELDS = (config._defaults && config._defaults.tableFields)
  || ['ID', 'Project', 'Status', 'Labels', 'Created', 'Source remote'];

const TRIAGE_LABELS = new Set([
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
  'done',
]);

// `Spec` is an optional metadata field. It is rendered as an extra row
// in the metadata table when `input.specUrl` is set (i.e. when the issue
// lives under a spec doc via `--spec` mode). It carries a markdown link
// to the parent spec so readers of the issue can jump back to context.
const OPTIONAL_FIELDS = ['Spec'];

/**
 * Build the full markdown body of an issue page.
 *
 * @param {object} input
 * @param {string} input.id              - "ISS-13"
 * @param {string} input.project         - "fsk-shop" (legacy) or spec title (spec mode)
 * @param {string} input.status          - "ready-for-agent" (or "needs-triage" default)
 * @param {string[]} [input.labels]      - ["phase", "loyalty"]
 * @param {string} input.created         - "2026-06-13"
 * @param {string} [input.sourceRemote]  - git url
 * @param {string} [input.specUrl]       - markdown link to the parent spec doc, e.g.
 *                                         "[VPN Infra](https://outline.apriori.tech/doc/...)"
 * @param {string} input.title           - "Phase 16 — refund_reversal"
 * @param {string} [input.context]       - markdown body for ## Context
 * @param {string[]} [input.acceptance]  - list of criteria (rendered as checkboxes)
 * @param {string} [input.notes]         - pre-existing notes (rare)
 */
export function buildBody(input) {
  const labels = (input.labels || []).filter(Boolean).join(', ');
  const fieldValues = {
    ID: input.id,
    Project: input.project,
    Status: input.status,
    Labels: labels,
    Created: input.created,
    'Source remote': input.sourceRemote || '',
  };

  // Render the canonical 2-column table. Always include the standard fields;
  // append the optional `Spec` row when the caller passed a spec link.
  const fields = [...FIELDS];
  if (input.specUrl) {
    fieldValues.Spec = input.specUrl;
    fields.push('Spec');
  }

  const table = renderTable2Col(fields, fieldValues);
  const acceptance = (input.acceptance || [])
    .map((line) => `- [ ] ${line}`)
    .join('\n');

  const parts = [
    table,
    '',
    `# ${input.title}`,
    '',
    '## Context',
    '',
    input.context?.trim() || '_No context provided._',
    '',
    '## Acceptance criteria',
    '',
    acceptance || '_No acceptance criteria yet._',
    '',
    '## Notes',
    '',
    input.notes?.trim() || '_No notes yet._',
    '',
  ];
  return parts.join('\n');
}

/**
 * Render the metadata table with consistent column widths.
 */
function renderTable2Col(fields, values) {
  const fieldCol = Math.max(...fields.map((f) => f.length), 'Field'.length);
  const valueCol = Math.max(...fields.map((f) => String(values[f] || '').length), 'Value'.length);
  const lines = [
    '| ' + 'Field'.padEnd(fieldCol) + ' | ' + 'Value'.padEnd(valueCol) + ' |',
    '| ' + '-'.repeat(fieldCol) + ' | ' + '-'.repeat(valueCol) + ' |',
  ];
  for (const f of fields) {
    lines.push('| ' + f.padEnd(fieldCol) + ' | ' + String(values[f] || '').padEnd(valueCol) + ' |');
  }
  return lines.join('\n');
}

export { TRIAGE_LABELS, OPTIONAL_FIELDS };
