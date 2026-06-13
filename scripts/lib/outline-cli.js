// Wrapper around the `outline` agent skill scripts. We shell out to them
// with --json and parse the response, so we never touch the REST API or
// the token directly. All callers go through `run()` / `runText()`.

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { expandPath, loadConfig } from './config.js';

const config = loadConfig();
const SCRIPTS = expandPath(
  process.env.OUTLINE_SKILL_PATH
  || config.outlineSkillPath
  || '~/.agents/skills/outline-skill/scripts'
);

// The `outline` skill's scripts parse flags as separate argv entries
// (`--collection <id>`), not the modern `--collection=<id>` form. We use the
// modern form everywhere in this skill, so normalize before spawning.
function normalizeArgs(args) {
  const out = [];
  for (const arg of args) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const eq = arg.indexOf('=');
      out.push(arg.slice(0, eq), arg.slice(eq + 1));
    } else {
      out.push(arg);
    }
  }
  return out;
}

/**
 * Run an outline skill script and parse its --json output.
 * Throws on non-zero exit or invalid JSON.
 */
export async function run(script, args = []) {
  const scriptPath = `${SCRIPTS}/${script}`;
  if (!existsSync(scriptPath)) {
    throw new Error(
      `outline skill script not found at ${scriptPath}. ` +
      `Set OUTLINE_SKILL_PATH or config.outlineSkillPath.`
    );
  }
  const stdout = await exec([scriptPath, ...normalizeArgs(args), '--json']);
  try {
    const parsed = JSON.parse(stdout);
    // The `outline` skill's scripts are inconsistent: most serialize the full
    // response (`{ data: ..., policies: ... }`), but `tree.js` serializes only
    // `res.data` (a bare array). Normalize to a uniform `{ data }` shape so
    // callers can always use `res.data`.
    return Array.isArray(parsed) ? { data: parsed } : parsed;
  } catch (e) {
    throw new Error(`${script} did not return valid JSON: ${stdout.slice(0, 200)}`);
  }
}

/**
 * Run a script that doesn't speak --json, return stdout as text.
 */
export async function runText(script, args = []) {
  const scriptPath = `${SCRIPTS}/${script}`;
  if (!existsSync(scriptPath)) {
    throw new Error(
      `outline skill script not found at ${scriptPath}. ` +
      `Set OUTLINE_SKILL_PATH or config.outlineSkillPath.`
    );
  }
  return await exec([scriptPath, ...normalizeArgs(args)]);
}

function exec(cmd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd[0]} exited ${code}: ${err.trim() || out.trim()}`));
    });
  });
}
