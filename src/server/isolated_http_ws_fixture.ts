import { execFile } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { createServer } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { APPLICATION_COMPANION_PATH } from './application_companion_supervisor.ts';
import type { CompanionBootstrapAuthority } from './companion_bootstrap_authority.ts';
import type { AuthorityReceipt } from './application_session_authority.ts';
import { CompanionDeadline } from './companion_deadline.ts';

const unavailable = () => new Error('Isolated fixture unavailable.');
const event = '{"type":"FIXTURE_EVENT","value":1}';
/** Fresh key material travels only over a redirected, bounded native helper pipe. */
async function identity(signal: AbortSignal): Promise<{ key: string; cert: string }> {
  return new Promise((resolve, reject) => {
    execFile(APPLICATION_COMPANION_PATH, ['--http-fixture-identity'], {
      windowsHide: true, timeout: 5000, maxBuffer: 16384, encoding: 'utf8', signal,
      env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : [])),
    }, (error, stdout, stderr) => {
      try {
        if (error || stderr) throw unavailable();
        const value = JSON.parse(stdout);
        if (Object.keys(value).sort().join(',') !== 'cert,key' || typeof value.key !== 'string' || typeof value.cert !== 'string') throw unavailable();
        resolve(value);
      } catch { reject(unavailable()); }
    });
  });
}

