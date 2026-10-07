import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

export const APPLICATION_BOOTSTRAP_MS = 30_000;
export const APPLICATION_SESSION_MS = 15 * 60_000;
const CAPACITY = 128;

/** Exposure is explicit at the trusted delivery/redemption boundary only. */
export class ApplicationSecret {
  #value: string;
  constructor(kind: 'bootstrap' | 'session') {
    this.#value = `${kind}_${randomBytes(32).toString('base64url')}`;
  }
  expose() { return this.#value; }
  toJSON() { return '[REDACTED]'; }
  toString() { return '[REDACTED]'; }
  [inspect.custom]() { return '[REDACTED]'; }
}

export interface AuthorityReceipt { readonly id: string; readonly expiresAt: number }
export interface TrustedBootstrapDelivery {
  /** Must privately deliver to the intended client; never log or publicly publish it. */
  deliver(capability: ApplicationSecret, receipt: AuthorityReceipt, signal?: AbortSignal): void | Promise<void>;
}
type Bootstrap = { receipt: AuthorityReceipt; delivered: boolean };
const denied = () => new Error('Application authority unavailable.');
const key = (token: unknown, kind: 'bootstrap' | 'session') => {
  if (typeof token !== 'string' || !new RegExp(`^${kind}_[A-Za-z0-9_-]{43}$`).test(token)) throw denied();
  return createHash('sha256').update(token).digest('hex');
};

/** In-memory capability authority; no HTTP, IPC, persistence or logging. */
export class ApplicationSessionAuthority {
  #bootstraps = new Map<string, Bootstrap>();
  #sessions = new Map<string, AuthorityReceipt>();
  #lastNow = -Infinity;
  #disposed = false;
  #pending = new Set<() => void>();
  constructor(private readonly delivery: TrustedBootstrapDelivery, private readonly clock: () => number = Date.now) {}
  toJSON() { return {}; }
  [inspect.custom]() { return 'ApplicationSessionAuthority { private state omitted }'; }
  #now() {
    if (this.#disposed) throw denied();
    const now = this.clock();
    if (!Number.isFinite(now)) throw denied();
    this.#lastNow = Math.max(this.#lastNow, now);
    for (const [digest, entry] of this.#bootstraps) if (entry.receipt.expiresAt <= this.#lastNow) this.#bootstraps.delete(digest);
    for (const [digest, receipt] of this.#sessions) if (receipt.expiresAt <= this.#lastNow) this.#sessions.delete(digest);
    return this.#lastNow;
  }
  async issueBootstrap(signal?: AbortSignal): Promise<AuthorityReceipt> {
    const now = this.#now();
    if (signal?.aborted || this.#bootstraps.size >= CAPACITY || this.#pending.size >= CAPACITY) throw denied();
    const secret = new ApplicationSecret('bootstrap'), digest = key(secret.expose(), 'bootstrap');
    const receipt = Object.freeze({ id: randomUUID(), expiresAt: now + APPLICATION_BOOTSTRAP_MS });
    const entry = { receipt, delivered: false };
    this.#bootstraps.set(digest, entry);
    const deliveryController = new AbortController();
    let rejectCancellation!: (error: Error) => void;
    const cancelled = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
    const cancel = () => {
      this.#bootstraps.delete(digest);
      rejectCancellation(denied());
      deliveryController.abort();
    };
    this.#pending.add(cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const confirmed = Promise.resolve().then(() => {
        if (deliveryController.signal.aborted) throw denied();
        return this.delivery.deliver(secret, receipt, deliveryController.signal);
      });
      // Observe late rejection even if cancellation/disposal wins the race.
      await Promise.race([confirmed, cancelled]);
      this.#now(); // Recheck expiry with the same injected clock after acknowledgment.
      if (signal?.aborted || deliveryController.signal.aborted || this.#bootstraps.get(digest) !== entry) throw denied();
      entry.delivered = true;
      return receipt;
    } catch {
      this.#bootstraps.delete(digest);
      deliveryController.abort();
      throw denied(); // Never disclose a delivery exception or capability.
    } finally {
      signal?.removeEventListener('abort', cancel);
      this.#pending.delete(cancel);
    }
  }
  redeemBootstrap(token: unknown): { receipt: AuthorityReceipt; secret: ApplicationSecret } {
    const now = this.#now(), digest = key(token, 'bootstrap'), entry = this.#bootstraps.get(digest);
    if (!entry?.delivered) throw denied();
    this.#bootstraps.delete(digest); // Consume before issuing; capacity failure cannot enable replay.
    if (this.#sessions.size >= CAPACITY) throw denied();
    const secret = new ApplicationSecret('session');
    const receipt = Object.freeze({ id: randomUUID(), expiresAt: now + APPLICATION_SESSION_MS });
    this.#sessions.set(key(secret.expose(), 'session'), receipt);
    return { receipt, secret };
  }
  validateSession(token: unknown): AuthorityReceipt {
    this.#now();
    const receipt = this.#sessions.get(key(token, 'session'));
    if (!receipt) throw denied();
    return receipt;
  }
  /** Trusted server-side revocation, not a public endpoint. */
  revokeSession(id: string): boolean {
    this.#now();
    for (const [digest, receipt] of this.#sessions) if (receipt.id === id) return this.#sessions.delete(digest);
    return false;
  }
  dispose() {
    this.#disposed = true;
    for (const cancel of this.#pending) cancel();
    this.#bootstraps.clear(); this.#sessions.clear();
  }
}
