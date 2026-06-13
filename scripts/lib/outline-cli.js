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
  const stdout = await exec([scriptPath, ...args, '--json']);
  try {
    return JSON.parse(stdout);
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
  return await exec([scriptPath, ...args]);
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
