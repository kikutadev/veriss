// Run a gate in its own process group. On runner SIGKILL, an independent
// watchdog stops that group AND separately detached Chromium browser groups.
// Chrome parent PIDs are only recorded if their ancestry leads to this gate.
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const file = fileURLToPath(import.meta.url);
const root = resolve(dirname(file), '..');

interface ProcessInfo {
  pid: number;
  ppid: number;
  pgid: number;
  command: string;
}
function processTable(): Map<number, ProcessInfo> {
  const result = new Map<number, ProcessInfo>();
  try {
    const output = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,command='], {
      encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of output.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (!match) continue;
      const pid = Number(match[1]);
      result.set(pid, {
        pid, ppid: Number(match[2]), pgid: Number(match[3]), command: match[4] ?? '',
      });
    }
  } catch {
    // A failed snapshot cannot justify terminating an unidentified process.
  }
  return result;
}

function processIsAlive(pid: number): boolean {
  try {
    const state = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], {
      encoding: 'utf8', timeout: 3000,
    }).trim();
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

function isAutomationChrome(p: ProcessInfo): boolean {
  return /(?:\/chrome-headless-shell|\/Google Chrome for Testing)/.test(p.command) &&
    p.command.includes('--remote-debugging-pipe') &&
    p.command.includes('--user-data-dir=') &&
    !p.command.includes('--type=');
}

function belongsToGate(p: ProcessInfo, gateGroup: number, table: Map<number, ProcessInfo>): boolean {
  let current: ProcessInfo | undefined = p;
  for (let depth = 0; current && depth < 64; depth++) {
    if (current.pgid === gateGroup) return true;
    current = table.get(current.ppid);
  }
  return false;
}

function ownedChromePids(gateGroup: number, table: Map<number, ProcessInfo>): number[] {
  return [...table.values()]
    .filter(p => isAutomationChrome(p) && belongsToGate(p, gateGroup, table))
    .map(p => p.pid);
}

function stopChrome(pid: number, table: Map<number, ProcessInfo>, signal: NodeJS.Signals): void {
  const p = table.get(pid);
  // Validate the exact recorded PID before each signal; never kill by name.
  if (!p || !isAutomationChrome(p)) return;
  try {
    if (p.pgid === p.pid) stopGroup(p.pgid, signal);
    else process.kill(p.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

if (process.argv[2] === '--watchdog') {
  const parent = Number(process.argv[3]);
  const group = Number(process.argv[4]);
  if (!Number.isSafeInteger(parent) || !Number.isSafeInteger(group) || parent <= 1 || group <= 1) {
    process.exitCode = 2;
  } else {
    const chromePids = new Set<number>();
    while (processIsAlive(parent)) {
      const table = processTable();
      for (const pid of ownedChromePids(group, table)) chromePids.add(pid);
      await sleep(1250);
    }
    const table = processTable();
    for (const pid of ownedChromePids(group, table)) chromePids.add(pid);
    // First release the gate and then any independently detached Chrome.
    if (groupIsAlive(group)) stopGroup(group, 'SIGTERM');
    for (const pid of chromePids) stopChrome(pid, processTable(), 'SIGTERM');
    await sleep(3500);
    const remaining = processTable();
    for (const pid of chromePids) stopChrome(pid, remaining, 'SIGKILL');
    if (groupIsAlive(group)) stopGroup(group, 'SIGKILL');
  }
} else {
  const probe = process.argv[2] === '--probe';
  const browserProbe = process.argv[2] === '--probe-browser';
  const browserScript = `
    import { chromium } from '@playwright/test';
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent('<div id="ready">browser probe</div>');
    console.log('GUARDED_BROWSER_READY', process.pid);
    setInterval(() => browser.isConnected(), 1000);
  `;
  const transitionE2E = process.argv[2] === '--transition-e2e';
  const urlE2E = process.argv[2] === '--url-e2e';
  const command = (transitionE2E || urlE2E) ? 'pnpm' : browserProbe ? process.execPath : probe ? '/bin/sh' : '/bin/bash';
  const args = urlE2E ? ['exec','playwright','test','-c','playwright.layout.config.mjs','--trace','off','e2e/layout-url-first-site.spec.mjs','--reporter=line']
    : transitionE2E
    ? ['exec','playwright','test','-c','playwright.layout.config.mjs','--trace','off',
       'e2e/layout-partial-geometry.spec.mjs','-g',
       'conditional convex|font-independent form|shared progress can|closed CSS width',
       '--reporter=line']
    : browserProbe ? ['--input-type=module', '-e', browserScript]
    : probe ? ['-c', 'sleep 60'] : ['tools/gate.sh'];
  const gate = spawn(command, args, {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: 'inherit',
  });
  const group = gate.pid;
  if (!group) throw Error('Could not start the guarded gate');
  const watcher = spawn(process.execPath, [file, '--watchdog', String(process.pid), String(group)], {
    cwd: root, detached: true, stdio: 'ignore',
  });
  watcher.unref();
  if (probe || browserProbe) console.log(`GUARDED_GATE_PROBE parent=${process.pid} group=${group}`);

  const terminate = () => {
    const table = processTable();
    for (const pid of ownedChromePids(group, table)) stopChrome(pid, table, 'SIGTERM');
    stopGroup(group, 'SIGTERM');
    setTimeout(() => { if (groupIsAlive(group)) stopGroup(group, 'SIGKILL'); }, 4000).unref();
  };
  process.once('SIGINT', terminate);
  process.once('SIGTERM', terminate);
  const status = await new Promise<number>((done) => {
    gate.once('error', () => done(1));
    gate.once('exit', (code, signal) => done(signal ? 1 : code ?? 1));
  });
  watcher.kill('SIGTERM');
  process.exitCode = status;
}
