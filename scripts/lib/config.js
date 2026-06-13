// Config loader. Looks for config.json next to SKILL.md (in the skill root).
// Falls back to config.example.json if user config is missing, so a fresh
// install works out of the box.

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(__dirname, '..', '..');

const USER_CONFIG = join(SKILL_ROOT, 'config.json');
const EXAMPLE_CONFIG = join(SKILL_ROOT, 'config.example.json');

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  const path = existsSync(USER_CONFIG) ? USER_CONFIG : EXAMPLE_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    // Strip comment-shaped fields from the example file.
    cached = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
  } catch (e) {
    throw new Error(`Failed to read config at ${path}: ${e.message}`);
  }
  return cached;
}

export function expandPath(p) {
  if (!p) return p;
  if (p.startsWith('~')) return homedir() + p.slice(1);
  return p;
}
