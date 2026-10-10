import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import { createServer, request, type IncomingMessage } from 'node:http';
import { connect } from 'node:net';
import { readFile } from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import { ProductionAuthenticationBoundary } from '../server/production_authentication_boundary.ts';
import { validateHttpHost } from '../server/http_host_validation.ts';
import { CompanionBootstrapAuthority } from '../server/companion_bootstrap_authority.ts';
import { APPLICATION_SESSION_MS } from '../server/application_session_authority.ts';
import type { CompanionLifetime, CompanionLoss } from '../server/application_companion_supervisor.ts';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { resolve, promise }; };
// Trusted private-channel model only: never a public authority injection or browser token flow.
function trustedOwner(holdActivation = false) {
  let bootstrap = '', token = '', alive = true, elapsed = 0;
  const activating = deferred(), activation = deferred();
  let lose!: (reason: CompanionLoss) => void;
  const lost = new Promise<CompanionLoss>(resolve => { lose = resolve; });
  const transport: CompanionLifetime = {
    pid: 1, brokerPid: 2, generation: 1, get alive() { return alive; }, lost,
    closed: lost.then(() => true), failureCode: lost.then(() => undefined),
    async deliverBootstrap(input) { bootstrap = JSON.parse(input).token; }, async activateBootstrap() {},
    async requestBootstrapRedemption() { return bootstrap; }, async deliverSession(value) { token = value; },
    async activateSession() { activating.resolve(); if (holdActivation) await activation.promise; },
    async logoutSession() {}, async shutdown() { alive = false; lose('closed'); },
  };
  const owner = Reflect.construct(CompanionBootstrapAuthority, [transport, Date.now, () => elapsed]) as CompanionBootstrapAuthority;
  return { owner, token: () => token, activating, activation,
    expire: () => { elapsed = APPLICATION_SESSION_MS; }, lose: () => { alive = false; lose('failed'); } };
}
async function activeOwner() {
  const f = trustedOwner(); await f.owner.issueBootstrap(); await f.owner.deliverSession(); return f;
}
async function serverFixture(boundary = new ProductionAuthenticationBoundary(), beforeResponse?: () => Promise<void> | void) {
  const app = express(); let entered = 0, operations = 0, subscriptions = 0;
  app.use(validateHttpHost); app.use('/api', boundary.http);
  app.use((_req, _res, next) => { entered++; next(); });
  app.use(cors()); app.use(express.json());
  app.use('/api', async (_req, res) => {
    operations++; await beforeResponse?.(); res.json({ protected: true });
  });
  app.get('/', (_req, res) => res.type('html').send('<html>Public static shell</html>'));
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256, perMessageDeflate: false,
    verifyClient: (info: { req: IncomingMessage }) => boundary.verifyUpgrade(info.req) });
  wss.on('connection', (socket, req) => { if (boundary.accept(socket, req)) subscriptions++; });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const headers = (token?: string) => ({ Host: 'localhost:3001', Origin: 'http://localhost:3001',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  return { boundary, wss, port: address.port, state: () => ({ entered, operations, subscriptions }),
    http(path = '/api/project', method = 'GET', extra: Record<string, string | string[]> = {}, body = '') {
      return new Promise<{ status: number; body: string; headers: IncomingMessage['headers'] }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: address.port, path, method,
          headers: { ...headers(), Connection: 'close', ...extra }, timeout: 2000 }, res => {
          let output = ''; res.on('data', chunk => { output += String(chunk); });
          res.on('end', () => resolve({ status: res.statusCode!, body: output, headers: res.headers }));
        });
        req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Fixture timeout'))); req.end(body);
      });
    },
    ws(token?: string, extra: Record<string, string> = {}, path = '/ws') {
      const client = new WebSocket(`ws://127.0.0.1:${address.port}${path}`, {
        headers: { ...headers(token), ...extra }, handshakeTimeout: 2000, perMessageDeflate: false,
      }); client.on('error', () => {}); return client;
    },
    async close() {
      boundary.dispose(); for (const client of wss.clients) client.terminate();
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
const opened = (client: WebSocket) => new Promise<void>((resolve, reject) => {
  client.once('open', resolve); client.once('error', () => reject(new Error('Subscription denied')));
});
const closed = (client: WebSocket) => new Promise<void>(resolve => {
  if (client.readyState === WebSocket.CLOSED) resolve(); else client.once('close', () => resolve());
});

test('production without a trusted owner denies every API method before CORS, parsing or effects', async () => {
  const f = await serverFixture();
  try {
    const paths = ['/api/project', '/API/project', '/api/tasks', '/api/pair/confirm', '/api/vault/credentials',
      '/api/connect/device/open', '/api/camera-browser/open', '/api/reports/export/json', '/api/system/about', '/api/new-route'];
    for (const path of paths) for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
      const result = await f.http(path, method, { Authorization: `Bearer session_${'x'.repeat(43)}`,
        'Content-Type': 'application/json' }, '{invalid');
      assert.equal(result.status, 401); assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.headers['access-control-allow-origin'], undefined);
      assert.doesNotMatch(result.body, /session_|invalid|stack/i);
      assert.deepEqual(f.state(), { entered: 0, operations: 0, subscriptions: 0 });
    }
    assert.equal((await f.http('/', 'GET')).status, 200);
  } finally { await f.close(); }
});

