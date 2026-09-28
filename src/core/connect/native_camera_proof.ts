import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CameraBrowserSessions, CameraHostChannel } from './camera_browser_sessions.ts';

export const NATIVE_HOST_PATH = fileURLToPath(new URL('../../../native/CameraBrowserHost/bin/Release/net10.0-windows/CameraBrowserHost.exe', import.meta.url));
const failure = () => new Error('Native camera renderer unavailable. Use the existing authorized Open External workflow.');
const eventCodes = new Set(['NONE', 'INITIALIZED', 'PAGE_RENDERED', 'AUTHORIZATION_ENDED', 'RUNTIME_UNAVAILABLE', 'CERTIFICATE_REJECTED', 'RENDERER_FAILED', 'NAVIGATION_FAILED', 'SMOKE_FAILED', 'BOOTSTRAP_FAILED', 'LOADING', 'NAVIGATED', 'NAVIGATION_BLOCKED']);
export interface NativeProofEvent { code: string; runtime?: string; canGoBack?: boolean; canGoForward?: boolean }
export type NativeHostCommand = 'FOCUS' | 'REFRESH' | 'BACK' | 'FORWARD';
function shape(value: unknown, type: string, keys: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure();
  const v = value as Record<string, unknown>;
  if (v.v !== 1 || v.type !== type || Object.keys(v).sort().join(',') !== ['v', 'type', ...keys].sort().join(',')) throw failure();
}
/** Server-owned protocol state; no HTTP exposure. Tokens appear only in private transport replies. */
export class NativeProofProtocol {
  #command: NativeHostCommand | 'NONE' = 'NONE';
  command(command: NativeHostCommand) { if (!['FOCUS', 'REFRESH', 'BACK', 'FORWARD'].includes(command) || this.closed) throw failure(); this.#command = command; }
  #channel: CameraHostChannel;
  #handoff: ReturnType<CameraBrowserSessions['createNative']>;
  #phase: 'START' | 'OFFERED' | 'ACTIVE' | 'CLOSED' = 'START';
  #event: (event: NativeProofEvent) => void;
  constructor(sessions: CameraBrowserSessions, deviceId: string, event: (event: NativeProofEvent) => void = () => {}) {
    this.#channel = sessions.createHostChannel();
    try { this.#handoff = sessions.createNative(deviceId, this.#channel); } catch { this.#channel.disconnect(); throw failure(); }
    this.#event = event;
  }
  toJSON() { return {}; }
  get closed() { return this.#phase === 'CLOSED'; }
  receive(value: unknown): object {
    try {
      if (this.#phase === 'START') {
        shape(value, 'BROKER_READY', ['elevated']);
        if (value.elevated !== false) throw failure();
        this.#phase = 'OFFERED';
        return { v: 1, type: 'OFFER', sessionId: this.#handoff.session.sessionId, deviceId: this.#handoff.session.deviceId, token: this.#handoff.secret.expose() };
      }
      if (this.#phase === 'OFFERED') {
        shape(value, 'REDEEM', ['sessionId', 'deviceId', 'token']);
        if (value.sessionId !== this.#handoff.session.sessionId || value.deviceId !== this.#handoff.session.deviceId) throw failure();
        const grant = this.#channel.redeem(value.sessionId, value.deviceId, value.token);
        this.#phase = 'ACTIVE';
        return { v: 1, type: 'GRANT', session: grant.session, token: grant.channelToken.expose() };
      }
      if (this.#phase !== 'ACTIVE') throw failure();
      shape(value, 'MESSAGE', ['message', 'event', 'runtime']);
      if (!eventCodes.has(value.event) || typeof value.runtime !== 'string' || (value.runtime !== '' && !/^\d+(\.\d+){3}$/.test(value.runtime))) throw failure();
      if (value.event !== 'NONE' && value.message?.type !== (['INITIALIZED', 'PAGE_RENDERED', 'LOADING', 'NAVIGATED', 'NAVIGATION_BLOCKED'].includes(value.event) ? 'READY' : 'FAILED')) throw failure();
      if (value.message?.sessionId !== this.#handoff.session.sessionId || value.message?.deviceId !== this.#handoff.session.deviceId) throw failure();
      const ack = this.#channel.dispatch(value.message);
      if (ack.state === 'CLOSED') this.close();
      if (value.event !== 'NONE') this.#event({ code: value.event, ...(value.runtime ? { runtime: value.runtime } : {}) });
      if (value.message.type === 'NAVIGATION') this.#event({ code: 'HISTORY', canGoBack: ack.canGoBack, canGoForward: ack.canGoForward });
      const command = ack.state === 'ACTIVE' ? this.#command : 'NONE'; this.#command = 'NONE';
      return { v: 1, type: 'ACK', session: ack.session, state: ack.state, command };
    } catch { this.close(); throw failure(); }
  }
  close() { this.#phase = 'CLOSED'; this.#channel.disconnect(); }
}

/** Bounded NDJSON, strict UTF-8; no raw parse error is returned or logged. */
export class NativeFrameDecoder {
  #buffer = Buffer.alloc(0);
  get incomplete() { return this.#buffer.length !== 0; }
  push(chunk: Buffer): unknown[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const result: unknown[] = [];
    while (true) {
      const newline = this.#buffer.indexOf(10);
      if (newline < 0) { if (this.#buffer.length > 16384) throw failure(); break; }
      if (newline > 16384 || result.length >= 16) throw failure();
      try { result.push(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(this.#buffer.subarray(0, newline)))); } catch { throw failure(); }
      this.#buffer = this.#buffer.subarray(newline + 1);
    }
    return result;
  }
}

/** Private owned-child transport. Application orchestration gates real-camera launch; smoke options are test-only. */
export function launchNativeProof(sessions: CameraBrowserSessions, deviceId: string, options: { smoke?: boolean; integrationSmoke?: boolean; missingRuntime?: boolean; onEvent?: (event: NativeProofEvent) => void } = {}) {
  if (process.platform !== 'win32') throw failure();
  const protocol = new NativeProofProtocol(sessions, deviceId, options.onEvent);
  // Do not inherit WebView2 override flags or unrelated environment credentials.
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'ProgramFiles'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
  const child = spawn(NATIVE_HOST_PATH, ['--broker', ...(options.missingRuntime ? ['--runtime-missing'] : options.smoke ? ['--smoke'] : options.integrationSmoke ? ['--integration-smoke'] : [])], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env });
  let successfulClose = false, ended = false, timer: ReturnType<typeof setTimeout>;
  const decoder = new NativeFrameDecoder();
  const stop = () => { if (ended) return; protocol.close(); child.stdin.destroy(); child.kill(); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(stop, 12_000); };
  const done = new Promise<{ closed: boolean }>(resolve => {
    const finish = () => { if (ended) return; ended = true; clearTimeout(timer); protocol.close(); resolve({ closed: successfulClose }); };
    child.once('error', finish); child.once('exit', finish);
    child.stdin.on('error', stop);
    // Never forward broker stderr/raw payloads into normal logs/support diagnostics.
    child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      try {
        for (const frame of decoder.push(chunk)) {
          const reply = protocol.receive(frame);
          successfulClose = protocol.closed;
          if (!child.stdin.write(JSON.stringify(reply) + '\n')) { child.stdout.pause(); child.stdin.once('drain', () => child.stdout.resume()); }
          arm();
        }
      } catch { stop(); }
    });
    arm();
  });
  return { done, close: stop, command: (command: NativeHostCommand) => protocol.command(command), processId: child.pid };
}
