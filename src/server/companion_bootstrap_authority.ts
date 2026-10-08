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
  private constructor(readonly companion: CompanionLifetime, clock?: () => number) {
    this.#authority = new ApplicationSessionAuthority(new PrivateBootstrapTransport('normal', companion), clock);
    void companion.lost.then(() => this.#invalidate());
  }
  static async start(options: { signal?: AbortSignal; mode?: CompanionFixtureMode; clock?: () => number } = {}) {
    const companion = await startApplicationCompanion(options);
    if (!companion.alive || options.signal?.aborted) { await companion.shutdown(); throw denied(); }
    return new CompanionBootstrapAuthority(companion, options.clock);
  }
  #invalidate() { if (this.#disposed) return; this.#disposed = true; this.#receipt = undefined; this.#authority.dispose(); }
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
  /** A verified native request proves possession; session secrets stay on the server. */
  async redeemBootstrap(): Promise<{ receipt: AuthorityReceipt; secret: ApplicationSecret }> {
    this.#live(); const receipt = this.#receipt;
    if (!receipt) throw denied();
    this.#receipt = undefined;
    try {
      const token = await this.companion.requestBootstrapRedemption(receipt.id); this.#live();
      return this.#authority.redeemBootstrap(token);
    } catch { this.#invalidate(); void this.companion.shutdown().catch(() => {}); throw denied(); }
  }
  validateSession(token: unknown) { this.#live(); return this.#authority.validateSession(token); }
  async dispose() { this.#invalidate(); await this.companion.shutdown(); }
}
