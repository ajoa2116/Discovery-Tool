import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ApplicationSecret, AuthorityReceipt, TrustedBootstrapDelivery } from './application_session_authority.ts';
import { superviseBootstrap } from './bootstrap_async_supervisor.ts';

export const BOOTSTRAP_TRANSPORT_PATH = fileURLToPath(new URL('../../native/BootstrapTransport/bin/Release/net10.0-windows/BootstrapTransport.exe', import.meta.url));
export type StubMode = 'normal' | 'malformed' | 'duplicate' | 'oversized' | 'wrong-ack' | 'replay' | 'timeout' | 'disconnect' | 'wrong-peer';
const failure = () => new Error('Private bootstrap delivery unavailable.');

/** Isolated asynchronous proof transport. No production caller or public endpoint. */
export class PrivateBootstrapTransport implements TrustedBootstrapDelivery {
  constructor(private readonly mode: StubMode = 'normal') {}
  async deliver(capability: ApplicationSecret, receipt: AuthorityReceipt, signal?: AbortSignal): Promise<void> {
    if (process.platform !== 'win32' || signal?.aborted || Date.now() >= receipt.expiresAt) throw failure();
    const nonce = randomBytes(32).toString('hex');
    const token = capability.expose();
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'ProgramFiles'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
    try {
      await superviseBootstrap({
        executable: BOOTSTRAP_TRANSPORT_PATH, args: ['--deliver', this.mode], environment: env,
        input: JSON.stringify({ v: 1, type: 'OFFER', token, id: receipt.id, nonce }) + '\n',
        expected: { id: receipt.id, nonce, digest: createHash('sha256').update(token).digest('hex') },
        signal, timeoutMs: 8000, cleanupMs: 2000,
      });
      if (signal?.aborted || Date.now() >= receipt.expiresAt) throw failure();
    } catch { throw failure(); }
    // Success requires strict acknowledgment and clean helper close; rejection
    // causes ApplicationSessionAuthority to invalidate the pending bootstrap.
  }
}