/** Never imported by production. All options are trusted test composition, never request input. */
export type FixtureOptions = {
  development?: boolean;
  readDelayMs?: number;
  beforeUpgrade?: (signal: AbortSignal) => Promise<void>;
  /** Trusted lifecycle test hooks; no endpoint registration or credential access. */
  onListenRequested?: (close: () => Promise<void>) => void;
  onListening?: (port: number) => void;
};
export type OwnedFixtureBinding = Awaited<ReturnType<typeof createOwnedHttpWsFixture>>;
export function startIsolatedHttpWsFixture(owner: CompanionBootstrapAuthority, options: FixtureOptions = {}) {
  return owner.startHttpFixture(options);
}
/** Internal construction only: creates resources, never registers caller-supplied endpoints. */
export async function createOwnedHttpWsFixture(owner: CompanionBootstrapAuthority, options: FixtureOptions) {
  if (owner.boundaryEnded.aborted || !owner.companion.alive) throw unavailable();
  const material = await identity(owner.boundaryEnded);
  if (owner.boundaryEnded.aborted || !owner.companion.alive) throw unavailable();
  const pin = createHash('sha256').update(new X509Certificate(material.cert).raw).digest('hex');
  const server = createServer({ ...material, minVersion: 'TLSv1.2', maxHeaderSize: 4096,
    headersTimeout: 1500, requestTimeout: 2000, connectionsCheckingInterval: 250,
    handshakeTimeout: 1500, keepAliveTimeout: 500 });
  material.key = ''; // Drop our reference; TLS retains its in-memory key. No erasure claim.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256, perMessageDeflate: false, autoPong: false });
  const connections = new Map<Socket, Promise<void>>();
  const sockets = new Map<WebSocket, { receipt: AuthorityReceipt; deadline: CompanionDeadline; timer: ReturnType<typeof setTimeout>; sending: boolean }>();
  const work = new Map<AbortController, Promise<void>>();
  let ended = false, port = 0;
  let requests = 0, upgrades = 0;
  let sweep: ReturnType<typeof setInterval> | undefined;
  let closePromise: Promise<void> | undefined;
  let settleListen!: () => void;
  const listenSettled = new Promise<void>(resolve => { settleListen = resolve; });
  let httpClosed = false, websocketClosed = false, shutdownComplete = false;
  const lifetime = new AbortController();
  const stop = () => {
    if (closePromise) return closePromise;
    let complete!: () => void, fail!: (error: Error) => void;
    // Publish before any synchronous abort callback can reenter stop().
    closePromise = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; });
    ended = true;
    const pending = [...work.values()];
    const connected = [...connections.values()];
    lifetime.abort();
    owner.boundaryEnded.removeEventListener('abort', end);
    clearInterval(sweep);
    for (const controller of work.keys()) controller.abort();
    for (const state of sockets.values()) clearTimeout(state.timer);
    for (const socket of wss.clients) socket.terminate();
    for (const socket of connections.keys()) socket.destroy();
    const wsClosing = new Promise<void>(resolve => wss.close(() => { websocketClosed = true; resolve(); }));
    void (async () => {
      // A pending listen must settle before deciding whether an owned listener needs closing.
      await listenSettled;
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) { httpClosed = true; resolve(); return; }
        server.close(error => {
          if (error) { reject(unavailable()); return; }
          httpClosed = true; resolve();
        });
      });
      await Promise.all([wsClosing, ...pending, ...connected]);
      shutdownComplete = true; complete();
    })().catch(() => fail(unavailable()));
    return closePromise;
  };
  const end = () => { void stop().catch(() => {}); };
  owner.boundaryEnded.addEventListener('abort', end, { once: true });
  const check = (receipt: AuthorityReceipt) => {
    if (ended) throw unavailable();
    owner.authorizeFixtureReceipt(receipt);
  };
  const header = (req: IncomingMessage, name: string) => {
    const values: string[] = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() === name) values.push(req.rawHeaders[i + 1]);
    if (values.length !== 1) throw unavailable();
    return values[0];
  };
  const authenticate = (req: IncomingMessage, path: string) => {
    if (ended || req.method !== 'GET' || req.url !== path || header(req, 'host') !== `127.0.0.1:${port}`) throw unavailable();
    const origins = ['https://companion-fixture.invalid'];
    if (options.development) origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
    if (!origins.includes(header(req, 'origin'))) throw unavailable();
    if (req.headers['transfer-encoding'] !== undefined || (req.headers['content-length'] !== undefined && header(req, 'content-length') !== '0') || req.headers.cookie !== undefined) throw unavailable();
    const auth = header(req, 'authorization');
    if (!/^Bearer session_[A-Za-z0-9_-]{43}$/.test(auth)) throw unavailable();
    const receipt = owner.validateSession(auth.slice(7));
    check(receipt);
    return receipt;
  };
  const begin = () => {
    if (ended || work.size >= 2) throw unavailable();
    const controller = new AbortController();
    let complete!: () => void;
    work.set(controller, new Promise<void>(resolve => { complete = resolve; }));
    const timeout = setTimeout(() => controller.abort(), 1000);
    const deadline = new CompanionDeadline(1000);
    return { controller, live: () => { if (controller.signal.aborted || deadline.remaining() <= 0) throw unavailable(); },
      finish: () => { clearTimeout(timeout); work.delete(controller); complete(); } };
  };
  server.on('connection', stream => {
    const socket = stream as Socket;
    if (ended || connections.size >= 8) { socket.destroy(); return; }
    connections.set(socket, new Promise<void>(resolve => socket.once('close', () => {
      connections.delete(socket); resolve();
    })));
    socket.setTimeout(3000, () => socket.destroy()); socket.on('error', () => {});
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('tlsClientError', () => {});
  server.on('error', end);
  server.on('request', async (req, res) => {
    requests++;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Connection', 'close');
    let pending: ReturnType<typeof begin> | undefined;
    let disconnected: (() => void) | undefined;
    let aborted: (() => void) | undefined;
    try {
      const receipt = authenticate(req, '/proof'); pending = begin();
      const controller = pending.controller;
      disconnected = () => controller.abort(); res.once('close', disconnected);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, options.readDelayMs ?? 0);
        aborted = () => { clearTimeout(timer); reject(unavailable()); };
        controller.signal.addEventListener('abort', aborted, { once: true });
        if (controller.signal.aborted) aborted();
      });
      pending.live(); check(receipt);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"fixture":"read-only"}');
    } catch { if (!res.destroyed) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Unavailable.'); } }
    finally {
      if (disconnected) res.removeListener('close', disconnected);
      if (aborted) pending?.controller.signal.removeEventListener('abort', aborted);
      pending?.finish();
    }
  });
  server.on('upgrade', async (req, socket, head) => {
    upgrades++;
    let pending: ReturnType<typeof begin> | undefined;
    let disconnected: (() => void) | undefined;
    let aborted: (() => void) | undefined;
    try {
      const receipt = authenticate(req, '/events');
      if (sockets.size >= 2 || head.length > 256 || req.headers['sec-websocket-protocol'] !== undefined || req.headers['sec-websocket-extensions'] !== undefined) throw unavailable();
      pending = begin();
      const controller = pending.controller;
      disconnected = () => controller.abort();
      socket.once('close', disconnected);
      socket.once('end', disconnected);
      socket.once('error', disconnected);
      if (socket.destroyed || socket.readableEnded) controller.abort();
      pending.live();
      // Trusted hook exercises logout during an asynchronous upgrade without authorizing late work.
      if (options.beforeUpgrade) await Promise.race([new Promise<never>((_, reject) => {
        aborted = () => reject(unavailable());
        controller.signal.addEventListener('abort', aborted, { once: true });
        if (controller.signal.aborted) aborted();
      }), options.beforeUpgrade(controller.signal)]);
      pending.live(); check(receipt);
      if (socket.destroyed || sockets.size >= 2) throw unavailable();
      wss.handleUpgrade(req, socket, head, client => {
        check(receipt);
        const timer = setTimeout(() => client.terminate(), 2500);
        sockets.set(client, { receipt, timer, deadline: new CompanionDeadline(2500), sending: false });
        client.on('message', () => client.terminate()); // Receive-only: no client commands.
        client.on('ping', () => client.terminate());
        client.on('error', () => client.terminate());
        client.once('close', () => { clearTimeout(timer); sockets.delete(client); });
      });
    } catch {
      if (pending?.controller.signal.aborted) socket.destroy();
      else if (!socket.destroyed) socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    }
    finally {
      if (disconnected) for (const name of ['close', 'end', 'error']) socket.removeListener(name, disconnected);
      if (aborted) pending?.controller.signal.removeEventListener('abort', aborted);
      pending?.finish();
    }
  });
  sweep = setInterval(() => {
    if (!owner.companion.alive || owner.boundaryEnded.aborted) { end(); return; }
    for (const [socket, state] of sockets) {
      try { check(state.receipt); if (state.deadline.remaining() <= 0) throw unavailable(); }
      catch { socket.terminate(); }
    }
  }, 50);
  sweep.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = () => { settleListen(); reject(unavailable()); };
      server.once('error', failed);
      try {
        server.listen({ port: 0, host: '127.0.0.1', backlog: 8 }, () => {
          server.removeListener('error', failed);
          settleListen();
          const address = server.address();
          if (!address || typeof address === 'string') { reject(unavailable()); return; }
          port = address.port;
          try { options.onListening?.(port); resolve(); } catch { reject(unavailable()); }
        });
      } catch { server.removeListener('error', failed); settleListen(); reject(unavailable()); return; }
      try { options.onListenRequested?.(stop); } catch { reject(unavailable()); }
    });
    const address = server.address();
    if (!address || typeof address === 'string' || ended || owner.boundaryEnded.aborted) throw unavailable();
    port = address.port;
  } catch { clearInterval(sweep); owner.boundaryEnded.removeEventListener('abort', end); await stop(); throw unavailable(); }
  const endpoint = Object.freeze({ port, pin });
  const fixture = Object.freeze({ endpoint,
    emit() {
      let sent = 0;
      for (const [socket, state] of sockets) {
        try {
          check(state.receipt);
          if (state.deadline.remaining() <= 0 || socket.bufferedAmount > 256 || socket.readyState !== WebSocket.OPEN) throw unavailable();
          if (state.sending) continue; // Drop synthetic events rather than accumulating a queue.
          state.sending = true;
          socket.send(event, error => { state.sending = false; if (error) socket.terminate(); }); sent++;
        } catch { socket.terminate(); }
      }
      return sent;
    },
    snapshot: () => ({ sockets: sockets.size, queued: [...sockets.values()].filter(state => state.sending).length,
      pending: work.size, connections: connections.size, websocketClients: wss.clients.size,
      listening: server.listening, httpClosed, websocketClosed, shutdownComplete, requests, upgrades, ended }),
    close: stop,
  });
  // A separate private snapshot is consumed only by the creating owner's credential path.
  return Object.freeze({ fixture, endpoint: Object.freeze({ port, pin }), ended: lifetime.signal });
}
