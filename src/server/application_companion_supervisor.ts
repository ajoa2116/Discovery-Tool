import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const APPLICATION_COMPANION_PATH = fileURLToPath(new URL('../../native/ApplicationCompanion/bin/Release/net10.0-windows/ApplicationCompanion.exe', import.meta.url));
export type CompanionFixtureMode = 'normal' | 'exit' | 'disconnect' | 'timeout' | 'wrong-peer' | 'assignment-failure' |
  'bad-nonce' | 'bad-generation' | 'bad-navigation-id' | 'extra-field' | 'malformed-message' | 'oversized-message' | 'replay' |
  'challenge-timeout' | 'late-response' | 'early-message' | 'unapproved-navigation' | 'redirect' | 'same-url-redirect' |
  'popup' | 'frame' | 'post-ready-navigation' | 'reload' | 'fragment' | 'renderer-loss';
export type CompanionLoss = 'closed' | 'cancelled' | 'failed';
export interface CompanionLifetime {
  readonly pid: number;
  readonly brokerPid: number;
  /** Resolves immediately on terminal loss; callers need not wait for cleanup. */
  readonly lost: Promise<CompanionLoss>;
  /** True only when broker close was actually observed. */
  readonly closed: Promise<boolean>;
  /** Allowlisted nonsecret fixture diagnostic; undefined for unclassified loss. */
  readonly failureCode: Promise<string | undefined>;
  shutdown(): Promise<void>;
}
const failure = (code?: string) => Object.assign(new Error('Application companion unavailable.'), { code });
const modes: readonly string[] = ['normal', 'exit', 'disconnect', 'timeout', 'wrong-peer', 'assignment-failure',
  'bad-nonce', 'bad-generation', 'bad-navigation-id', 'extra-field', 'malformed-message', 'oversized-message', 'replay',
  'challenge-timeout', 'late-response', 'early-message', 'unapproved-navigation', 'redirect', 'same-url-redirect',
  'popup', 'frame', 'post-ready-navigation', 'reload', 'fragment', 'renderer-loss'];
const failureCodes = new Set(['READINESS_TIMEOUT', 'CHANNEL_LOST', 'POPUP_REJECTED', 'FRAME_REJECTED', 'RESOURCE_REJECTED',
  'RENDERER_LOST', 'NAVIGATION_REJECTED', 'MESSAGE_REJECTED', 'RUNTIME_UNAVAILABLE']);

/** Isolated native fixture, with no authority, HTTP, UI composition or camera integration. */
export function startApplicationCompanion(options: { signal?: AbortSignal; mode?: CompanionFixtureMode } = {}): Promise<CompanionLifetime> {
  const mode = options.mode ?? 'normal';
  if (process.platform !== 'win32' || options.signal?.aborted || !modes.includes(mode)) return Promise.reject(failure());
  return new Promise((resolve, reject) => {
    const environment = Object.fromEntries(['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'ProgramFiles'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
    const child = spawn(APPLICATION_COMPANION_PATH, ['--broker', mode], { shell: false, windowsHide: true, env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
    let terminal = false, ready = false, observedClose = false, closedSettled = false, pending = '', lastPulse = Date.now();
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let finishLoss!: (reason: CompanionLoss) => void, finishClosed!: (confirmed: boolean) => void, finishCode!: (code?: string) => void;
    const lost = new Promise<CompanionLoss>(done => { finishLoss = done; });
    const closed = new Promise<boolean>(done => { finishClosed = done; });
    const failureCode = new Promise<string | undefined>(done => { finishCode = done; });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const startup = setTimeout(() => end('failed'), 16000);
    const heartbeat = setInterval(() => { if (ready && Date.now() - lastPulse > 4500) end('failed'); }, 500);
    const settleClosed = (confirmed: boolean) => {
      if (closedSettled) return; closedSettled = true;
      clearTimeout(cleanupTimer); finishClosed(confirmed);
    };
    const end = (reason: CompanionLoss, code?: string) => {
      if (terminal) return; terminal = true;
      clearTimeout(startup); clearInterval(heartbeat);
      options.signal?.removeEventListener('abort', abort);
      finishLoss(reason);
      finishCode(code);
      if (!ready) reject(failure(code));
      if (observedClose) { settleClosed(true); return; }
      if (reason === 'closed') {
        try { child.stdin.end('{"v":1,"type":"STOP"}\n'); } catch { /* Escalate below. */ }
      } else {
        child.stdin.destroy(); try { child.kill(); } catch { /* Cleanup remains bounded. */ }
      }
      cleanupTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* Never equate kill request with observed exit. */ }
        cleanupTimer = setTimeout(() => {
          child.stdout.destroy(); child.stderr.destroy(); child.unref(); settleClosed(false);
        }, 1500);
      }, 2500);
    };
    const abort = () => end('cancelled');
    const line = (frame: string) => {
      if (terminal) return;
      const failed = /^\{"v":1,"type":"FAILED","code":"([A-Z_]+)"\}$/.exec(frame);
      if (failed) { if (!failureCodes.has(failed[1])) throw failure(); end('failed', failed[1]); return; }
      if (!ready) {
        // Exact fixture grammar also rejects duplicate keys and extra properties.
        const match = /^\{"v":1,"type":"READY","pid":([1-9][0-9]{0,9})\}$/.exec(frame);
        if (!match || !Number.isSafeInteger(Number(match[1])) || !child.pid) throw failure();
        ready = true; lastPulse = Date.now(); clearTimeout(startup);
        resolve(Object.freeze({ pid: Number(match[1]), brokerPid: child.pid, lost, closed, failureCode,
          async shutdown() { end('closed'); if (!await closed) throw failure(); } }));
      } else {
        if (frame !== '{"v":1,"type":"ALIVE"}') throw failure();
        lastPulse = Date.now();
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      if (terminal) return;
      try {
        if (chunk.length > 4096) throw failure();
        pending += decoder.decode(chunk, { stream: true });
        let newline: number;
        while ((newline = pending.indexOf('\n')) !== -1) {
          const frame = pending.slice(0, newline); pending = pending.slice(newline + 1);
          if (frame.length > 256) throw failure(); line(frame);
        }
        if (pending.length > 256) throw failure();
      } catch { end('failed'); }
    });
    child.on('error', () => end('failed'));
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', () => end('failed'));
    child.stderr.on('data', (chunk: Buffer) => { if (chunk.length) end('failed'); });
    child.on('close', () => {
      observedClose = true;
      // Any unexpected exit, including code zero, is companion loss.
      end('failed'); settleClosed(true);
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    if (!terminal) child.stdin.write('{"v":1,"type":"START"}\n');
  });
}
