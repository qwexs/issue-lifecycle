// Resolvers for spec / project / issue ids. Always queries the tracker at
// runtime — never caches ids across calls, never accepts them as input.
//
// Two modes are supported:
//
//   1. --project <name>     Legacy "collection → project → ISS-<n>" mode.
//                           Project doc is a child of a collection; we walk
//                           `tree.js --collection=<id>` to find it.
//
//   2. --spec <docId>       Spec-rooted mode. Parent is an arbitrary Outline
//                           document (typically a SPEC / Architecture page in
//                           any collection). We read the spec by id, then
//                           list its direct children via `list.js --parent=<id>`
//                           to find issues. No collection-walk needed.
//
// `resolveContext(args)` is the single entry point used by every script:
// it inspects the args, validates that exactly one of `--project` or `--spec`
// is present, and returns a context object with mode-specific helpers.

import { run } from './outline-cli.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const COLLECTION_NAME = config.collectionName || 'Issues';

/**
 * Find a collection id by name. Returns the id or throws.
 */
export async function findCollectionId(name = COLLECTION_NAME) {
  const res = await run('list-collections.js');
  const collections = res.data || [];
  const match = collections.find((c) => c.name === name);
  if (!match) {
    const known = collections.map((c) => c.name).join(', ');
    throw new Error(`Collection "${name}" not found. Known: ${known || '(none)'}`);
  }
  return match.id;
}

/**
 * Find a project document (the second-level page under the collection) by
 * name. Returns the document id or throws. Used only in legacy project mode.
 */
export async function findProjectId(collectionId, projectName) {
  const res = await run('tree.js', [`--collection=${collectionId}`]);
  const nodes = res.data || [];
  const project = nodes.find((n) => n.title === projectName);
  if (!project) {
    const known = nodes.map((n) => n.title).join(', ');
    throw new Error(`Project "${projectName}" not found in collection. Known top-level pages: ${known || '(none)'}`);
  }
  return project.id;
}

/**
 * Find an issue document by short path (e.g. "13", "2.A", "2.A.1") in legacy
 * project mode. Top-level lives under the project doc — use `tree.js` once,
 * then `list.js --parent=<id>` recursively for sub-levels.
 */
export async function findIssueByPath(projectId, collectionId, path) {
  const parts = String(path).split('.').filter(Boolean);
  if (parts.length === 0) return null;

  const tree = await run('tree.js', [`--collection=${collectionId}`]);
  const project = (tree.data || []).find((n) => n.id === projectId);
  if (!project) throw new Error(`Project doc ${projectId} disappeared mid-flight`);
  let current = (project.children || []).find((c) => c.title.startsWith(`ISS-${parts[0]}:`));
  if (!current) return null;

  for (let i = 1; i < parts.length; i++) {
    if (!current) return null;
    const list = await run('list.js', [`--parent=${current.id}`]);
    const docs = list.data || [];
    const prefix = parts.slice(0, i + 1).join('.') + ':';
    current = docs.find((c) => c.title.startsWith(`ISS-${prefix}`));
  }
  return current || null;
}

/**
 * Read the full content of a document (used by table-parser / log-progress).
 */
export async function readDocument(docId) {
  const res = await run('read.js', [`--id=${docId}`]);
  return res.data;
}

/**
 * Find the next free ISS-<n> for a project (legacy mode). Inspects existing
 * children and returns max(n) + 1, or 1 if the project is empty.
 */
export async function nextIssueNumber(projectId) {
  const collectionId = await collectionIdFromProject(projectId);
  const tree = await run('tree.js', [`--collection=${collectionId}`]);
  const project = (tree.data || []).find((n) => n.id === projectId);
  if (!project) throw new Error(`Project doc ${projectId} not found in collection tree`);
  return maxIssueNumberFromDocs(project.children || []);
}

/**
 * Spec-mode equivalent of `nextIssueNumber`. Walks `list.js --parent=<specId>`
 * and returns max(ISS-<n>) + 1.
 */
export async function nextIssueNumberSpec(specId) {
  const list = await run('list.js', [`--parent=${specId}`]);
  return maxIssueNumberFromDocs(list.data || []);
}

/**
 * Spec-mode equivalent of `findIssueByPath`. Resolves the top-level issue
 * under the spec doc, then recurses into children for sub-path segments.
 */
export async function findIssueBySpecParent(specId, path) {
  const parts = String(path).split('.').filter(Boolean);
  if (parts.length === 0) return null;

  const list = await run('list.js', [`--parent=${specId}`]);
  let current = (list.data || []).find((c) => c.title.startsWith(`ISS-${parts[0]}:`));
  if (!current) return null;

  for (let i = 1; i < parts.length; i++) {
    if (!current) return null;
    const subList = await run('list.js', [`--parent=${current.id}`]);
    const docs = subList.data || [];
    const prefix = parts.slice(0, i + 1).join('.') + ':';
    current = docs.find((c) => c.title.startsWith(`ISS-${prefix}`));
  }
  return current || null;
}

/**
 * Validate that a spec document exists and is readable. Returns its full
 * record (id, title, url). Used by `resolveContext` for --spec mode.
 */
export async function readSpec(specId) {
  const doc = await readDocument(specId);
  if (!doc || !doc.id) {
    throw new Error(`Spec document "${specId}" not found or unreadable.`);
  }
  return doc;
}

// --- internal helpers ---

function maxIssueNumberFromDocs(docs) {
  let max = 0;
  for (const d of docs) {
    const m = (d.title || '').match(/^ISS-(\d+):/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

// Internal: cache the collection id of a project, to avoid a second tree walk.
let collectionCache = null;
async function collectionIdFromProject(projectId) {
  if (collectionCache) return collectionCache;
  const res = await run('list-collections.js');
  for (const c of res.data || []) {
    const tree = await run('tree.js', [`--collection=${c.id}`]);
    if ((tree.data || []).some((n) => n.id === projectId)) {
      collectionCache = c.id;
      return c.id;
    }
  }
  throw new Error(`Project ${projectId} not found in any collection`);
}

// Internal: lightweight arg parser used by resolveContext.
function getArg(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

/**
 * Single entry point used by every script.
 *
 * Accepts:
 *   args.spec       — spec docId (spec mode)
 *   args.project    — project name (legacy mode)
 *   args.collection — collection name override (legacy mode)
 *
 * Returns a context object:
 *   { mode: 'spec',   specId, specTitle, specUrl,
 *     findIssue(path), nextNumber() }
 *   { mode: 'project', collectionId, projectId, projectName,
 *     findIssue(path), nextNumber() }
 *
 * Throws if both or neither are provided.
 */
export async function resolveContext({ spec, project, collection } = {}) {
  if (spec && project) {
    throw new Error('Use either --spec or --project, not both.');
  }
  if (spec) {
    const doc = await readSpec(spec);
    return {
      mode: 'spec',
      specId: doc.id,
      specTitle: doc.title,
      specUrl: doc.url,
      findIssue: (path) => findIssueBySpecParent(doc.id, path),
      nextNumber: () => nextIssueNumberSpec(doc.id),
    };
  }
  if (project) {
    const collectionId = await findCollectionId(collection || undefined);
    const projectId = await findProjectId(collectionId, project);
    return {
      mode: 'project',
      collectionId,
      projectId,
      projectName: project,
      findIssue: (path) => findIssueByPath(projectId, collectionId, path),
      nextNumber: () => nextIssueNumber(projectId),
    };
  }
  throw new Error('Either --spec <docId> or --project <name> is required.');
}
