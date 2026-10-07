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
  deliver(capability: ApplicationSecret, receipt: AuthorityReceipt): void;
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
  issueBootstrap(): AuthorityReceipt {
    const now = this.#now();
    if (this.#bootstraps.size >= CAPACITY) throw denied();
    const secret = new ApplicationSecret('bootstrap'), digest = key(secret.expose(), 'bootstrap');
    const receipt = Object.freeze({ id: randomUUID(), expiresAt: now + APPLICATION_BOOTSTRAP_MS });
    const entry = { receipt, delivered: false };
    this.#bootstraps.set(digest, entry);
    try {
      this.delivery.deliver(secret, receipt);
      // Delivery is synchronous; redemption during delivery is refused.
      if (this.#disposed || this.#bootstraps.get(digest) !== entry) throw denied();
      entry.delivered = true;
      return receipt;
    } catch {
      this.#bootstraps.delete(digest);
      throw denied(); // Never disclose a delivery exception or capability.
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
  dispose() { this.#disposed = true; this.#bootstraps.clear(); this.#sessions.clear(); }
}
