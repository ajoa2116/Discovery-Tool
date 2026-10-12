// Test composition only. Never imported by backend startup; no native owner proof.
import { execFile } from 'node:child_process';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, request, type Server, type RequestOptions } from 'node:https';
import type { Socket } from 'node:net';
import type { ClientRequest } from 'node:http';
import type { Duplex } from 'node:stream';
import type { PeerCertificate } from 'node:tls';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { createBackendInstanceIdentity } from '../../server/backend_identity_handoff.ts';
import { CompanionDeadline } from '../../server/companion_deadline.ts';
import { ProductionAuthenticationBoundary } from '../../server/production_authentication_boundary.ts';

const unavailable = () => new Error('Synthetic TLS binding unavailable.');
const reserved = new WeakSet<object>();
const refs = new WeakMap<object, { server: Server; ws: WebSocketServer; session: object; binding: object }>();
type Options = { signal?: AbortSignal; elapsedClock?: () => number; wallClock?: () => number;
  onListenRequestedForTest?: () => void;
  bridge?: { ended: AbortSignal; acquireTLS(): { cert: string; key: string };
    bind(server: Server, ws: WebSocketServer, session: object, port: number): Promise<unknown>;
    assert(server: Server, ws: WebSocketServer, session: object): void; revoke(): void } };
// Reuse the existing native test-only certificate generator; bounded redirected
// output is consumed in memory, never written or logged. No real providers run.
async function tlsIdentity(): Promise<{ cert: string; key: string }> {
  const executable = new URL('../../../native/ApplicationCompanion/bin/Release/net10.0-windows/ApplicationCompanion.exe', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  return new Promise((resolve, reject) => execFile(fileURLToPath(executable), ['--http-fixture-identity'], {
    windowsHide: true, timeout: 5000, maxBuffer: 16384, encoding: 'utf8',
    env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : [])),
  }, (error, stdout, stderr) => {
    try {
      if (error || stderr) throw unavailable();
      const value = JSON.parse(stdout);
      if (Object.keys(value).sort().join(',') !== 'cert,key' || typeof value.cert !== 'string' || typeof value.key !== 'string') throw unavailable();
      resolve(value);
    } catch { reject(unavailable()); }
  }));
}

