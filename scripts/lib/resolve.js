// Resolvers for collection / project / issue ids. Always queries the
// tracker at runtime — never caches ids, never accepts them as input.

import { run, runText } from './outline-cli.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const COLLECTION_NAME = config.collectionName || 'Issues';

/**
 * Find the collection id by name. Returns the id or throws.
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
 * Find a project document (the second-level page under the collection)
 * by name. Returns the document id or throws.
 */
export async function findProjectId(collectionId, projectName) {
  const res = await run('tree.js', [`--collection=${collectionId}`]);
  const nodes = res.data || [];
  // Tree is hierarchical; the project doc is a direct child of the collection
  // root, so we look at top-level nodes for the title match.
  const project = nodes.find((n) => n.title === projectName);
  if (!project) {
    const known = nodes.map((n) => n.title).join(', ');
    throw new Error(`Project "${projectName}" not found in collection. Known top-level pages: ${known || '(none)'}`);
  }
  return project.id;
}

/**
 * Find an issue document by short path, e.g. "13", "2.A", "2.A.1".
 * Resolves top-level (project → ISS-N) via `tree.js`, then any sub-levels
 * via `list.js --parent=<id>`. Returns the full document or null.
 */
export async function findIssueByPath(projectId, collectionId, path) {
  const parts = String(path).split('.').filter(Boolean);
  if (parts.length === 0) return null;

  // First segment lives one level under the project doc — use tree.js.
  const tree = await run('tree.js', [`--collection=${collectionId}`]);
  const project = (tree.data || []).find((n) => n.id === projectId);
  if (!project) throw new Error(`Project doc ${projectId} disappeared mid-flight`);
  let current = (project.children || []).find((c) => c.title.startsWith(`ISS-${parts[0]}:`));
  if (!current) return null;

  // Subsequent segments live deeper — use list.js for each step.
  for (let i = 1; i < parts.length; i++) {
    if (!current) return null;
    const list = await run('list.js', [`--parent=${current.id}`]);
    const docs = list.data || [];
    // `prefix` already ends with ':' — only prepend `ISS-`.
    const prefix = parts.slice(0, i + 1).join('.') + ':';
    current = docs.find((c) => c.title.startsWith(`ISS-${prefix}`));
  }
  return current || null;
}

/**
 * Backwards-compatible shortcut: resolve an issue by its top-level number.
 * Callers that already have a `collectionId` should call `findIssueByPath`
 * directly to avoid the extra collection-walk.
 */
export async function findIssueByShortId(projectId, n) {
  const collectionId = await collectionIdFromProject(projectId);
  return findIssueByPath(projectId, collectionId, String(n));
}

/**
 * Read the full content of a document (used by table-parser / log-progress).
 */
export async function readDocument(docId) {
  const res = await run('read.js', [`--id=${docId}`]);
  return res.data;
}

/**
 * Find the next free ISS-<n> for a project. Inspects existing children and
 * returns max(n) + 1, or 1 if the project is empty.
 */
export async function nextIssueNumber(projectId) {
  const collectionId = await collectionIdFromProject(projectId);
  const tree = await run('tree.js', [`--collection=${collectionId}`]);
  const project = (tree.data || []).find((n) => n.id === projectId);
  if (!project) throw new Error(`Project doc ${projectId} not found in collection tree`);
  const children = project.children || [];
  let max = 0;
  for (const child of children) {
    const m = child.title.match(/^ISS-(\d+):/);
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
  // Find which collection contains this project by walking all collections.
  // In practice the project lives under one collection; cache after first hit.
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