test('valid Host and Origin, query tokens, cookies and WS subprotocols cannot replace owner authentication', async () => {
  const f = await serverFixture(); const token = `session_${'a'.repeat(43)}`;
  try {
    assert.equal((await f.http(`/api/project?token=${token}`)).status, 401);
    const alternatives: Record<string, string>[] = [{}, { Cookie: `session=${token}` }, { Authorization: `Bearer ${token}` }];
    for (const extra of alternatives) {
      const client = f.ws(undefined, extra); await assert.rejects(opened(client)); await closed(client);
      assert.equal(f.wss.clients.size, 0); assert.equal(f.state().subscriptions, 0);
    }
    const client = f.ws(undefined, { 'Sec-WebSocket-Protocol': token });
    await assert.rejects(opened(client)); await closed(client);
  } finally { await f.close(); }
});

test('owner gate rejects foreign/malformed tokens, ambiguous headers, hostile Origin, Host and ambient cookies', async () => {
  const owner = await activeOwner(), foreign = await activeOwner();
  const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }));
  try {
    const auth = { Authorization: `Bearer ${owner.token()}` };
    const attempts: Record<string, string | string[]>[] = [{}, { Authorization: 'Bearer malformed' }, { Authorization: `Bearer ${foreign.token()}` },
      { ...auth, Authorization: [auth.Authorization, auth.Authorization] },
      { ...auth, Origin: ['http://localhost:3001', 'http://localhost:3001'] },
      { ...auth, Origin: 'null' }, { ...auth, Origin: '' }, { ...auth, Origin: 'http://hostile.invalid' },
      { ...auth, Origin: 'http://localhost:5173' }, { ...auth, Cookie: 'ambient=1' },
      { ...auth, Host: 'hostile.invalid', 'X-Forwarded-Host': 'localhost:3001' }];
    for (const extra of attempts) {
      const response = await f.http('/api/project', 'GET', extra);
      assert.ok(response.status === 400 || response.status === 401);
      assert.equal(f.state().operations, 0); assert.doesNotMatch(response.body, /session_|stack/i);
    }
    assert.equal((await f.http('/api/project', 'POST', auth)).status, 200);
    assert.equal(f.state().operations, 1);
  } finally { await f.close(); await owner.owner.dispose(); await foreign.owner.dispose(); }
});

test('native active/provisional state cannot admit requests or subscriptions before server activation', async () => {
  const owner = trustedOwner(true); await owner.owner.issueBootstrap();
  const granting = owner.owner.deliverSession(); await owner.activating.promise;
  const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }));
  try {
    assert.equal((await f.http('/api/project', 'GET', { Authorization: `Bearer ${owner.token()}` })).status, 401);
    const client = f.ws(owner.token()); await assert.rejects(opened(client)); await closed(client);
    assert.equal(f.state().subscriptions, 0);
    owner.activation.resolve(); await granting;
    assert.equal((await f.http('/api/project', 'GET', { Authorization: `Bearer ${owner.token()}` })).status, 200);
  } finally { owner.activation.resolve(); await granting; await f.close(); await owner.owner.dispose(); }
});

