import { WsDiscoveryEvidence } from '../drivers/ws_discovery_evidence.ts';

interface SupportTraceState {
  origin: 'INTERNAL'; sessionId: string; sessionClass: 'SUPPORT_DIAGNOSTIC';
  visibility: 'SUPPORT'; purpose: 'RECEIVE_TRACE_ONLY';
  state: 'PREPARING' | 'LISTENING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  acquiredAt: string; monitoringPausedAt?: string; releasedAt?: string;
  monitoringEligibleAt?: string; error?: string; windowId?: string; cleanupPending?: boolean;
}

/** Support ownership is deliberately independent of the technician foreground snapshot. */
export class SupportTraceLease {
  private controller?: AbortController;
  private state: SupportTraceState | null = null;
  constructor(private readonly changed: () => void = () => {}) {}
  isActive() { return Boolean(this.controller); }
  snapshot() { return structuredClone(this.state); }
  begin() {
    if (this.isActive()) throw Error('Support trace is already running.');
    this.controller = new AbortController();
    const context = { origin: 'INTERNAL' as const, sessionId: crypto.randomUUID() };
    this.state = { ...context, sessionClass: 'SUPPORT_DIAGNOSTIC', visibility: 'SUPPORT', purpose: 'RECEIVE_TRACE_ONLY', state: 'PREPARING', acquiredAt: new Date().toISOString() };
    this.changed();
    return { context, signal: this.controller.signal };
  }
  paused() { this.state!.monitoringPausedAt = new Date().toISOString(); }
  scanning() { this.state!.state = 'LISTENING'; this.changed(); }
  stop(id: unknown) { if (!this.controller || id !== this.state!.sessionId) return false; this.controller.abort(); return true; }
  finish(state: 'COMPLETED' | 'CANCELLED' | 'FAILED', error?: string, evidence?: WsDiscoveryEvidence, windowId?: string) {
    this.state!.state = this.controller?.signal.aborted ? 'CANCELLED' : state;
    this.state!.error = error;
    this.state!.windowId = windowId;
    const release = () => {
      this.controller = undefined;
      this.state!.cleanupPending = false;
      this.state!.releasedAt = new Date().toISOString();
      // The enabled scheduler may run its next cycle after this lease is released.
      this.state!.monitoringEligibleAt = this.state!.releasedAt;
      this.changed();
    };
    if (error === 'SOCKET_CLOSE_NOT_CONFIRMED') {
      this.state!.cleanupPending = true;
      const check = () => {
        const trace = evidence?.snapshot().sessions.find(s => s.windowId === windowId);
        if (trace && trace.sockets.every(s => s.closedAt)) release();
        else { const timer = setTimeout(check, 250); timer.unref?.(); }
      };
      check();
    } else release();
  }
}