// This is deliberately not a CompanionBootstrapAuthority or AuthorityReceipt.
// Reusing their brands would falsely suggest completion of native authentication.
class ExactFixtureBinding {
  #phase: 'pending'|'confirming'|'bound'|'terminal' = 'pending';
  #binding?: object;
  #deadline: CompanionDeadline;
  #ended = new AbortController();
  constructor(private server: Server, private ws: WebSocketServer, private session: object,
    private port: number, expiresAt: number, options: Options) {
    this.#deadline = new CompanionDeadline(10000, options.elapsedClock, expiresAt, options.wallClock);
    this.live();
    if ([server, ws, session].some(o => reserved.has(o))) throw unavailable();
    for (const object of [server, ws, session]) reserved.add(object);
  }
  get ended() { return this.#ended.signal; }
  live() {
    const address = this.server.address();
    if (this.#phase === 'terminal' || this.#deadline.remaining() <= 0 || !this.server.listening ||
      !address || typeof address === 'string' || address.address !== '127.0.0.1' || address.port !== this.port) {
      this.revoke(); throw unavailable();
    }
  }
  confirm(server: unknown, ws: unknown, session: unknown) {
    if (this.#phase !== 'pending') { this.revoke(); throw unavailable(); }
    this.#phase = 'confirming'; // One use, before clocks or callbacks can reenter.
    try {
      if (server !== this.server || ws !== this.ws || session !== this.session) throw unavailable();
      this.live(); if (this.#phase !== 'confirming') throw unavailable();
      this.#binding = Object.freeze({ productionAuthority: false, nativeOwnerAuthenticated: false });
      this.#phase = 'bound'; return this.#binding;
    } catch { this.revoke(); throw unavailable(); }
  }
  assert(server: unknown, ws: unknown, session: unknown, binding: unknown) {
    try {
      if (this.#phase !== 'bound' || server !== this.server || ws !== this.ws || session !== this.session || binding !== this.#binding) throw unavailable();
      this.live(); if (this.#phase !== 'bound') throw unavailable();
    } catch { this.revoke(); throw unavailable(); }
  }
  revoke() { if (this.#phase === 'terminal') return; this.#phase = 'terminal'; this.#binding = undefined; this.#ended.abort(); }
}

export async function syntheticTlsFixture(options: Options = {}) {
  if (options.signal?.aborted) throw unavailable();
  const material = options.bridge ? options.bridge.acquireTLS() : await tlsIdentity();
  if (options.signal?.aborted) { material.key = ''; throw unavailable(); }
  const { X509Certificate } = await import('node:crypto');
  const pin = createHash('sha256').update(new X509Certificate(material.cert).raw).digest('hex');
  const certificate = material.cert; // Public identity; no private key in returned state.
  const app = express(), authentication = new ProductionAuthenticationBoundary();
  app.use('/api', authentication.http);
  const server = createServer({ ...material, minVersion: 'TLSv1.2', maxHeaderSize: 4096,
    handshakeTimeout: 1500, headersTimeout: 1500, requestTimeout: 2000, keepAliveTimeout: 500 }, app);
  material.key = ''; // TLS retains its key; no erasure claim.
  const ws = new WebSocketServer({ noServer: true, maxPayload: 256, perMessageDeflate: false, autoPong: false });
  const sockets = new Set<Socket>();
  const socketClosed = new Map<Socket, Promise<void>>();
  const requests = new Map<ClientRequest, Promise<void>>(), clients = new Map<WebSocket, Promise<void>>();
  let settleListen!: () => void;
  const listenSettled = new Promise<void>(resolve => { settleListen = resolve; });
  let binding: ExactFixtureBinding | undefined, candidate: object | undefined, port = 0;
  let stopped = false, shutdownComplete = false, closing: Promise<void> | undefined;
  let syntheticReads = 0, syntheticUpgrades = 0;
  let nativeReady = false;
  let sweep: ReturnType<typeof setInterval> | undefined;
  const ended = new AbortController();
  const wall = options.wallClock ?? Date.now;
  const session = Object.freeze({ id: randomUUID(), expiresAt: wall() + 10000, productionAuthority: false });
  let listenerIdentity: ReturnType<typeof createBackendInstanceIdentity> | undefined;
  const live = () => {
    if (stopped || !binding || !candidate || options.signal?.aborted) throw unavailable();
    binding.assert(server, ws, session, candidate);
    if (nativeReady) options.bridge?.assert(server, ws, session);
  };
  const close = () => {
    if (closing) return closing;
    let resolve!: () => void, reject!: (error: Error) => void;
    closing = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    stopped = true; // Publish terminal state and cleanup promise before callbacks.
    ended.abort(); binding?.revoke(); clearInterval(sweep);
    options.signal?.removeEventListener('abort', end);
    options.bridge?.ended.removeEventListener('abort', end);
    binding?.ended.removeEventListener('abort', end);
    authentication.dispose();
    options.bridge?.revoke();
    const requestClosed = [...requests.values()], connectionClosed = [...socketClosed.values()];
    for (const req of requests.keys()) req.destroy(unavailable());
    const clientClosed = [...clients.values()];
    for (const client of clients.keys()) client.terminate();
    for (const client of ws.clients) client.terminate();
    for (const socket of sockets) socket.destroy();
    const wsClosed = new Promise<void>(yes => ws.close(() => yes()));
    const httpClosed = listenSettled.then(() => new Promise<void>((yes, no) => {
      if (!server.listening) return yes();
      server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? no(unavailable()) : yes());
      server.closeAllConnections();
    }));
    void Promise.all([wsClosed, httpClosed, ...clientClosed, ...requestClosed, ...connectionClosed]).then(async () => {
      // Include accepted/client close events that raced the initial teardown snapshot.
      await Promise.all([...socketClosed.values(), ...requests.values(), ...clients.values()]);
      server.removeListener('connection', connected); server.removeListener('close', end);
      server.removeListener('error', end); server.removeListener('upgrade', upgrade);
      ws.removeListener('close', end); ws.removeListener('error', end);
      app.removeAllListeners(); shutdownComplete = true; resolve();
    }, () => reject(unavailable()));
    return closing;
  };
  const end = () => { void close().catch(() => {}); };
  const connected = (socket: Socket) => {
    const reject = stopped || sockets.size >= 8;
    sockets.add(socket);
    socketClosed.set(socket, new Promise<void>(resolve => socket.once('close', () => {
      sockets.delete(socket); socketClosed.delete(socket); resolve();
    })));
    socket.setTimeout(2000, () => socket.destroy());
    if (reject) socket.destroy();
  };
  server.on('connection', connected); server.once('close', end); server.once('error', end);
  ws.once('close', end); ws.once('error', end);
  options.signal?.addEventListener('abort', end, { once: true });
  options.bridge?.ended.addEventListener('abort', end, { once: true });
  app.get('/fixture/read', (_req, res) => {
    try { live(); syntheticReads++; res.json({ fixture: 'synthetic-read-only' }); }
    catch { res.status(403).end(); }
  });
  const upgrade = (req: import('node:http').IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      live();
      if (req.url === '/ws' && !authentication.verifyUpgrade(req)) throw unavailable();
      if (req.url !== '/fixture/events' || ws.clients.size >= 2 || head.length > 256) throw unavailable();
      syntheticUpgrades++;
      ws.handleUpgrade(req, socket, head, client => {
        try { live(); client.on('error', () => client.terminate()); client.on('message', () => client.terminate());
          client.send('{"fixture":"synthetic-event"}'); }
        catch { client.terminate(); }
      });
    } catch { socket.destroy(); }
  };
  server.on('upgrade', upgrade);
  try {
    await new Promise<void>((resolve, reject) => {
      const error = () => { settleListen(); server.removeListener('listening', ready); reject(unavailable()); };
      const ready = () => { settleListen(); server.removeListener('error', error); resolve(); };
      server.once('error', error); server.once('listening', ready);
      try { server.listen(0, '127.0.0.1'); }
      catch { settleListen(); server.removeListener('error', error); server.removeListener('listening', ready); reject(unavailable()); }
      // A test callback failure must still await the real listen settlement.
      try { options.onListenRequestedForTest?.(); } catch { reject(unavailable()); }
    });
    if (stopped || options.signal?.aborted) throw unavailable();
    const address = server.address(); if (!address || typeof address === 'string') throw unavailable(); port = address.port;
    listenerIdentity = createBackendInstanceIdentity(server); // Original 7Q listener brand, created privately.
    binding = new ExactFixtureBinding(server, ws, session, port, session.expiresAt, options);
    candidate = binding.confirm(server, ws, session);
    binding.ended.addEventListener('abort', end, { once: true });
    sweep = setInterval(() => { try { live(); } catch { end(); } }, 50); sweep.unref();
    if (options.bridge) {
      await options.bridge.bind(server, ws, session, port);
      if (options.bridge.ended.aborted || stopped) throw unavailable();
      nativeReady = true; live();
    }
  } catch { await close(); throw unavailable(); }
  const verify = (expected: string) => (_host: string, peer: PeerCertificate) => {
    try { live(); if (!/^[a-f0-9]{64}$/.test(expected) || !peer.raw ||
      !timingSafeEqual(createHash('sha256').update(peer.raw).digest(), Buffer.from(expected, 'hex'))) throw unavailable(); live(); }
    catch { return unavailable(); }
  };
  const httpProbe = (expected = pin, path = '/fixture/read', destination = port) => {
    live();
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: destination, path, method: 'GET', agent: false,
        ca: certificate, rejectUnauthorized: true, checkServerIdentity: verify(expected), timeout: 1500 }, res => {
        let bytes = 0, body = '';
        res.on('data', chunk => { bytes += chunk.length; if (bytes > 256) res.destroy(unavailable()); else body += chunk; });
        res.once('error', () => { end(); reject(unavailable()); }); res.once('end', () => {
          try { live(); resolve({ status: res.statusCode!, body }); } catch { reject(unavailable()); }
        });
      });
      requests.set(req, new Promise<void>(yes => req.once('close', () => { requests.delete(req); yes(); })));
      req.once('timeout', () => req.destroy(unavailable())); req.once('error', () => { end(); reject(unavailable()); }); req.end();
    });
  };
  const wsProbe = (expected = pin, path = '/fixture/events', hold = false) => {
    live();
    return new Promise<string>((resolve, reject) => {
      // ws forwards TLS options to Node HTTPS; retain Node's Error/undefined
      // certificate callback contract and type the WS-specific options separately.
      const clientOptions: RequestOptions & Pick<WebSocket.ClientOptions, 'handshakeTimeout'|'perMessageDeflate'> = {
        ca: certificate, rejectUnauthorized: true,
        checkServerIdentity: verify(expected), handshakeTimeout: 1500, perMessageDeflate: false };
      const client = new WebSocket(`wss://127.0.0.1:${port}${path}`, clientOptions);
      clients.set(client, new Promise<void>(yes => client.once('close', () => { clients.delete(client); yes(); })));
      const timer = setTimeout(() => { client.terminate(); reject(unavailable()); }, 1800);
      client.once('error', () => { clearTimeout(timer); if (path === '/fixture/events') end(); reject(unavailable()); });
      client.once('message', data => {
        try { live(); const value = data.toString(); clearTimeout(timer);
          if (!hold) client.close(); resolve(value); }
        catch { client.terminate(); clearTimeout(timer); reject(unavailable()); }
      });
      client.once('close', () => clearTimeout(timer));
    });
  };
  const fixture = Object.freeze({ pin, ended: ended.signal, close,
    loseListenerForTest: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }),
    loseWsForTest: () => new Promise<void>(resolve => ws.close(() => resolve())),
    probeHttp: () => httpProbe(), probeWs: () => wsProbe(), holdWsForTest: () => wsProbe(pin, '/fixture/events', true),
    apiDenial: () => httpProbe(pin, '/api/system/about'), wsDenial: () => wsProbe(pin, '/ws'),
    wrongPin: () => httpProbe('0'.repeat(64)), wrongWsPin: () => wsProbe('0'.repeat(64)),
    // Private test composition has the exact refs; no registration endpoint or native proof API.
    substituteForTest(kind: 'server'|'ws'|'session'|'binding', other?: object) {
      const foreign = other ? refs.get(other) : undefined;
      binding!.assert(kind === 'server' ? foreign?.server ?? {} : server, kind === 'ws' ? foreign?.ws ?? {} : ws,
        kind === 'session' ? foreign?.session ?? { ...session } : session, kind === 'binding' ? foreign?.binding ?? { ...candidate } : candidate);
    },
    replayForTest() { binding!.confirm(server, ws, session); },
    endpointSubstitutionForTest(other: object) {
      const address = refs.get(other)?.server.address(); if (!address || typeof address === 'string') throw unavailable();
      return httpProbe(pin, '/fixture/read', address.port);
    },
    assertLive: live,
    snapshot: () => ({ productionAuthority: false, nativeOwnerAuthenticated: nativeReady && !stopped, completeClosure: false,
      pin, ended: ended.signal.aborted, listening: server.listening, websocketClients: ws.clients.size, connections: sockets.size,
      pendingRequests: requests.size, pendingClients: clients.size,
      syntheticReads, syntheticUpgrades,
      sweepActive: !!sweep && !stopped, shutdownComplete, listenerRegistered: !!listenerIdentity,
      upgradeHandlers: server.listenerCount('upgrade') }),
  });
  refs.set(fixture, { server, ws, session, binding: candidate });
  return fixture;
}