test('raw WS duplicate Host/Origin/Authorization headers reject before subscriptions', async () => {
  const owner = await activeOwner(); const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }));
  try {
    const h = { Host: 'localhost:3001', Origin: 'http://localhost:3001', Authorization: `Bearer ${owner.token()}` };
    for (const name of ['Host', 'Origin', 'Authorization'] as const) {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = connect(f.port, '127.0.0.1'); let output = '';
        socket.setTimeout(2000, () => socket.destroy(new Error('Handshake timeout')));
        socket.on('error', reject); socket.on('data', data => { output += String(data); }); socket.on('end', () => resolve(output));
        socket.on('connect', () => socket.write(`GET /ws HTTP/1.1\r\n${Object.entries(h).map(([k,v]) => `${k}: ${v}`).join('\r\n')}\r\n${name}: ${h[name]}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`));
      });
      assert.match(response, /^HTTP\/1\.1 (400|401)/); assert.doesNotMatch(response, /101 Switching|session_/);
      assert.equal(f.state().subscriptions, 0); assert.equal(f.wss.clients.size, 0);
    }
  } finally { await f.close(); await owner.owner.dispose(); }
});

test('WS requires the active owner credential and exact Origin/path, with no ambient or negotiation fallback', async () => {
  const owner = await activeOwner(), foreign = await activeOwner();
  const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }));
  try {
    const attempts: { token?: string; headers?: Record<string, string>; path?: string }[] = [
      {}, { token: foreign.token() }, { token: 'malformed' },
      ...['', 'null', 'http://hostile.invalid', 'http://localhost:5173'].map(Origin => ({ token: owner.token(), headers: { Origin } })),
      { token: owner.token(), headers: { Cookie: 'ambient=1' } },
      { token: owner.token(), headers: { 'Sec-WebSocket-Protocol': 'fallback' } },
      { token: owner.token(), headers: { 'Sec-WebSocket-Extensions': 'permessage-deflate' } },
      { token: owner.token(), path: `/ws?token=${owner.token()}` },
    ];
    for (const attempt of attempts) {
      const client = f.ws(attempt.token, attempt.headers, attempt.path);
      await assert.rejects(opened(client)); await closed(client);
      assert.equal(f.state().subscriptions, 0); assert.equal(f.wss.clients.size, 0);
    }
    const client = f.ws(owner.token()); await opened(client);
    assert.equal(f.state().subscriptions, 1); client.terminate(); await closed(client);
  } finally { await f.close(); await owner.owner.dispose(); await foreign.owner.dispose(); }
});

test('active owner subscriptions have bounded clients and one event in flight; inbound commands close', async () => {
  const owner = await activeOwner(); const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }));
  const clients: WebSocket[] = [];
  try {
    for (let i = 0; i < 2; i++) { const client = f.ws(owner.token()); clients.push(client); await opened(client); }
    const excess = f.ws(owner.token()); await assert.rejects(opened(excess)); await closed(excess);
    assert.equal(f.state().subscriptions, 2);
    const socket = [...f.wss.clients][0];
    const received = new Promise<string>(resolve => clients[0].once('message', data => resolve(String(data))));
    assert.equal(f.boundary.send(socket, '{"event":1}'), true);
    assert.equal(f.boundary.send(socket, '{"event":2}'), false);
    assert.equal(await received, '{"event":1}');
    const ending = closed(clients[0]); clients[0].send('no commands'); await ending;
    const secondEnding = closed(clients[1]);
    assert.equal(f.boundary.send([...f.wss.clients][0], 'x'.repeat(256 * 1024 + 1)), false); await secondEnding;
  } finally { clients.forEach(client => client.terminate()); await f.close(); await owner.owner.dispose(); }
});

