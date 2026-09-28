import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readdir, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type Payload = Record<string, unknown>;
const object = (value: unknown): Payload => value && typeof value === 'object' && !Array.isArray(value) ? value as Payload : {};
const optional = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;
const command = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.length || value.length > 128 || value.some((part) => typeof part !== 'string' || !part || part.length > 32_768 || part.includes('\0'))) throw new Error('INVALID_COMMAND');
  return value as string[];
};
const localPath = async (value: unknown): Promise<string> => {
  const candidate = optional(value);
  if (!candidate || !path.isAbsolute(candidate)) throw new Error('NODE_CWD_MUST_BE_ABSOLUTE');
  const canonical = await realpath(candidate);
  if (!(await stat(canonical)).isDirectory()) throw new Error('NODE_CWD_NOT_DIRECTORY');
  return canonical;
};

export async function listNodeDirectories(input: Payload): Promise<Payload> {
  const home = os.homedir();
  const folder = await localPath(input.path ?? home);
  const children = await readdir(folder, { withFileTypes: true });
  const entries = children.filter((entry) => entry.isDirectory()).slice(0, 5000).map((entry) => ({ name: entry.name, path: path.join(folder, entry.name), hidden: entry.name.startsWith('.') }));
  const parent = path.dirname(folder);
  return { path: folder, home, ...(parent !== folder ? { parent } : {}), entries };
}

export async function whichNodeCommands(input: Payload): Promise<Payload> {
  if (!Array.isArray(input.bins) || input.bins.length > 100) throw new Error('INVALID_INPUT');
  const found: Record<string, string> = {};
  const folders = (process.env.PATH || process.env.Path || '').split(path.delimiter);
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const value of input.bins) {
    if (typeof value !== 'string' || !/^[\w.+-]{1,128}$/.test(value)) continue;
    for (const folder of folders) {
      for (const extension of extensions) {
        const candidate = path.join(folder, value + extension);
        try { await access(candidate, constants.X_OK); found[value] = candidate; break; } catch { /* Try the next PATH entry. */ }
      }
      if (found[value]) break;
    }
  }
  return { bins: found };
}

export async function prepareNodeRun(input: Payload): Promise<Payload> {
  const argv = command(input.command);
  const cwd = input.cwd == null ? null : await localPath(input.cwd);
  const rawCommand = optional(input.rawCommand) || argv.join(' ');
  return {
    plan: { argv, cwd, commandText: rawCommand, commandPreview: rawCommand, agentId: optional(input.agentId) || null, sessionKey: optional(input.sessionKey) || null,
      policySnapshot: { security: 'full', ask: 'off', askFallback: 'full', autoAllowSkills: false, allowlistRules: [] } },
    execPolicy: { security: 'full', ask: 'off' },
    allowAlwaysCoverage: { complete: false, patterns: [] },
  };
}

export async function runNodeCommand(input: Payload, signal: AbortSignal): Promise<Payload> {
  const argv = command(input.command);
  const cwd = input.cwd == null ? undefined : await localPath(input.cwd);
  const plan = input.systemRunPlan === undefined ? null : object(input.systemRunPlan);
  if (plan && (!Array.isArray(plan.argv) || JSON.stringify(plan.argv) !== JSON.stringify(argv)
    || (optional(plan.cwd) || null) !== (cwd || null)
    || optional(plan.commandText) !== (optional(input.rawCommand) || argv.join(' '))
    || (optional(plan.agentId) || null) !== (optional(input.agentId) || null)
    || (optional(plan.sessionKey) || null) !== (optional(input.sessionKey) || null))) throw new Error('NODE_APPROVAL_PLAN_MISMATCH');
  if (input.env && Object.keys(object(input.env)).length) throw new Error('NODE_CUSTOM_ENV_UNAVAILABLE');
  const timeoutMs = typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) ? Math.min(300_000, Math.max(1000, input.timeoutMs)) : 120_000;
  return new Promise<Payload>((resolve) => {
    let stdout = ''; let stderr = ''; let truncated = false; let timedOut = false; let settled = false;
    const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const append = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString('utf8');
      if (next.length > 200_000) { truncated = true; return next.slice(0, 200_000); }
      return next;
    };
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const finish = (exitCode: number | null, error?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
      resolve({ exitCode: exitCode ?? 1, timedOut, success: exitCode === 0 && !timedOut && !signal.aborted, stdout, stderr, error: error || null, truncated });
    };
    const cancel = () => child.kill();
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    child.on('error', (error) => finish(1, error.message));
    child.on('close', (code) => finish(code));
  });
}
