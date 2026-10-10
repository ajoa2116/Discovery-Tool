import type { IncomingMessage } from 'node:http';
import type { RequestHandler, Response } from 'express';
import { WebSocket } from 'ws';
import { httpHostAllowed } from './http_host_validation.ts';
import type { CompanionBootstrapAuthority } from './companion_bootstrap_authority.ts';
import type { AuthorityReceipt } from './application_session_authority.ts';

const unavailable = () => new Error('Application authentication unavailable.');
const MAX_CLIENTS = 2;
const MAX_EVENT_BYTES = 256 * 1024;

/** Trusted server composition only. No registration endpoint, environment token,
 * browser bootstrap, or mutable owner replacement. Production currently supplies no owner. */
export class ProductionAuthenticationBoundary {
  #owner?: CompanionBootstrapAuthority;
  #origins: ReadonlySet<string>;
  #ended = false;
  #upgrades = new WeakMap<IncomingMessage, AuthorityReceipt>();
  #clients = new Map<WebSocket, { receipt: AuthorityReceipt; sending: boolean }>();
  #responses = new Set<Response>();
  #sweep?: ReturnType<typeof setInterval>;
  constructor(options: { owner?: CompanionBootstrapAuthority; development?: boolean } = {}) {
    this.#owner = options.owner;
    this.#origins = new Set(['http://localhost:3001', 'http://127.0.0.1:3001',
      ...(options.development ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])]);
    this.#owner?.boundaryEnded.addEventListener('abort', this.dispose, { once: true });
    if (this.#owner?.boundaryEnded.aborted) this.dispose();
  }
  #header(req: IncomingMessage, name: string) {
    const values: string[] = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      if (req.rawHeaders[i].toLowerCase() === name) values.push(req.rawHeaders[i + 1]);
    if (values.length !== 1) throw unavailable();
    return values[0];
  }
  #authorize(receipt: AuthorityReceipt) {
    if (this.#ended || !this.#owner || this.#owner.boundaryEnded.aborted) throw unavailable();
    // The owner checks server activation, receipt identity, elapsed/absolute expiry,
    // logout and process/IPC loss. Native IsActive alone confers no authority.
    this.#owner.authorizeFixtureReceipt(receipt);
  }
  #authenticate(req: IncomingMessage) {
    if (this.#ended || !this.#owner || !httpHostAllowed(req.rawHeaders) ||
      !this.#origins.has(this.#header(req, 'origin')) || req.headers.cookie !== undefined) throw unavailable();
    const header = this.#header(req, 'authorization');
    if (!/^Bearer session_[A-Za-z0-9_-]{43}$/.test(header)) throw unavailable();
    const receipt = this.#owner.validateSession(header.slice(7));
    this.#authorize(receipt);
    return receipt; // Retain metadata only, never the bearer string.
  }
  readonly http: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    let receipt: AuthorityReceipt;
    try { receipt = this.#authenticate(req); }
    catch { res.status(401).json({ error: 'Application authentication unavailable.' }); return; }
    this.#responses.add(res);
    const finished = () => {
      this.#responses.delete(res); res.removeListener('finish', finished); res.removeListener('close', finished);
    };
    res.once('finish', finished); res.once('close', finished);
    const live = () => {
      try { this.#authorize(receipt); return true; } catch { res.destroy(); return false; }
    };
    // Recheck at actual output, even if expiry timers have not run. This guards
    // responses, not physical operations: future handlers must also honor cancellation.
    const write = res.write.bind(res), end = res.end.bind(res), writeHead = res.writeHead.bind(res);
    const flushHeaders = res.flushHeaders.bind(res);
    res.write = ((...args: Parameters<typeof res.write>) => live() ? write(...args) : false) as typeof res.write;
    res.end = ((...args: Parameters<typeof res.end>) => live() ? end(...args) : res) as typeof res.end;
    res.writeHead = ((...args: Parameters<typeof res.writeHead>) => live() ? writeHead(...args) : res) as typeof res.writeHead;
    res.flushHeaders = () => { if (live()) flushHeaders(); };
    next();
  };
  verifyUpgrade(req: IncomingMessage) {
    this.#upgrades.delete(req);
    try {
      if (req.method !== 'GET' || req.url !== '/ws' || this.#clients.size >= MAX_CLIENTS ||
        req.headers['sec-websocket-protocol'] !== undefined || req.headers['sec-websocket-extensions'] !== undefined ||
        req.headers['transfer-encoding'] !== undefined ||
        (req.headers['content-length'] !== undefined && this.#header(req, 'content-length') !== '0')) throw unavailable();
      this.#upgrades.set(req, this.#authenticate(req)); return true;
    } catch { return false; }
  }
  accept(socket: WebSocket, req: IncomingMessage) {
    const receipt = this.#upgrades.get(req); this.#upgrades.delete(req);
    try {
      if (!receipt || this.#clients.size >= MAX_CLIENTS) throw unavailable();
      this.#authorize(receipt);
      this.#clients.set(socket, { receipt, sending: false });
      socket.on('message', () => socket.terminate()); // Event subscriptions are receive-only.
      socket.on('ping', () => socket.terminate());
      socket.on('error', () => socket.terminate());
      socket.once('close', () => {
        this.#clients.delete(socket);
        if (!this.#clients.size) { clearInterval(this.#sweep); this.#sweep = undefined; }
      });
      if (!this.#sweep) {
        this.#sweep = setInterval(() => {
          for (const [client, state] of this.#clients) {
            try { this.#authorize(state.receipt); } catch { client.terminate(); }
          }
        }, 250);
        this.#sweep.unref();
      }
      return true;
    } catch { socket.terminate(); return false; }
  }
  send(socket: WebSocket, message: string) {
    try {
      const state = this.#clients.get(socket);
      if (!state) throw unavailable();
      this.#authorize(state.receipt);
      if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_EVENT_BYTES ||
        Buffer.byteLength(message) > MAX_EVENT_BYTES) throw unavailable();
      if (state.sending) return false;
      state.sending = true;
      socket.send(message, error => { state.sending = false; if (error) socket.terminate(); });
      return true;
    } catch { socket.terminate(); return false; }
  }
  readonly dispose = () => {
    if (this.#ended) return;
    this.#ended = true;
    this.#owner?.boundaryEnded.removeEventListener('abort', this.dispose);
    clearInterval(this.#sweep); this.#sweep = undefined;
    for (const response of this.#responses) response.destroy();
    for (const client of this.#clients.keys()) client.terminate();
  };
}