for (const ending of ['logout', 'expiry', 'process-loss'] as const)
  test(`owner ${ending} denies subsequent HTTP and revokes WS without another client operation`, async () => {
    const owner = await activeOwner(); const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }));
    try {
      const client = f.ws(owner.token()); await opened(client);
      const ended = closed(client), serverEnded = closed([...f.wss.clients][0]);
      if (ending === 'logout') await owner.owner.companion.logoutSession();
      else if (ending === 'expiry') owner.expire();
      else owner.lose();
      await Promise.all([ended, serverEnded]); assert.equal(f.wss.clients.size, 0);
      const response = await f.http('/api/project', 'GET', { Authorization: `Bearer ${owner.token()}` });
      assert.equal(response.status, 401); assert.equal(f.state().operations, 0);
      assert.equal(getEventListeners(owner.owner.boundaryEnded, 'abort').length, 0);
    } finally { await f.close(); await owner.owner.dispose(); }
  });

test('elapsed expiry blocks outbound dispatch before timer callbacks and cannot revive after disposal', async () => {
  const owner = await activeOwner(); const boundary = new ProductionAuthenticationBoundary({ owner: owner.owner });
  const f = await serverFixture(boundary);
  try {
    const client = f.ws(owner.token()); await opened(client);
    const socket = [...f.wss.clients][0], serverEnded = closed(socket), clientEnded = closed(client);
    let messages = 0; client.on('message', () => { messages++; });
    owner.expire(); // No timer has run between expiry and this send.
    assert.equal(boundary.send(socket, '{"secretEvent":true}'), false);
    await Promise.all([serverEnded, clientEnded]); assert.equal(messages, 0);
    boundary.dispose(); boundary.dispose();
    assert.equal((await f.http('/api/project', 'GET', { Authorization: `Bearer ${owner.token()}` })).status, 401);
  } finally { await f.close(); await owner.owner.dispose(); }
});

for (const ending of ['logout', 'expiry', 'process-loss'] as const)
  test(`pending HTTP output is closed by owner ${ending} and cannot return late protected data`, async () => {
    const owner = await activeOwner(), reached = deferred(), release = deferred(), completed = deferred();
    const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }), async () => {
      reached.resolve(); await release.promise; completed.resolve();
    });
    try {
      const denied = assert.rejects(f.http('/api/project', 'GET', { Authorization: `Bearer ${owner.token()}` }));
      await reached.promise;
      if (ending === 'logout') await owner.owner.logout();
      else if (ending === 'expiry') owner.expire();
      else owner.lose();
      await denied; release.resolve(); await completed.promise;
      assert.equal(getEventListeners(owner.owner.boundaryEnded, 'abort').length, 0);
    } finally { release.resolve(); await f.close(); await owner.owner.dispose(); }
  });

test('HTTP output rechecks elapsed expiry in the same turn without relying on timer delivery', async () => {
  const owner = await activeOwner();
  const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }), () => owner.expire());
  try {
    await assert.rejects(f.http('/api/project', 'GET', { Authorization: `Bearer ${owner.token()}` }));
    assert.equal(owner.owner.boundaryEnded.aborted, true); assert.equal(f.state().operations, 1);
  } finally { await f.close(); await owner.owner.dispose(); }
});

test('revocation during upgrade rechecks authority before admitting any subscription', async () => {
  const owner = await activeOwner(); const f = await serverFixture(new ProductionAuthenticationBoundary({ owner: owner.owner }));
  f.wss.once('headers', () => { void owner.owner.dispose(); });
  try {
    const client = f.ws(owner.token()); await closed(client);
    assert.equal(f.state().subscriptions, 0); assert.equal(f.wss.clients.size, 0);
  } finally { await f.close(); await owner.owner.dispose(); }
});

test('production registration closes all API prefixes before every side-effect middleware', async () => {
  const source = await readFile(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.match(source, /const authentication = new ProductionAuthenticationBoundary\(\);\s*app\.use\('\/api', authentication\.http\);/);
  const gate = source.indexOf("app.use('/api', authentication.http)");
  assert.ok(gate > source.indexOf('app.use(validateHttpHost)'));
  for (const downstream of ['app.use(cors(', "app.use('/api/camera-browser'", 'app.use(express.json())',
    'reportSet.snapshot();next();', 'app.use(taskIntegration.middleware)', "app.get('/api/project'"])
    assert.ok(gate < source.indexOf(downstream), downstream);
  assert.doesNotMatch(source, /new ProductionAuthenticationBoundary\(\{.*owner/);
});
