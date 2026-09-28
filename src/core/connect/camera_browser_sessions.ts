import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { inspect } from 'node:util';
import { Device, IPCollisionRecord } from '../../types/index.ts';
import { decideCameraAccess } from '../../shared/camera_access.ts';
import { canonicalAnchor } from '../../shared/identity_policy.ts';
import { CameraBrowserSession, CameraRendererKind } from '../../shared/camera_renderer.ts';

export const HANDOFF_MS = 30_000;
export const BROWSER_SESSION_MS = 300_000;
export class BrowserSessionError extends Error {
  constructor() { super('Camera browser authorization is unavailable. Reopen using current device evidence.'); }
}
/** Explicit exposure is limited to the intended response/private transport boundary. */
export class BrowserSecret {
  #value: string;
  constructor(kind: 'h' | 'c' | 'i') { this.#value = `cb${kind}_${randomBytes(32).toString('base64url')}`; }
  expose() { return this.#value; }
  toJSON() { return '[REDACTED]'; }
  toString() { return '[REDACTED]'; }
  [inspect.custom]() { return '[REDACTED]'; }
}
type Context = { key: string; devices: Device[]; collisions: IPCollisionRecord[] };
type Entry = { session: CameraBrowserSession; context: string; anchor: string; digest: Buffer; phase: 'HANDOFF' | 'ACTIVE'; channel?: object };
type HostMessage = { type: 'STATUS' | 'READY' | 'FAILED' | 'NAVIGATION' | 'CLOSE'; sessionId: string; deviceId: string; token: string; canGoBack?: boolean; canGoForward?: boolean };
export interface CameraHostChannel {
  redeem(sessionId: string, deviceId: string, token: string): { session: CameraBrowserSession; channelToken: BrowserSecret };
  dispatch(message: unknown): { session: CameraBrowserSession; state: 'ACTIVE' | 'CLOSED'; canGoBack?: boolean; canGoForward?: boolean };
  disconnect(): void;
}
const displayText = (value: string | undefined) => (value || '').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 120);
const digest = (value: string) => createHash('sha256').update(value).digest();
const anchor = (device: Device) => { const a = canonicalAnchor(device.anchor); return JSON.stringify([a.macAddress, a.onvifEndpointUuid, a.serialNumber]); };

/** Runtime-only authorization store. No database writes, logging, network, vault or OS services. */
export class CameraBrowserSessions {
  #entries = new Map<string, Entry>();
  #channels = new Set<object>();
  #context: () => Context;
  #endpoint: (deviceId: string) => string;
  #now: () => number;
  constructor(context: () => Context, endpoint: (deviceId: string) => string, now = Date.now) {
    this.#context = context; this.#endpoint = endpoint; this.#now = now;
  }
  toJSON() { return {}; }
  [inspect.custom]() { return 'CameraBrowserSessions { runtime state omitted }'; }
  #approved(deviceId: string) {
    const context = this.#context();
    if (!decideCameraAccess(deviceId, context.devices, context.collisions).allowed) throw new BrowserSessionError();
    const device = context.devices.find(d => d.id === deviceId)!;
    const url = new URL(this.#endpoint(deviceId));
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== device.network.ipAddress || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new BrowserSessionError();
    return { context, device, origin: url.origin };
  }
  #create(deviceId: string, renderer: CameraRendererKind, channel?: object) {
    try {
      this.reconcile();
      if (this.#entries.size >= 128) throw new BrowserSessionError();
      const { context, device, origin } = this.#approved(deviceId), now = this.#now();
      const session: CameraBrowserSession = { version: 1, sessionId: randomUUID(), deviceId, address: device.network.ipAddress, origin,
        display: { name: displayText(device.technician?.name || device.anchor.vendor), manufacturer: displayText(device.anchor.vendor), model: displayText(device.anchor.model), identity: canonicalAnchor(device.anchor).macAddress ? 'MAC Last 6: ' + canonicalAnchor(device.anchor).macAddress!.replace(/:/g, '').slice(-6).toUpperCase() : 'Device: ' + displayText(device.id) },
        createdAt: now, expiresAt: now + (channel ? HANDOFF_MS : BROWSER_SESSION_MS), renderer };
      const secret = new BrowserSecret(channel ? 'h' : 'i');
      this.#entries.set(session.sessionId, { session, context: context.key, anchor: anchor(device), digest: digest(secret.expose()), phase: channel ? 'HANDOFF' : 'ACTIVE', channel });
      return { session: structuredClone(session), secret };
    } catch { throw new BrowserSessionError(); }
  }
  createIframe(deviceId: string) { return this.#create(deviceId, 'IFRAME'); }
  /** Trusted application only. Native issuance requires a registered private channel; no HTTP redemption endpoint. */
  createNative(deviceId: string, channel: CameraHostChannel) {
    if (!this.#channels.has(channel)) throw new BrowserSessionError();
    return this.#create(deviceId, 'WINDOWS_WEBVIEW2', channel);
  }
  #valid(entry: Entry) {
    try {
      const { context, device, origin } = this.#approved(entry.session.deviceId);
      return this.#now() < entry.session.expiresAt && context.key === entry.context && anchor(device) === entry.anchor && device.network.ipAddress === entry.session.address && origin === entry.session.origin;
    } catch { return false; }
  }
  /** Call on evidence updates and periodically; deleting a lease is irreversible. */
  reconcile() { for (const [id, entry] of this.#entries) if (!this.#valid(entry)) this.#entries.delete(id); }
  #get(id: string, deviceId: string, token: string, channel?: object, phase: Entry['phase'] = 'ACTIVE') {
    this.reconcile();
    const entry = this.#entries.get(id);
    if (!entry || entry.session.deviceId !== deviceId || entry.channel !== channel || entry.phase !== phase || typeof token !== 'string' || token.length > 128 || !timingSafeEqual(entry.digest, digest(token))) throw new BrowserSessionError();
    return entry;
  }
  iframeStatus(id: string, deviceId: string, token: string) { return structuredClone(this.#get(id, deviceId, token).session); }
  closeIframe(id: string, deviceId: string, token: string) { this.#get(id, deviceId, token); this.#entries.delete(id); }
  revoke(id: string) { this.#entries.delete(id); }
  clear() { this.#entries.clear(); this.#channels.clear(); }
  /** Server-side half only: caller must later bind this object to a verified owned private pipe. */
  createHostChannel(): CameraHostChannel {
    const channel: CameraHostChannel = Object.freeze({
      redeem: (id: string, deviceId: string, token: string) => {
        const entry = this.#get(id, deviceId, token, channel, 'HANDOFF');
        const secret = new BrowserSecret('c');
        entry.phase = 'ACTIVE'; entry.digest = digest(secret.expose()); entry.session.expiresAt = this.#now() + BROWSER_SESSION_MS;
        return { session: structuredClone(entry.session), channelToken: secret };
      },
      dispatch: (input: unknown) => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BrowserSessionError();
        const m = input as HostMessage;
        const allowed = m.type === 'NAVIGATION' ? ['type', 'sessionId', 'deviceId', 'token', 'canGoBack', 'canGoForward'] : ['type', 'sessionId', 'deviceId', 'token'];
        if (!['STATUS', 'READY', 'FAILED', 'NAVIGATION', 'CLOSE'].includes(m.type) || Object.keys(input).some(k => !allowed.includes(k)) || (m.type === 'NAVIGATION' && (typeof m.canGoBack !== 'boolean' || typeof m.canGoForward !== 'boolean'))) throw new BrowserSessionError();
        const entry = this.#get(m.sessionId, m.deviceId, m.token, channel);
        const closed = m.type === 'CLOSE' || m.type === 'FAILED';
        if (closed) this.#entries.delete(m.sessionId);
        return { session: structuredClone(entry.session), state: closed ? 'CLOSED' as const : 'ACTIVE' as const,
          ...(m.type === 'NAVIGATION' ? { canGoBack: m.canGoBack, canGoForward: m.canGoForward } : {}) };
      },
      disconnect: () => { for (const [id, e] of this.#entries) if (e.channel === channel) this.#entries.delete(id); this.#channels.delete(channel); },
    });
    this.#channels.add(channel); return channel;
  }
}
