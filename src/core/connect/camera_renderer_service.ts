import { CameraBrowserSessions, BrowserSecret } from './camera_browser_sessions.ts';
import { checkNativeCapability, NativeCapability } from './native_camera_capability.ts';
import { launchNativeProof, NativeProofEvent } from './native_camera_proof.ts';
import { CameraBrowserSession, CameraRendererSnapshot, NativeCommand, NativeWorkspaceCode } from '../../shared/camera_renderer.ts';

type NativeHandle = ReturnType<typeof launchNativeProof>;
/** In-process fixture dependency only. Production composition supplies NO fixture authority.
 * HTTP, device metadata, environment variables and technician preferences cannot supply it. */
export interface ControlledFixtureAuthority { permits(deviceId: string, origin: string): boolean }
type Entry = { session: CameraBrowserSession; secret: BrowserSecret; snapshot: CameraRendererSnapshot; handle?: NativeHandle };
const snapshot = (code: NativeWorkspaceCode): CameraRendererSnapshot => ({ code, canGoBack: false, canGoForward: false });

/** Application renderer orchestration. Native secrets remain inside Phase 17C/17D. */
export class CameraRendererService {
  #disposed = false;
  #entries = new Map<string, Entry>();
  #pending = new Map<string, Promise<{ session: CameraBrowserSession; controlToken: string; snapshot: CameraRendererSnapshot }>>();
  constructor(private sessions: CameraBrowserSessions, private deps: {
    capability?: () => Promise<NativeCapability>;
    fixtureAuthority?: ControlledFixtureAuthority;
    launch?: typeof launchNativeProof;
  } = {}) {}
  toJSON() { return {}; }
  async open(deviceId: string) {
    if (this.#disposed || typeof deviceId !== 'string' || !deviceId || deviceId.length > 256) throw Error('Camera authorization unavailable.');
    const pending = this.#pending.get(deviceId); if (pending) return pending;
    const operation = this.#open(deviceId);
    this.#pending.set(deviceId, operation);
    try { return await operation; } finally { this.#pending.delete(deviceId); }
  }
  #result(entry: Entry) { return { session: structuredClone(entry.session), controlToken: entry.secret.expose(), snapshot: { ...entry.snapshot } }; }
  async #open(deviceId: string) {
    this.reconcile();
    for (const entry of this.#entries.values()) if (entry.session.deviceId === deviceId && entry.handle && ['PREPARING', 'OPENING', 'ACTIVE'].includes(entry.snapshot.code)) {
      this.sessions.iframeStatus(entry.session.sessionId, deviceId, entry.secret.expose());
      entry.handle.command('FOCUS'); return this.#result(entry);
    }
    // Phase 6 is enforced before even probing the native capability.
    const lease = this.sessions.createIframe(deviceId);
    try {
      const capability = await (this.deps.capability ?? checkNativeCapability)();
      if (this.#disposed) throw Error();
      this.sessions.iframeStatus(lease.session.sessionId, deviceId, lease.secret.expose());
      const allowedFixture = capability.available && this.deps.fixtureAuthority?.permits(deviceId, lease.session.origin) === true;
      // INTENTIONAL PRODUCTION GATE: no real-camera/native launch authorization exists.
      // Only test composition can attest an exact server-owned local fixture identity/origin.
      const code: NativeWorkspaceCode = capability.available ? allowedFixture ? 'PREPARING' : 'GATED' : capability.code === 'UNELEVATED_REQUIRED' ? 'UNELEVATED_REQUIRED' : capability.code === 'RUNTIME_UNAVAILABLE' ? 'RUNTIME_UNAVAILABLE' : capability.code === 'PROTOCOL_UNAVAILABLE' ? 'SECURITY_BLOCKED' : 'HOST_UNAVAILABLE';
      const entry: Entry = { session: { ...lease.session, renderer: allowedFixture ? 'WINDOWS_WEBVIEW2' : 'IFRAME' }, secret: lease.secret, snapshot: snapshot(code) };
      this.#entries.set(entry.session.sessionId, entry);
      if (code === 'SECURITY_BLOCKED' || code === 'UNELEVATED_REQUIRED') { entry.session.renderer = 'WINDOWS_WEBVIEW2'; return this.#result(entry); }
      if (allowedFixture) {
        // Recheck the immutable fixture authority immediately before private handoff.
        if (!this.deps.fixtureAuthority!.permits(deviceId, entry.session.origin)) throw Error();
        entry.handle = (this.deps.launch ?? launchNativeProof)(this.sessions, deviceId, { onEvent: event => this.#event(entry, event) });
        void entry.handle.done.then(result => {
          entry.handle = undefined;
          if (['PREPARING', 'OPENING', 'ACTIVE'].includes(entry.snapshot.code)) entry.snapshot = snapshot(result.closed ? 'CLOSED' : 'SECURITY_BLOCKED');
        });
      }
      return this.#result(entry);
    } catch {
      this.sessions.revoke(lease.session.sessionId);
      const entry = this.#entries.get(lease.session.sessionId); entry?.handle?.close(); this.#entries.delete(lease.session.sessionId);
      throw Error('Camera authorization unavailable.');
    }
  }
  #event(entry: Entry, event: NativeProofEvent) {
    if (['SECURITY_BLOCKED', 'CERTIFICATE_REJECTED', 'NAVIGATION_BLOCKED', 'CLOSED', 'FAILED', 'RUNTIME_UNAVAILABLE'].includes(entry.snapshot.code)) return;
    if (event.code === 'HISTORY') { entry.snapshot.canGoBack = event.canGoBack === true; entry.snapshot.canGoForward = event.canGoForward === true; return; }
    const code: NativeWorkspaceCode = event.code === 'INITIALIZED' || event.code === 'LOADING' ? 'OPENING' : ['NAVIGATED', 'PAGE_RENDERED'].includes(event.code) ? 'ACTIVE' : event.code === 'CERTIFICATE_REJECTED' ? 'CERTIFICATE_REJECTED' : event.code === 'NAVIGATION_BLOCKED' ? 'NAVIGATION_BLOCKED' : event.code === 'RUNTIME_UNAVAILABLE' ? 'RUNTIME_UNAVAILABLE' : ['BOOTSTRAP_FAILED', 'AUTHORIZATION_ENDED'].includes(event.code) ? 'SECURITY_BLOCKED' : 'FAILED';
    entry.snapshot = { ...entry.snapshot, code };
  }
  #get(id: string, deviceId: string, token: string) {
    const entry = this.#entries.get(id);
    this.reconcile();
    try { this.sessions.iframeStatus(id, deviceId, token); if (!entry || !this.#entries.has(id) || entry.session.deviceId !== deviceId) throw Error(); }
    catch { throw Error('Camera authorization unavailable.'); }
    return entry;
  }
  status(id: string, deviceId: string, token: string) { const e = this.#get(id, deviceId, token); return { session: structuredClone(e.session), snapshot: { ...e.snapshot } }; }
  command(id: string, deviceId: string, token: string, command: NativeCommand) {
    const e = this.#get(id, deviceId, token);
    if (!['FOCUS', 'REFRESH', 'BACK', 'FORWARD'].includes(command) || !e.handle || !['ACTIVE', 'OPENING', 'PREPARING'].includes(e.snapshot.code) || command === 'BACK' && !e.snapshot.canGoBack || command === 'FORWARD' && !e.snapshot.canGoForward) throw Error('Camera command unavailable.');
    e.handle.command(command);
  }
  close(id: string, deviceId: string, token: string) { const e = this.#get(id, deviceId, token); e.handle?.close(); e.snapshot = snapshot('CLOSED'); this.sessions.revoke(id); this.#entries.delete(id); }
  reconcile() {
    for (const [id, e] of this.#entries) {
      try { this.sessions.iframeStatus(id, e.session.deviceId, e.secret.expose()); }
      catch { e.handle?.close(); this.#entries.delete(id); }
    }
  }
  dispose() { this.#disposed = true; for (const [id, e] of this.#entries) { e.handle?.close(); this.sessions.revoke(id); } this.#entries.clear(); }
}
