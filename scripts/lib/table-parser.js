// Parse and update the metadata table in an issue body.
// The table format is fixed (see `docs/agents/issue-tracker.md`):
//
//   | Field         | Value                                |
//   | ------------- | ------------------------------------ |
//   | ID            | ISS-13                               |
//   | Project       | fsk-shop                             |
//   | Status        | ready-for-agent                      |
//   | ...           | ...                                  |
//
// `parseTable()` returns the rows in document order as `[{field, value}]`.
// `updateField()` rewrites one row and re-renders the table with consistent
// column widths, so columns stay aligned after any value change.

/**
 * Parse the metadata table from a markdown body. Returns an array of
 * `{ field, value }` in document order, or null if the table is not present.
 */
export function parseTable(body) {
  const lines = body.split('\n');
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (!line.startsWith('|')) {
      if (inTable) break;
      continue;
    }
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    if (!inTable && cells[0].trim() === 'Field') {
      inTable = true;
      continue;
    }
    if (inTable && isSeparator(cells)) continue;
    if (inTable) {
      rows.push({ field: cells[0].trim(), value: cells[1].trim() });
    }
  }
  return rows.length > 0 ? rows : null;
}

/**
 * Update a single field in the metadata table. Returns the new body string.
 * Throws if the table is missing or the field is not in it. The whole table
 * is re-rendered so column widths stay consistent with the new value.
 */
export function updateField(body, field, newValue) {
  const rows = parseTable(body);
  if (!rows) throw new Error('Metadata table not found in issue body');
  const target = rows.find((r) => r.field === field);
  if (!target) throw new Error(`Field "${field}" not found in the metadata table`);
  target.value = String(newValue);
  return replaceTable(body, rows);
}

/**
 * Update multiple fields in one pass. Order of the `updates` object does not
 * matter; document order is preserved.
 */
export function updateFields(body, updates) {
  let result = body;
  for (const [field, value] of Object.entries(updates)) {
    result = updateField(result, field, value);
  }
  return result;
}

/**
 * Append a timestamped entry to the `## Notes` section. If the section is
 * missing, it is created at the end of the body.
 *
 * @param {string} body
 * @param {string} entry  - markdown text (will be prefixed with `### <ISO date> — <type>`)
 * @param {string} [type] - "progress" | "link" | "outcome" (default "progress")
 */
export function appendToNotes(body, entry, type = 'progress') {
  const date = new Date().toISOString().slice(0, 10);
  const heading = `### ${date} — ${type}`;
  const block = `${heading}\n\n${entry.trim()}\n`;

  const lines = body.split('\n');
  const notesIdx = lines.findIndex((l) => l.trim() === '## Notes');
  if (notesIdx === -1) {
    return body.trimEnd() + '\n\n## Notes\n\n' + block;
  }
  // Find the end of the Notes section (next ## heading or end of body).
  let endIdx = lines.length;
  for (let i = notesIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { endIdx = i; break; }
  }
  // Drop trailing blank lines in the prefix to keep spacing tidy.
  const before = lines.slice(0, endIdx);
  while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
  const after = lines.slice(endIdx);
  return [...before, '', block.trimEnd(), '', ...after].join('\n');
}

// --- internals ---

function replaceTable(body, rows) {
  const fieldCol = Math.max('Field'.length, ...rows.map((r) => r.field.length));
  const valueCol = Math.max('Value'.length, ...rows.map((r) => r.value.length));
  const header = '| ' + 'Field'.padEnd(fieldCol) + ' | ' + 'Value'.padEnd(valueCol) + ' |';
  const sep = '| ' + '-'.repeat(fieldCol) + ' | ' + '-'.repeat(valueCol) + ' |';
  const dataRows = rows.map((r) =>
    '| ' + r.field.padEnd(fieldCol) + ' | ' + r.value.padEnd(valueCol) + ' |'
  );
  const rendered = [header, sep, ...dataRows].join('\n');

  // Walk the body, drop the original table, splice the re-rendered one in.
  const lines = body.split('\n');
  const out = [];
  let i = 0;
  let replaced = false;
  while (i < lines.length) {
    if (!replaced && lines[i].startsWith('|') && lines[i].includes('Field')) {
      out.push(rendered);
      replaced = true;
      i++;
      // Skip until we leave the table.
      while (i < lines.length && lines[i].startsWith('|')) i++;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  if (!replaced) {
    // Original table was not found by the walk above; append at the end.
    out.push('', rendered);
  }
  return out.join('\n');
}

function splitRow(line) {
  const trimmed = line.replace(/^\||\|$/g, '');
  return trimmed.split('|');
}

function isSeparator(cells) {
  return cells.every((c) => /^-+$/.test(c.trim()));
}
