import { performance } from 'node:perf_hooks';
import { CompanionDeadline } from './companion_deadline.ts';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BootstrapAckDecoder, type ExpectedBootstrapAcknowledgment } from './bootstrap_ack_decoder.ts';

export const APPLICATION_COMPANION_PATH = fileURLToPath(new URL('../../native/ApplicationCompanion/bin/Release/net10.0-windows/ApplicationCompanion.exe', import.meta.url));
export type CompanionFixtureMode = 'normal' | 'exit' | 'disconnect' | 'timeout' | 'wrong-peer' | 'assignment-failure' |
  'bad-nonce' | 'bad-generation' | 'bad-navigation-id' | 'extra-field' | 'malformed-message' | 'oversized-message' | 'replay' |
  'challenge-timeout' | 'late-response' | 'early-message' | 'unapproved-navigation' | 'redirect' | 'same-url-redirect' |
  'popup' | 'frame' | 'post-ready-navigation' | 'reload' | 'fragment' | 'renderer-loss' |
  'delivery-wrong-ack' | 'delivery-duplicate-ack' | 'delivery-timeout' | 'delivery-navigation' |
  'delivery-stale-generation' | 'delivery-exit' | 'delivery-partial-done' | 'delivery-replay' | 'activation-navigation' | 'redeemed-navigation' | 'session-wrong-ack' | 'session-late-ack' | 'session-wrong-expiry' | 'session-lost-activation' | 'session-duplicate-ack' | 'session-timeout' | 'session-navigation' | 'session-stale-generation' | 'session-exit' | 'session-partial-done' | 'session-lost-done' | 'session-replay' | 'session-activation-loss' | 'session-active-navigation' | 'session-renderer-loss' | 'session-channel-loss' | 'session-heartbeat-stall';
export type CompanionLoss = 'closed' | 'cancelled' | 'failed';
export interface CompanionLifetime {
  readonly pid: number;
  readonly brokerPid: number;
  readonly generation: number;
  readonly alive: boolean;
  /** Resolves immediately on terminal loss; callers need not wait for cleanup. */
  readonly lost: Promise<CompanionLoss>;
  /** True only when broker close was actually observed. */
  readonly closed: Promise<boolean>;
  /** Allowlisted nonsecret fixture diagnostic; undefined for unclassified loss. */
  readonly failureCode: Promise<string | undefined>;
  deliverBootstrap(input: string, expected: ExpectedBootstrapAcknowledgment, signal?: AbortSignal): Promise<void>;
  activateBootstrap(id: string): Promise<void>;
  requestBootstrapRedemption(id: string): Promise<string>;
  deliverSession(token: string, receipt: { id: string; expiresAt: number }, signal?: AbortSignal): Promise<void>;
  activateSession(signal?: AbortSignal): Promise<void>;
  logoutSession(signal?: AbortSignal): Promise<void>;
  shutdown(): Promise<void>;
}
const failure = (code?: string) => Object.assign(new Error('Application companion unavailable.'), { code });
const modes: readonly string[] = ['normal', 'exit', 'disconnect', 'timeout', 'wrong-peer', 'assignment-failure',
  'bad-nonce', 'bad-generation', 'bad-navigation-id', 'extra-field', 'malformed-message', 'oversized-message', 'replay',
  'challenge-timeout', 'late-response', 'early-message', 'unapproved-navigation', 'redirect', 'same-url-redirect',
  'popup', 'frame', 'post-ready-navigation', 'reload', 'fragment', 'renderer-loss',
  'delivery-wrong-ack', 'delivery-duplicate-ack', 'delivery-timeout', 'delivery-navigation',
  'delivery-stale-generation', 'delivery-exit', 'delivery-partial-done', 'delivery-replay', 'activation-navigation', 'redeemed-navigation', 'session-wrong-ack', 'session-late-ack', 'session-wrong-expiry', 'session-lost-activation', 'session-duplicate-ack', 'session-timeout', 'session-navigation', 'session-stale-generation', 'session-exit', 'session-partial-done', 'session-lost-done', 'session-replay', 'session-activation-loss', 'session-active-navigation', 'session-renderer-loss', 'session-channel-loss', 'session-heartbeat-stall'];
const failureCodes = new Set(['READINESS_TIMEOUT', 'CHANNEL_LOST', 'POPUP_REJECTED', 'FRAME_REJECTED', 'RESOURCE_REJECTED',
  'RENDERER_LOST', 'NAVIGATION_REJECTED', 'MESSAGE_REJECTED', 'RUNTIME_UNAVAILABLE', 'BOOTSTRAP_REJECTED', 'SESSION_REJECTED', 'SESSION_EXPIRED',
  'JOB_PROCESS_EXITED', 'JOB_QUERY_FAILED', 'JOB_ATTACH_DENIED', 'JOB_ATTACH_FAILED', 'JOB_BROWSER_MISSING']);

