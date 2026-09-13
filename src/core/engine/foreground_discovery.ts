import { DiscoveryContext, ForegroundSession, ForegroundSnapshot, foregroundActive } from '../../shared/discovery_session.ts';

/** A foreground reservation spans monitor handoff, preflight and every execution stage. */
export class ForegroundDiscovery {
  private snapshot: ForegroundSnapshot = { epoch: crypto.randomUUID(), revision: 0, session: null };
  private controller: AbortController | null = null;
  constructor(private readonly changed: (snapshot: ForegroundSnapshot) => void = () => {}) {}
  getState(): ForegroundSnapshot { return structuredClone(this.snapshot); }
  isActive() { return foregroundActive(this.snapshot.session); }
  begin(origin: ForegroundSession['origin']) {
    if (this.isActive()) throw Error('A foreground discovery session is already running.');
    this.controller = new AbortController();
    const context: DiscoveryContext & { origin: ForegroundSession['origin'] } = { origin, sessionId: crypto.randomUUID() };
    this.snapshot.session = { ...context, sessionClass: origin === 'MANUAL' ? 'USER_SCAN' : 'ADVANCED_SCAN', purpose: origin === 'MANUAL' ? 'QUICK_SCAN' : 'ADVANCED_SCAN', visibility: 'TECHNICIAN', state: 'PREPARING' }; this.publish();
    return { context, signal: this.controller.signal };
  }
  scanning(sessionId: string) {
    if (this.snapshot.session?.sessionId !== sessionId || this.snapshot.session.state !== 'PREPARING') return false;
    this.snapshot.session.state = 'SCANNING'; this.publish(); return true;
  }
  stop(sessionId: unknown) {
    if (typeof sessionId !== 'string' || this.snapshot.session?.sessionId !== sessionId || !this.isActive()) return false;
    if (this.snapshot.session.state === 'STOPPING') return true;
    this.snapshot.session.state = 'STOPPING'; this.publish(); this.controller?.abort(); return true;
  }
  finish(sessionId: string, state: 'COMPLETED' | 'CANCELLED' | 'FAILED') {
    if (this.snapshot.session?.sessionId !== sessionId || !this.isActive()) return;
    this.snapshot.session.state = this.controller?.signal.aborted ? 'CANCELLED' : state;
    if (this.snapshot.session.state === 'FAILED') this.snapshot.session.failureReason = 'DISCOVERY_OPERATION_FAILED';
    this.controller = null; this.publish();
  }
  private publish() { this.snapshot.revision++; this.changed(this.getState()); }
}
