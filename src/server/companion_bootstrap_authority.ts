import { CompanionDeadline } from './companion_deadline.ts';
import { ApplicationSessionAuthority, APPLICATION_SESSION_MS, type ApplicationSecret, type AuthorityReceipt } from './application_session_authority.ts';
import { PrivateBootstrapTransport } from './private_bootstrap_transport.ts';
import { startApplicationCompanion, type CompanionFixtureMode, type CompanionLifetime } from './application_companion_supervisor.ts';

export type CompanionControl = Pick<CompanionLifetime, 'pid' | 'brokerPid' | 'generation' | 'alive' | 'lost' | 'closed' | 'failureCode' | 'logoutSession' | 'shutdown'>;
const denied = () => new Error('Companion authority unavailable.');
/** One authority per verified companion. No production composition or public transport. */
export class CompanionBootstrapAuthority {
  #transport: CompanionLifetime;
  #authority: ApplicationSessionAuthority;
  #receipt?: AuthorityReceipt;
  #issued = false;
  #disposed = false;
  #loggingOut = false;
  #session?: AuthorityReceipt;
  #expiry?: ReturnType<typeof setTimeout>;
  #deadline?: CompanionDeadline;
  readonly companion: CompanionControl;
  private constructor(transport: CompanionLifetime, private readonly clock: () => number = Date.now, private readonly elapsedClock?: () => number) {
    this.#transport = transport;
    this.#authority = new ApplicationSessionAuthority(new PrivateBootstrapTransport('normal', transport), clock);
    this.companion = Object.freeze({
      pid: transport.pid, brokerPid: transport.brokerPid, generation: transport.generation,
      get alive() { return transport.alive; }, lost: transport.lost, closed: transport.closed, failureCode: transport.failureCode,
      logoutSession: (signal?: AbortSignal) => this.logout(signal), shutdown: () => this.dispose(),
    });
    void transport.lost.then(() => this.#invalidate());
  }
  static async start(options: { signal?: AbortSignal; mode?: CompanionFixtureMode; clock?: () => number; elapsedClock?: () => number } = {}) {
    const companion = await startApplicationCompanion(options);
    if (!companion.alive || options.signal?.aborted) { await companion.shutdown(); throw denied(); }
    return new CompanionBootstrapAuthority(companion, options.clock, options.elapsedClock);
  }
  #invalidate() { if (this.#disposed) return; this.#disposed = true; this.#receipt = undefined; this.#session = undefined; this.#deadline = undefined; clearTimeout(this.#expiry); this.#authority.dispose(); }
  #live() {
    try {
      if (this.#deadline && this.#deadline.remaining() <= 0) throw denied();
      if (this.#disposed || !this.#transport.alive) throw denied();
    } catch { this.#invalidate(); void this.#transport.shutdown().catch(() => {}); throw denied(); }
  }
  #watchExpiry() {
    const check = () => {
      if (this.#disposed || !this.#deadline) return;
      try { this.#live(); this.#expiry = setTimeout(check, Math.min(250, this.#deadline!.remaining())); this.#expiry.unref(); }
      catch { this.#invalidate(); void this.#transport.shutdown().catch(() => {}); }
    };
    check();
  }
  async issueBootstrap(signal?: AbortSignal): Promise<AuthorityReceipt> {
    this.#live();
    if (this.#issued) { this.#invalidate(); void this.#transport.shutdown().catch(() => {}); throw denied(); }
    this.#issued = true;
    const cancel = () => { this.#invalidate(); void this.#transport.shutdown().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const receipt = await this.#authority.issueBootstrap(signal); this.#live();
      await this.#transport.activateBootstrap(receipt.id); this.#live();
      if (signal?.aborted) throw denied();
      this.#receipt = receipt; return receipt;
    } catch { this.#invalidate(); void this.#transport.shutdown().catch(() => {}); throw denied(); }
    finally { signal?.removeEventListener('abort', cancel); }
  }
  /** Trusted server proof API retained; session still requires verified native activation. */
  async redeemBootstrap(signal?: AbortSignal): Promise<{ receipt: AuthorityReceipt; secret: ApplicationSecret }> {
    return this.#deliverSession(signal);
  }
  /** Session secret crosses only the verified private native channel; caller gets metadata. */
  async deliverSession(signal?: AbortSignal): Promise<AuthorityReceipt> { return (await this.#deliverSession(signal)).receipt; }
  async #deliverSession(signal?: AbortSignal): Promise<{ receipt: AuthorityReceipt; secret: ApplicationSecret }> {
    this.#live(); const receipt = this.#receipt;
    if (signal?.aborted) { this.#invalidate(); void this.#transport.shutdown().catch(() => {}); throw denied(); }
    if (!receipt || this.#session) throw denied();
    this.#receipt = undefined;
    const cancel = () => { this.#invalidate(); void this.#transport.shutdown().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const token = await this.#transport.requestBootstrapRedemption(receipt.id); this.#live();
      const session = this.#authority.redeemBootstrapProvisional(token);
      this.#deadline = new CompanionDeadline(APPLICATION_SESSION_MS, this.elapsedClock, session.receipt.expiresAt, this.clock);
      this.#watchExpiry(); this.#live();
      await this.#transport.deliverSession(session.secret.expose(), session.receipt, signal); this.#live();
      await this.#transport.activateSession(signal); this.#live();
      if (signal?.aborted) throw denied();
      this.#authority.activateSession(session.receipt.id);
      this.#session = session.receipt;
      return session;
    } catch { cancel(); throw denied(); }
    finally { signal?.removeEventListener('abort', cancel); }
  }
  async logout(signal?: AbortSignal) {
    this.#live();
    if (this.#loggingOut) throw denied();
    if (!this.#session) { this.#invalidate(); await this.#transport.shutdown(); throw denied(); }
    this.#loggingOut = true;
    // Revoke server authority before awaiting native acknowledgment. Logout is terminal.
    try {
      this.#authority.revokeSession(this.#session.id); clearTimeout(this.#expiry); this.#session = undefined;
      await this.#transport.logoutSession(signal);
    }
    catch { this.#invalidate(); await this.#transport.shutdown(); throw denied(); }
    this.#invalidate(); await this.#transport.shutdown();
  }
  validateSession(token: unknown) { this.#live(); return this.#authority.validateSession(token); }
  async dispose() { this.#invalidate(); await this.#transport.shutdown(); }
}
