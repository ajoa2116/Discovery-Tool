import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ApplicationSecret, AuthorityReceipt, TrustedBootstrapDelivery } from './application_session_authority.ts';

export const BOOTSTRAP_TRANSPORT_PATH = fileURLToPath(new URL('../../native/BootstrapTransport/bin/Release/net10.0-windows/BootstrapTransport.exe', import.meta.url));
export type StubMode = 'normal' | 'malformed' | 'duplicate' | 'oversized' | 'wrong-ack' | 'replay' | 'timeout' | 'disconnect' | 'wrong-peer';
const failure = () => new Error('Private bootstrap delivery unavailable.');

/** Isolated, blocking proof transport. No production caller or public endpoint. */
export class PrivateBootstrapTransport implements TrustedBootstrapDelivery {
  constructor(private readonly mode: StubMode = 'normal') {}
  deliver(capability: ApplicationSecret, receipt: AuthorityReceipt): void {
    if (process.platform !== 'win32') throw failure();
    const nonce = randomBytes(32).toString('hex');
    const token = capability.expose();
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'ProgramFiles'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
    const result = spawnSync(BOOTSTRAP_TRANSPORT_PATH, ['--deliver', this.mode], {
      windowsHide: true, shell: false, env, timeout: 8000, maxBuffer: 4096,
      input: JSON.stringify({ v: 1, type: 'OFFER', token, id: receipt.id, nonce }) + '\n', encoding: 'utf8',
    });
    try {
      if (result.error || result.status !== 0 || result.stderr || !result.stdout.endsWith('\n')) throw failure();
      const ack = JSON.parse(result.stdout);
      if (Object.keys(ack).sort().join(',') !== 'digest,id,nonce,type,v' || ack.v !== 1 || ack.type !== 'DELIVERED' ||
          ack.id !== receipt.id || ack.nonce !== nonce || ack.digest !== createHash('sha256').update(token).digest('hex') || Date.now() >= receipt.expiresAt) throw failure();
    } catch { throw failure(); }
    // spawnSync returns only after the verified recipient acknowledges and exits.
    // Throwing here causes ApplicationSessionAuthority to invalidate the bootstrap.
  }
}
