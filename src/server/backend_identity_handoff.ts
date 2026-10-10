import { randomUUID } from 'node:crypto';
import { Server as HttpServer } from 'node:http';
import { Server as HttpsServer } from 'node:https';
import { CompanionBootstrapAuthority } from './companion_bootstrap_authority.ts';
import { CompanionDeadline } from './companion_deadline.ts';
import type { AuthorityReceipt } from './application_session_authority.ts';

const unavailable = () => new Error('Backend identity handoff unavailable.');
const HANDOFF_MS = 10_000;
type Listener = HttpServer | HttpsServer;
export interface BackendInstanceIdentity {
  readonly instanceId: string;
  /** Diagnostic values only. Matching these does not establish authority. */
  readonly processId: number;
  readonly port: number;
}
type Instance = { server: Listener; port: number; ended: AbortSignal };
const instances = new WeakMap<object, Instance>();
const registeredListeners = new WeakSet<Listener>();
const reservedOwners = new WeakSet<CompanionBootstrapAuthority>();
const reservedInstances = new WeakSet<object>();

/** Register the exact locally owned listener, not a supplied PID/port descriptor.
 * This establishes process-local identity only, never native peer verification. */
export function createBackendInstanceIdentity(server: Listener): BackendInstanceIdentity {
  const candidate: unknown = server;
  if (!(candidate instanceof HttpServer || candidate instanceof HttpsServer) || registeredListeners.has(server)) throw unavailable();
  const address = server.address();
  if (!server.listening || !address || typeof address === 'string' || address.address !== '127.0.0.1') throw unavailable();
  const ended = new AbortController();
  const stop = () => {
    server.removeListener('close', stop); server.removeListener('error', stop); ended.abort();
  };
  server.once('close', stop); server.once('error', stop);
  const identity = Object.freeze({ instanceId: randomUUID(), processId: process.pid, port: address.port });
  instances.set(identity, { server, port: address.port, ended: ended.signal });
  registeredListeners.add(server);
  return identity;
}

declare const challengeBrand: unique symbol;
export interface BackendHandoffChallenge { readonly [challengeBrand]: true }
export interface BackendOwnerBindingCandidate {
  readonly backendInstanceId: string;
  readonly sessionId: string;
  readonly productionAuthority: false;
}

/** One-use, process-local ownership candidate. Not a native verification result,
 * transferable credential, or production authentication attachment mechanism. */
export class BackendIdentityHandoff {
  #owner!: CompanionBootstrapAuthority;
  #receipt!: AuthorityReceipt;
  #identity!: BackendInstanceIdentity;
  #instance!: Instance;
  #deadline!: CompanionDeadline;
  #phase: 'pending' | 'confirming' | 'bound' | 'terminal' = 'pending';
  #challenge = Object.freeze(Object.create(null)) as BackendHandoffChallenge;
  #binding?: BackendOwnerBindingCandidate;
  #ended = new AbortController();
  #signals: AbortSignal[] = [];
  #sweep?: ReturnType<typeof setInterval>;
  constructor(owner: CompanionBootstrapAuthority, receipt: AuthorityReceipt, identity: BackendInstanceIdentity,
    options: { signal?: AbortSignal; elapsedClock?: () => number; wallClock?: () => number } = {}) {
    try {
      // Invoke the real owner's private-brand check, not a caller's lookalike validator.
      CompanionBootstrapAuthority.prototype.authorizeFixtureReceipt.call(owner, receipt);
      const instance = instances.get(identity);
      if (!instance || reservedOwners.has(owner) || reservedInstances.has(identity) || options.signal?.aborted) throw unavailable();
      this.#owner = owner; this.#receipt = receipt; this.#identity = identity; this.#instance = instance;
      const wall = options.wallClock ?? Date.now;
      this.#deadline = new CompanionDeadline(HANDOFF_MS, options.elapsedClock,
        Math.min(wall() + HANDOFF_MS, receipt.expiresAt), wall);
      this.#signals = [owner.boundaryEnded, instance.ended, ...(options.signal ? [options.signal] : [])];
      this.#live();
      // Reserve synchronously: a failed/expired attempt cannot replace either lifetime.
      if (reservedOwners.has(owner) || reservedInstances.has(identity)) throw unavailable();
      reservedOwners.add(owner); reservedInstances.add(identity);
      for (const signal of this.#signals) signal.addEventListener('abort', this.revoke, { once: true });
      if (this.#signals.some(signal => signal.aborted)) throw unavailable();
      this.#sweep = setInterval(() => { try { this.#live(); } catch { this.revoke(); } }, 250);
      this.#sweep.unref();
    } catch { this.revoke(); throw unavailable(); }
  }
  get ended(): AbortSignal { return this.#ended.signal; }
  #live() {
    if (this.#phase === 'terminal' || this.#signals.some(signal => signal.aborted) || this.#deadline.remaining() <= 0) throw unavailable();
    CompanionBootstrapAuthority.prototype.authorizeFixtureReceipt.call(this.#owner, this.#receipt);
    const address = this.#instance.server.address();
    if (!this.#instance.server.listening || !address || typeof address === 'string' ||
      address.address !== '127.0.0.1' || address.port !== this.#instance.port) throw unavailable();
  }
  get challenge(): BackendHandoffChallenge {
    try { this.#live(); if (this.#phase !== 'pending') throw unavailable(); return this.#challenge; }
    catch { this.revoke(); throw unavailable(); }
  }
  confirmCandidate(owner: unknown, identity: unknown, challenge: unknown): BackendOwnerBindingCandidate {
    if (this.#phase !== 'pending') { this.revoke(); throw unavailable(); }
    // Consume before liveness clocks or revocation callbacks can reenter confirmation.
    this.#phase = 'confirming';
    try {
      if (owner !== this.#owner || identity !== this.#identity || challenge !== this.#challenge) throw unavailable();
      this.#live();
      if (this.#phase !== 'confirming') throw unavailable();
      this.#binding = Object.freeze({ backendInstanceId: this.#identity.instanceId,
        sessionId: this.#receipt.id, productionAuthority: false as const });
      this.#phase = 'bound'; return this.#binding;
    } catch { this.revoke(); throw unavailable(); }
  }
  assertCandidate(owner: unknown, identity: unknown, binding: unknown): void {
    try {
      if (this.#phase !== 'bound' || owner !== this.#owner || identity !== this.#identity || binding !== this.#binding) throw unavailable();
      this.#live(); if (this.#phase !== 'bound') throw unavailable();
    } catch { this.revoke(); throw unavailable(); }
  }
  readonly revoke = () => {
    if (this.#phase === 'terminal') return;
    this.#phase = 'terminal'; this.#binding = undefined;
    clearInterval(this.#sweep); this.#sweep = undefined;
    for (const signal of this.#signals ?? []) signal.removeEventListener('abort', this.revoke);
    this.#ended.abort();
  };
  toJSON() { return { productionAuthority: false }; }
}
