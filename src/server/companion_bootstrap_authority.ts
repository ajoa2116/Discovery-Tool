import { ApplicationSessionAuthority, type ApplicationSecret, type AuthorityReceipt } from './application_session_authority.ts';
import { PrivateBootstrapTransport } from './private_bootstrap_transport.ts';
import { startApplicationCompanion, type CompanionFixtureMode, type CompanionLifetime } from './application_companion_supervisor.ts';

const denied = () => new Error('Companion authority unavailable.');
/** One authority per verified companion. No production composition or public transport. */
export class CompanionBootstrapAuthority {
  #authority: ApplicationSessionAuthority;
  #receipt?: AuthorityReceipt;
  #issued = false;
  #disposed = false;
  #session?: AuthorityReceipt;
  #expiry?: ReturnType<typeof setTimeout>;
  private constructor(readonly companion: CompanionLifetime, clock?: () => number) {
    this.#authority = new ApplicationSessionAuthority(new PrivateBootstrapTransport('normal', companion), clock);
    void companion.lost.then(() => this.#invalidate());
  }
  static async start(options: { signal?: AbortSignal; mode?: CompanionFixtureMode; clock?: () => number } = {}) {
    const companion = await startApplicationCompanion(options);
    if (!companion.alive || options.signal?.aborted) { await companion.shutdown(); throw denied(); }
    return new CompanionBootstrapAuthority(companion, options.clock);
  }
  #invalidate() { if (this.#disposed) return; this.#disposed = true; this.#receipt = undefined; this.#session = undefined; clearTimeout(this.#expiry); this.#authority.dispose(); }
  #live() { if (this.#disposed || !this.companion.alive) { this.#invalidate(); throw denied(); } }
  async issueBootstrap(signal?: AbortSignal): Promise<AuthorityReceipt> {
    this.#live();
    if (this.#issued) { this.#invalidate(); void this.companion.shutdown().catch(() => {}); throw denied(); }
    this.#issued = true;
    const cancel = () => { this.#invalidate(); void this.companion.shutdown().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const receipt = await this.#authority.issueBootstrap(signal); this.#live();
      await this.companion.activateBootstrap(receipt.id); this.#live();
      if (signal?.aborted) throw denied();
      this.#receipt = receipt; return receipt;
    } catch { this.#invalidate(); void this.companion.shutdown().catch(() => {}); throw denied(); }
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
    if (signal?.aborted) { this.#invalidate(); void this.companion.shutdown().catch(() => {}); throw denied(); }
    if (!receipt || this.#session) throw denied();
    this.#receipt = undefined;
    const cancel = () => { this.#invalidate(); void this.companion.shutdown().catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const token = await this.companion.requestBootstrapRedemption(receipt.id); this.#live();
      const session = this.#authority.redeemBootstrapProvisional(token);
      await this.companion.deliverSession(session.secret.expose(), session.receipt, signal); this.#live();
      await this.companion.activateSession(signal); this.#live();
      if (signal?.aborted) throw denied();
      this.#authority.activateSession(session.receipt.id);
      this.#session = session.receipt;
      this.#expiry = setTimeout(cancel, Math.max(0, session.receipt.expiresAt - Date.now()));
      this.#expiry.unref(); return session;
    } catch { cancel(); throw denied(); }
    finally { signal?.removeEventListener('abort', cancel); }
  }
  async logout(signal?: AbortSignal) {
    this.#live(); if (!this.#session) throw denied();
    // Revoke server authority before awaiting native acknowledgment. Logout is terminal.
    try {
      this.#authority.revokeSession(this.#session.id); clearTimeout(this.#expiry); this.#session = undefined;
      await this.companion.logoutSession(signal);
    }
    catch { this.#invalidate(); await this.companion.shutdown(); throw denied(); }
    this.#invalidate(); await this.companion.shutdown();
  }
  validateSession(token: unknown) { this.#live(); return this.#authority.validateSession(token); }
  async dispose() { this.#invalidate(); await this.companion.shutdown(); }
}
