import { spawn } from 'node:child_process';
import { NATIVE_HOST_PATH, NativeFrameDecoder } from './native_camera_proof.ts';

export type NativeCapabilityCode = 'AVAILABLE' | 'UNSUPPORTED_PLATFORM' | 'HOST_UNAVAILABLE' | 'PROTOCOL_UNAVAILABLE' | 'RUNTIME_UNAVAILABLE' | 'UNELEVATED_REQUIRED';
export interface NativeCapability { available: boolean; code: NativeCapabilityCode }

/** Read-only, bounded SDK/runtime probe. Never creates a browser, session or target. */
function probeHost(): Promise<unknown> {
  return new Promise(resolve => {
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'ProgramFiles'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
    const child = spawn(NATIVE_HOST_PATH, ['--capability'], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env });
    const decoder = new NativeFrameDecoder();
    const rejected = { v: 1, type: 'PROBE_REJECTED' };
    let settled = false, frames: unknown[] = [];
    const finish = (value: unknown) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); resolve(value); };
    const timer = setTimeout(() => finish(null), 5000);
    child.stdout.on('data', (chunk: Buffer) => {
      try { frames.push(...decoder.push(chunk)); if (frames.length > 1) finish(rejected); } catch { finish(rejected); }
    });
    child.stderr.resume(); // Raw process errors never enter UI/logs.
    child.once('error', () => finish(null));
    child.once('close', code => finish(decoder.incomplete ? rejected : frames.length === 1 && (code === 0 || (frames[0] as { type?: string })?.type === 'BROKER_FAILED') ? frames[0] : frames.length ? rejected : null));
  });
}

/** No cache: every selection rechecks the exact host and installed runtime. */
export async function checkNativeCapability(deps: { platform?: string; probe?: () => Promise<unknown> } = {}): Promise<NativeCapability> {
  const result = (code: NativeCapabilityCode): NativeCapability => ({ available: code === 'AVAILABLE', code });
  if ((deps.platform ?? process.platform) !== 'win32') return result('UNSUPPORTED_PLATFORM');
  let value: unknown;
  try { value = await (deps.probe ?? probeHost)(); } catch { return result('HOST_UNAVAILABLE'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result('HOST_UNAVAILABLE');
  const v = value as Record<string, unknown>;
  if (v.v === 1 && v.type === 'BROKER_FAILED' && v.code === 'UNELEVATED_REQUIRED' && Object.keys(v).length === 3) return result('UNELEVATED_REQUIRED');
  if (Object.keys(v).sort().join(',') !== 'elevated,runtime,type,v' || v.v !== 1 || v.type !== 'CAPABILITY' || v.elevated !== false || typeof v.runtime !== 'string') return result('PROTOCOL_UNAVAILABLE');
  if (v.runtime === '') return result('RUNTIME_UNAVAILABLE');
  return result(/^\d+(\.\d+){3}$/.test(v.runtime) ? 'AVAILABLE' : 'PROTOCOL_UNAVAILABLE');
}
