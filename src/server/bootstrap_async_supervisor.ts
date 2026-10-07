import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BootstrapAckDecoder, type ExpectedBootstrapAcknowledgment } from './bootstrap_ack_decoder.ts';

export interface BootstrapSupervisorOptions {
  executable: string;
  args: readonly string[];
  environment: NodeJS.ProcessEnv;
  input: string;
  expected: ExpectedBootstrapAcknowledgment;
  signal?: AbortSignal;
  timeoutMs?: number;
  cleanupMs?: number;
}
export type SpawnBootstrapChild = (options: BootstrapSupervisorOptions) => ChildProcessWithoutNullStreams;
const failure = () => new Error('Bootstrap helper unavailable.');
const spawnHelper: SpawnBootstrapChild = options => spawn(options.executable, [...options.args], {
  shell: false, windowsHide: true, env: options.environment, stdio: ['pipe', 'pipe', 'pipe'],
});

/** Isolated supervisor. Callers own executable trust and secret-free args/environment. */
export function superviseBootstrap(options: BootstrapSupervisorOptions, start: SpawnBootstrapChild = spawnHelper): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 8000, cleanupMs = options.cleanupMs ?? 2000;
  if (options.signal?.aborted || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
      !Number.isInteger(cleanupMs) || cleanupMs < 1 || cleanupMs > 10000 || Buffer.byteLength(options.input) > 16384) return Promise.reject(failure());
  return new Promise<void>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try { child = start(options); } catch { reject(failure()); return; }
    const decoder = new BootstrapAckDecoder(options.expected);
    let failed = false, settled = false, closed = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => fail(), timeoutMs);
    const settle = (success: boolean) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(cleanupTimer);
      options.signal?.removeEventListener('abort', abort);
      if (success) resolve(); else reject(failure());
    };
    const fail = () => {
      if (failed || settled) return; failed = true;
      clearTimeout(timer);
      child.stdin.destroy();
      try { child.kill(); } catch { /* Generic failure; no raw diagnostics. */ }
      if (closed) { settle(false); return; }
      if (settled) return;
      cleanupTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* Still fail closed. */ }
        child.stdout.destroy(); child.stderr.destroy();
        child.unref();
        settle(false); // Bounded failure; never claim that kill guarantees process exit.
      }, cleanupMs);
    };
    const abort = () => fail();
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('error', fail);
    child.stderr.on('error', fail);
    child.stdout.on('data', (chunk: Buffer) => {
      if (failed || settled) return;
      try { decoder.push(chunk); } catch { fail(); }
    });
    child.stderr.on('data', (chunk: Buffer) => { if (chunk.length) fail(); });
    child.on('close', (code, signal) => {
      closed = true;
      if (settled) return;
      if (failed || code !== 0 || signal || options.signal?.aborted) { settle(false); return; }
      try { decoder.finish(); settle(true); } catch { settle(false); }
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) fail();
    if (!failed) {
      try { child.stdin.end(options.input); } catch { fail(); }
    }
  });
}