/** Isolated native fixture, with no authority, HTTP, UI composition or camera integration. */
export function startApplicationCompanion(options: { signal?: AbortSignal; mode?: CompanionFixtureMode; elapsedClock?: () => number } = {}): Promise<CompanionLifetime> {
  const mode = options.mode ?? 'normal';
  if (process.platform !== 'win32' || options.signal?.aborted || !modes.includes(mode)) return Promise.reject(failure());
  let lastElapsed = -Infinity;
  const elapsedNow = () => {
    const now = (options.elapsedClock ?? (() => performance.now()))();
    if (!Number.isFinite(now) || now < lastElapsed) throw failure(); lastElapsed = now; return now;
  };
  let pulseDeadline: CompanionDeadline, startupDeadline: CompanionDeadline;
  try { pulseDeadline = new CompanionDeadline(4500, elapsedNow); startupDeadline = new CompanionDeadline(16000, elapsedNow); }
  catch { return Promise.reject(failure()); }
  return new Promise((resolve, reject) => {
    const environment = Object.fromEntries(['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'ProgramFiles'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
    const child = spawn(APPLICATION_COMPANION_PATH, ['--broker', mode], { shell: false, windowsHide: true, env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
    let terminal = false, ready = false, observedClose = false, closedSettled = false, pending = '';
    let generation = 0, offered = false, delivered = false, activationRequested = false, activated = false, redemptionRequested = false;
    let deliveryId = '';
    let session: { id: string; nonce: string; digest: string; expiresAt: number; generation: number } | undefined;
    let sessionOffered = false, sessionDelivered = false, sessionActivationRequested = false, sessionActivated = false, sessionLogoutRequested = false;
    let operation: { kind: 'delivery' | 'activate' | 'redeem' | 'session-delivery' | 'session-activate' | 'session-logout'; id: string; ack?: BootstrapAckDecoder; resolve: (token?: string) => void; reject: () => void; cleanup: () => void; deadline: CompanionDeadline } | undefined;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let finishLoss!: (reason: CompanionLoss) => void, finishClosed!: (confirmed: boolean) => void, finishCode!: (code?: string) => void;
    const lost = new Promise<CompanionLoss>(done => { finishLoss = done; });
    const closed = new Promise<boolean>(done => { finishClosed = done; });
    const failureCode = new Promise<string | undefined>(done => { finishCode = done; });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const startup = setTimeout(() => end('failed'), 16000);
    const checkHeartbeat = () => { try { if (ready && !operation && pulseDeadline.remaining() <= 0) end('failed'); } catch { end('failed'); } };
    const heartbeat = setInterval(checkHeartbeat, 500);
    const request = (kind: 'delivery' | 'activate' | 'redeem' | 'session-delivery' | 'session-activate' | 'session-logout', id: string, input: object, ack?: BootstrapAckDecoder, signal?: AbortSignal): Promise<string | undefined> => {
      if (!ready || terminal || operation || signal?.aborted) { end('failed'); return Promise.reject(failure()); }
      return new Promise((done, denied) => {
        let deadline: CompanionDeadline;
        try { deadline = new CompanionDeadline(8000, elapsedNow); } catch { end('failed'); denied(failure()); return; }
        const cancelled = () => end('cancelled');
        const timeout = setTimeout(() => end('failed'), 8000);
        const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', cancelled); };
        operation = { kind, id, ack, resolve: done, reject: () => denied(failure()), cleanup, deadline };
        signal?.addEventListener('abort', cancelled, { once: true });
        if (signal?.aborted) { cancelled(); return; }
        child.stdin.write(JSON.stringify(input) + '\n');
      });
    };
    const settleClosed = (confirmed: boolean) => {
      if (closedSettled) return; closedSettled = true;
      clearTimeout(cleanupTimer); finishClosed(confirmed);
    };
    const end = (reason: CompanionLoss, code?: string) => {
      if (terminal) return; terminal = true; pending = ''; session = undefined;
      clearTimeout(startup); clearInterval(heartbeat);
      options.signal?.removeEventListener('abort', abort);
      finishLoss(reason);
      finishCode(code);
      if (operation) { const active = operation; operation = undefined; active.cleanup(); active.reject(); }
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
        const match = /^\{"v":1,"type":"READY","pid":([1-9][0-9]{0,9}),"generation":([1-9][0-9]{0,8})\}$/.exec(frame);
        if (!match || !Number.isSafeInteger(Number(match[1])) || !child.pid) throw failure();
        if (startupDeadline.remaining() <= 0) throw failure();
        const nextPulseDeadline = new CompanionDeadline(4500, elapsedNow);
        generation = Number(match[2]); ready = true; pulseDeadline = nextPulseDeadline; clearTimeout(startup);
        resolve(Object.freeze({ pid: Number(match[1]), brokerPid: child.pid, generation, get alive() { checkHeartbeat(); return !terminal; }, lost, closed, failureCode,
          async deliverBootstrap(input: string, expected: ExpectedBootstrapAcknowledgment, signal?: AbortSignal) {
            if (offered) { end('failed'); throw failure(); } offered = true;
            deliveryId = expected.id;
            try {
              if (input.length > 1024) throw failure(); const offer = JSON.parse(input);
              await request('delivery', expected.id, { ...offer, generation }, new BootstrapAckDecoder(expected), signal);
              if (terminal || signal?.aborted) throw failure();
            } catch { end('failed'); throw failure(); }
          },
          async activateBootstrap(id: string) {
            if (!delivered || activationRequested || id !== deliveryId) { end('failed'); throw failure(); } activationRequested = true;
            await request('activate', id, { v: 1, type: 'ACTIVATE', id, generation }); if (terminal) throw failure(); activated = true;
          },
          async requestBootstrapRedemption(id: string) {
            if (!activated || redemptionRequested || id !== deliveryId) { end('failed'); throw failure(); } redemptionRequested = true;
            const token = await request('redeem', id, { v: 1, type: 'REDEEM', id, generation }); if (terminal || !token) throw failure(); return token;
          },
          async deliverSession(token: string, receipt: { id: string; expiresAt: number }, signal?: AbortSignal) {
            if (!redemptionRequested || sessionOffered) { end('failed'); throw failure(); } sessionOffered = true;
            if (typeof token !== 'string' || !/^session_[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9-]{36}$/.test(receipt.id) ||
                !Number.isSafeInteger(receipt.expiresAt) || receipt.expiresAt <= Date.now() || receipt.expiresAt > Date.now() + 900000) { end('failed'); throw failure(); }
            session = { ...receipt, generation, nonce: randomBytes(32).toString('hex'), digest: createHash('sha256').update(token).digest('hex') };
            const { digest: _digest, ...offer } = session;
            await request('session-delivery', receipt.id, { v: 1, type: 'SESSION_OFFER', token, ...offer }, undefined, signal);
            if (terminal || signal?.aborted) throw failure(); sessionDelivered = true;
          },
          async activateSession(signal?: AbortSignal) {
            if (!session || !sessionDelivered || sessionActivationRequested) { end('failed'); throw failure(); } sessionActivationRequested = true;
            const { digest: _digest, ...command } = session;
            await request('session-activate', session.id, { v: 1, type: 'SESSION_ACTIVATE', ...command }, undefined, signal);
            if (terminal || signal?.aborted) throw failure(); sessionActivated = true;
          },
          async logoutSession(signal?: AbortSignal) {
            if (!session || !sessionActivated || sessionLogoutRequested) { end('failed'); throw failure(); } sessionLogoutRequested = true;
            const { digest: _digest, ...command } = session;
            await request('session-logout', session.id, { v: 1, type: 'SESSION_LOGOUT', ...command }, undefined, signal);
            if (terminal || signal?.aborted) throw failure(); sessionActivated = false; end('closed');
          },
          async shutdown() { end('closed'); if (!await closed) throw failure(); } }));
      } else {
        if (frame === '{"v":1,"type":"ALIVE"}') { if (!operation && pulseDeadline.remaining() <= 0) throw failure(); pulseDeadline = new CompanionDeadline(4500, elapsedNow); return; }
        const active = operation; if (!active || active.deadline.remaining() <= 0) throw failure();
        let token: string | undefined;
        if (active.kind.startsWith('session-')) {
          const match = /^\{"v":1,"type":"(SESSION_DELIVERED|SESSION_ACTIVATED|SESSION_LOGGED_OUT)","id":"([a-f0-9-]{36})","nonce":"([a-f0-9]{64})","digest":"([a-f0-9]{64})","expiresAt":([0-9]{1,16}),"generation":([1-9][0-9]{0,8})\}$/.exec(frame);
          const type = active.kind === 'session-delivery' ? 'SESSION_DELIVERED' : active.kind === 'session-activate' ? 'SESSION_ACTIVATED' : 'SESSION_LOGGED_OUT';
          if (!session || !match || match[1] !== type || match[2] !== session.id || match[3] !== session.nonce || match[4] !== session.digest || Number(match[5]) !== session.expiresAt || Number(match[6]) !== generation || Date.now() >= session.expiresAt) throw failure();
        }
        else if (active.kind === 'delivery') { active.ack!.push(Buffer.from(frame + '\n')); active.ack!.finish(); delivered = true; }
        else if (active.kind === 'activate') {
          const result = /^\{"v":1,"type":"ACTIVATED","id":"([a-f0-9-]{36})","generation":([1-9][0-9]{0,8})\}$/.exec(frame);
          if (!result || result[1] !== active.id || Number(result[2]) !== generation) throw failure();
        } else {
          const result = /^\{"v":1,"type":"REDEEMED","id":"([a-f0-9-]{36})","generation":([1-9][0-9]{0,8}),"token":"(bootstrap_[A-Za-z0-9_-]{43})"\}$/.exec(frame);
          if (!result || result[1] !== active.id || Number(result[2]) !== generation) throw failure(); token = result[3];
        }
        const nextPulseDeadline = new CompanionDeadline(4500, elapsedNow);
        operation = undefined; active.cleanup(); pulseDeadline = nextPulseDeadline; active.resolve(token);
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
          if (frame.length > 1024) throw failure(); line(frame);
        }
        if (pending.length > 1024) throw failure();
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
