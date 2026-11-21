// Run the repository gate in a dedicated process group. An independent
// watchdog tears down that exact group if this parent is SIGKILLed, so a
// Playwright Chromium (including GPU processes) cannot outlive a failed QA.
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const file = fileURLToPath(import.meta.url);
const root = resolve(dirname(file), '..');

function processIsAlive(pid: number): boolean {
  try {
    const state = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8', timeout: 3000 }).trim();
    return state.length > 0 && !state.startsWith('Z');
  } catch { return false; }
}
function groupIsAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}
function stopGroup(pgid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pgid, signal); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

if (process.argv[2] === '--watchdog') {
  const parent = Number(process.argv[3]);
  const group = Number(process.argv[4]);
  if (!Number.isSafeInteger(parent) || !Number.isSafeInteger(group) || parent <= 1 || group <= 1) {
    process.exitCode = 2;
  } else {
    while (processIsAlive(parent)) await sleep(1500);
    if (groupIsAlive(group)) {
      stopGroup(group, 'SIGTERM');
      await sleep(4000);
      if (groupIsAlive(group)) stopGroup(group, 'SIGKILL');
    }
  }
} else {
  const probe = process.argv[2] === '--probe';
  const args = probe ? ['-c', 'sleep 60'] : ['tools/gate.sh'];
  const command = probe ? '/bin/sh' : '/bin/bash';
  const gate = spawn(command, args, {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: 'inherit',
  });
  const group = gate.pid;
  if (!group) throw Error('Could not start the guarded gate');
  const watcher = spawn(process.execPath, [file, '--watchdog', String(process.pid), String(group)], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
  });
  watcher.unref();
  if (probe) console.log(`GUARDED_GATE_PROBE parent=${process.pid} group=${group}`);

  const terminate = () => stopGroup(group, 'SIGTERM');
  process.once('SIGINT', terminate);
  process.once('SIGTERM', terminate);
  const status = await new Promise<number>((done) => {
    gate.once('error', () => done(1));
    gate.once('exit', (code, signal) => done(signal ? 1 : code ?? 1));
  });
  watcher.kill('SIGTERM');
  process.exitCode = status;
}
