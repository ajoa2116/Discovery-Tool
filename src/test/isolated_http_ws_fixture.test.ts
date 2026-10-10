import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { getEventListeners } from 'node:events';
import { request, createServer } from 'node:https';
import { connect } from 'node:tls';
import { createServer as createListener } from 'node:net';
import { execFileSync, spawnSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import { CompanionBootstrapAuthority } from '../server/companion_bootstrap_authority.ts';
import { APPLICATION_COMPANION_PATH, startApplicationCompanion, type CompanionLifetime, type CompanionLoss } from '../server/application_companion_supervisor.ts';
import { APPLICATION_SESSION_MS } from '../server/application_session_authority.ts';
import { startIsolatedHttpWsFixture } from '../server/isolated_http_ws_fixture.ts';

const fixturePids = () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process -Name ApplicationCompanion -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  assert.ok(result.status === 0 || result.status === 1); assert.equal(result.error, undefined);
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
};
const baseline = new Set(fixturePids());
const browserPids = () => {
  // CIM can retain exited runtime records while this test runner is alive.
  // Require an actual live process as well as the isolated fixture profile.
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', "$ErrorActionPreference = 'Stop'; $live = @([System.Diagnostics.Process]::GetProcessesByName('msedgewebview2') | ForEach-Object { try { if (-not $_.HasExited) { $_.Id } } finally { $_.Dispose() } }); Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" | Where-Object { $_.CommandLine -like '*CCTVApplicationCompanion*' -and $live -contains [int]$_.ProcessId } | Select-Object -ExpandProperty ProcessId"], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 0); assert.equal(result.error, undefined);
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
};
const browserBaseline = new Set(browserPids());
after(async () => {
  // Startup rejection may precede bounded asynchronous cleanup.
  const deadline = Date.now() + 6000;
  while (fixturePids().some(pid => !baseline.has(pid)) && Date.now() < deadline) await new Promise(done => setTimeout(done, 100));
  assert.deepEqual(fixturePids().filter(pid => !baseline.has(pid)), [], 'no owned broker/fixture survives any failure');
  const browserDeadline = Date.now() + 6000;
  while (browserPids().some(pid => !browserBaseline.has(pid)) && Date.now() < browserDeadline) await new Promise(done => setTimeout(done, 100));
  assert.deepEqual(browserPids().filter(pid => !browserBaseline.has(pid)), [], 'no owned fixture WebView2 process remains');
});

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { resolve, promise }; };
function trustedOwner(holdActivation = false) {
  let bootstrap = '', token = '', alive = true, elapsed = 0;
  const activating = deferred(), activation = deferred();
  let lose!: (reason: CompanionLoss) => void;
  const lost = new Promise<CompanionLoss>(resolve => { lose = resolve; });
  const probes: { port: number; pin: string }[] = [];
  const transport: CompanionLifetime = {
    pid: 1, brokerPid: 2, generation: 1, get alive() { return alive; }, lost,
    closed: lost.then(() => true), failureCode: lost.then(() => undefined),
    async deliverBootstrap(input) { bootstrap = JSON.parse(input).token; }, async activateBootstrap() {},
    async requestBootstrapRedemption() { return bootstrap; }, async deliverSession(value) { token = value; },
    async activateSession() { activating.resolve(); if (holdActivation) await activation.promise; },
    async probeHttpFixture(endpoint) { probes.push(endpoint); },
    async logoutSession() {}, async shutdown() { alive = false; lose('closed'); },
  };
  // Same trusted private-channel seam as the existing boundary timing tests. No bare authority.
  const owner = Reflect.construct(CompanionBootstrapAuthority, [transport, Date.now, () => elapsed]) as CompanionBootstrapAuthority;
  return { owner, probes, token: () => token, activating, activation, expire: () => { elapsed = APPLICATION_SESSION_MS; },
    lose: () => { alive = false; lose('failed'); } };
}
// Trusted private transport fault injection tests native TLS/redirect refusal without exposing
// a destination override on the owner credential API.
async function faultOwner(replace: (endpoint: { port: number; pin: string }) => { port: number; pin: string }) {
  const transport = await startApplicationCompanion();
  const wrapped: CompanionLifetime = { ...transport,
    get alive() { return transport.alive; },
    async probeHttpFixture(endpoint, operation, signal) { await transport.probeHttpFixture!(replace(endpoint), operation, signal); },
  };
  return Reflect.construct(CompanionBootstrapAuthority, [wrapped]) as CompanionBootstrapAuthority;
}

type Fixture = Awaited<ReturnType<typeof startIsolatedHttpWsFixture>>;
const headers = (f: Fixture, token?: string) => ({ Host: `127.0.0.1:${f.endpoint.port}`, Origin: 'https://companion-fixture.invalid', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
// Adversarial server-boundary clients deliberately bypass TLS pinning; actual native tests below prove pinning.
function http(f: Fixture, token?: string, extra: Record<string, string> = {}, path = '/proof') {
  return new Promise<number>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: f.endpoint.port, path, method: 'GET', rejectUnauthorized: false,
      agent: false, headers: { ...headers(f, token), ...extra }, timeout: 2500 }, res => { res.resume(); resolve(res.statusCode!); });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Test timeout.'))); req.end();
  });
}
function ws(f: Fixture, token?: string, extra: Record<string, string> = {}) {
  const socket = new WebSocket(`wss://127.0.0.1:${f.endpoint.port}/events`, {
    rejectUnauthorized: false, headers: { ...headers(f, token), ...extra }, handshakeTimeout: 2000, perMessageDeflate: false,
  });
  socket.on('error', () => {});
  return socket;
}
const opened = (socket: WebSocket) => new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', () => reject(new Error('Test connection denied.'))); });
const closed = (socket: WebSocket) => new Promise<void>(resolve => { if (socket.readyState === WebSocket.CLOSED) resolve(); else socket.once('close', () => resolve()); });
async function active(options: Parameters<typeof startIsolatedHttpWsFixture>[1] = {}) {
  const f = trustedOwner(); await f.owner.issueBootstrap(); await f.owner.deliverSession();
  const server = await startIsolatedHttpWsFixture(f.owner, options);
  return { ...f, server, async close() { await server.close(); await f.owner.dispose(); } };
}

test('synthetic read, receive-only events and reconnect require the active owner', async () => {
  const f = await active();
  try {
    assert.equal(await http(f.server, f.token()), 200);
    for (let i = 0; i < 2; i++) {
      const socket = ws(f.server, f.token()); await opened(socket);
      const received = new Promise<string>(resolve => socket.once('message', data => resolve(String(data))));
      assert.equal(f.server.emit(), 1); assert.equal(await received, '{"type":"FIXTURE_EVENT","value":1}');
      const ending = closed(socket); socket.send('no inbound commands'); await ending;
    }
    assert.equal(f.server.snapshot().sockets, 0);
  } finally { await f.close(); }
});

test('outbound queue holds at most one fixed event per socket and inbound ping is rejected', async () => {
  const f = await active();
  try {
    const socket = ws(f.server, f.token()); await opened(socket);
    assert.equal(f.server.emit(), 1);
    for (let i = 0; i < 100; i++) assert.equal(f.server.emit(), 0);
    assert.equal(f.server.snapshot().queued, 1);
    const ending = closed(socket); socket.ping(); await ending;
  } finally { await f.close(); }
});

test('HTTP denies missing, malformed, foreign authority, hostile Origin/Host, cookies and URL authority', async () => {
  const f = await active(), foreign = await active();
  try {
    for (const token of [undefined, 'malformed', foreign.token()]) assert.equal(await http(f.server, token), 403);
    const hostile: Record<string, string>[] = [ { Origin: 'null' }, { Origin: 'https://hostile.invalid' }, { Origin: '' },
      { Host: 'localhost:3001' }, { Host: `localhost:${f.server.endpoint.port}` }, { Cookie: 'ambient=1' },
      { Authorization: `bearer ${f.token()}` }, { 'Content-Length': '1' }, { Host: 'hostile.invalid', 'X-Forwarded-Host': `127.0.0.1:${f.server.endpoint.port}` } ];
    for (const extra of hostile) {
      assert.equal(await http(f.server, f.token(), extra), 403);
    }
    assert.equal(await http(f.server, f.token(), {}, '/proof?token=forbidden'), 403);
    assert.equal(await http(f.server, f.token(), {}, '/other'), 403);
    assert.throws(() => f.owner.authorizeFixtureReceipt({ id: 'forged', expiresAt: Date.now() + 1000 }));
  } finally { await f.close(); await foreign.close(); }
});

test('duplicate headers are denied on the TLS wire before HTTP work and WS upgrade', async () => {
  const f = await active();
  try {
    for (const name of ['Host', 'Origin', 'Authorization']) for (const upgrade of [false, true]) {
      const h = headers(f.server, f.token());
      const response = await new Promise<string>((resolve, reject) => {
        const socket = connect({ host: '127.0.0.1', port: f.server.endpoint.port, rejectUnauthorized: false });
        let output = ''; socket.setTimeout(2000, () => socket.destroy(new Error('Test timeout.')));
        socket.on('error', reject); socket.on('data', data => { output += String(data); }); socket.on('end', () => resolve(output));
        socket.on('secureConnect', () => socket.write(`GET /${upgrade ? 'events' : 'proof'} HTTP/1.1\r\n${Object.entries(h).map(([k,v]) => `${k}: ${v}`).join('\r\n')}\r\n${name}: ${h[name as keyof typeof h]}\r\nConnection: ${upgrade ? 'Upgrade' : 'close'}\r\n${upgrade ? 'Upgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n' : ''}\r\n`));
      });
      assert.doesNotMatch(response, /101 Switching|200 OK/);
      assert.equal(f.server.snapshot().pending, 0);
    }
  } finally { await f.close(); }
});

test('WS denies missing/malformed/foreign tokens and hostile or missing Origin', async () => {
  const f = await active(), foreign = await active();
  try {
    for (const token of [undefined, 'malformed', foreign.token()]) { const socket = ws(f.server, token); await assert.rejects(opened(socket)); await closed(socket); }
    for (const Origin of ['', 'null', 'http://localhost:5173', 'https://hostile.invalid']) { const socket = ws(f.server, f.token(), { Origin }); await assert.rejects(opened(socket)); await closed(socket); }
    assert.equal(f.server.snapshot().sockets, 0);
  } finally { await f.close(); await foreign.close(); }
});

test('provisional authority cannot authorize HTTP or WS until native activation acknowledgment', async () => {
  const f = trustedOwner(true); await f.owner.issueBootstrap();
  const granting = f.owner.deliverSession(); await f.activating.promise;
  const server = await startIsolatedHttpWsFixture(f.owner);
  try {
    assert.equal(await http(server, f.token()), 403);
    const socket = ws(server, f.token()); await assert.rejects(opened(socket)); await closed(socket);
    f.activation.resolve(); await granting; assert.equal(await http(server, f.token()), 200);
  } finally { f.activation.resolve(); await granting; await server.close(); await f.owner.dispose(); }
});

test('logout cancels pending read and immediately closes active sockets and endpoint', async () => {
  const f = await active({ readDelayMs: 800 });
  try {
    const socket = ws(f.server, f.token()); await opened(socket); const ending = closed(socket);
    const pending = http(f.server, f.token()).catch(() => 0);
    while (!f.server.snapshot().pending) await delay(5);
    await f.owner.companion.logoutSession();
    assert.equal(f.server.snapshot().ended, true); assert.equal(f.server.emit(), 0);
    assert.notEqual(await pending, 200); await ending;
    await assert.rejects(http(f.server, f.token()));
  } finally { await f.close(); }
});

test('logout during upgrade cancels the hook and cannot admit a late acknowledgment', async () => {
  const reached = deferred(), release = deferred(); let cancelled = false;
  const f = await active({ beforeUpgrade: async signal => { signal.addEventListener('abort', () => { cancelled = true; }); reached.resolve(); await release.promise; } });
  try {
    const socket = ws(f.server, f.token()); const denial = assert.rejects(opened(socket)); await reached.promise;
    await f.owner.logout(); assert.equal(cancelled, true); release.resolve(); await denial; await closed(socket);
    assert.equal(f.server.snapshot().sockets, 0);
  } finally { release.resolve(); await f.close(); }
});

test('elapsed expiry with no intervening timer callback denies outbound events and pending responses', async () => {
  const f = await active({ readDelayMs: 100 });
  try {
    const socket = ws(f.server, f.token()); await opened(socket); const ending = closed(socket);
    const pending = http(f.server, f.token()).catch(() => 0);
    while (!f.server.snapshot().pending) await delay(5);
    f.expire(); // Same JS turn: expiry watchers have not run.
    assert.equal(f.server.emit(), 0); assert.equal(f.owner.boundaryEnded.aborted, true);
    assert.notEqual(await pending, 200); await ending;
  } finally { await f.close(); }
});

test('process/IPC loss closes sockets and cancels pending fixture work', async () => {
  const f = await active({ readDelayMs: 800 });
  try {
    const socket = ws(f.server, f.token()); await opened(socket); const ending = closed(socket);
    const pending = http(f.server, f.token()).catch(() => 0);
    while (!f.server.snapshot().pending) await delay(5);
    f.lose(); await ending; assert.notEqual(await pending, 200); assert.equal(f.server.emit(), 0);
  } finally { await f.close(); }
});

test('socket count, pending work, inbound payloads and work lifetime are bounded', async () => {
  const f = await active({ readDelayMs: 1500 }); const clients: WebSocket[] = [];
  try {
    for (let i = 0; i < 2; i++) { const socket = ws(f.server, f.token()); clients.push(socket); await opened(socket); }
    const excess = ws(f.server, f.token()); await assert.rejects(opened(excess)); await closed(excess);
    const ending = closed(clients[0]); clients[0].send('x'.repeat(257)); await ending;
    const first = http(f.server, f.token()), second = http(f.server, f.token());
    while (f.server.snapshot().pending < 2) await delay(5);
    assert.equal(await http(f.server, f.token()), 403);
    assert.deepEqual(await Promise.all([first, second]), [403, 403]);
    assert.equal(f.server.snapshot().pending, 0);
  } finally { clients.forEach(client => client.terminate()); await f.close(); }
});

test('development Origin policy is explicit and fresh fixture instances have distinct pins', async () => {
  const f = await active({ development: true }), other = await active();
  try {
    assert.notEqual(f.server.endpoint.pin, other.server.endpoint.pin);
    for (const Origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) assert.equal(await http(f.server, f.token(), { Origin }), 200);
    assert.equal(await http(f.server, f.token(), { Origin: 'http://localhost:5174' }), 403);
  } finally { await f.close(); await other.close(); }
});

test('real native-held credential authenticates pinned HTTP and receive-only WS', async () => {
  const owner = await CompanionBootstrapAuthority.start(); let server: Fixture | undefined;
  try {
    await owner.issueBootstrap(); await owner.deliverSession(); server = await startIsolatedHttpWsFixture(owner);
    for (let i = 0; i < 2; i++) {
      await owner.probeHttpFixture(server, 'read');
      const timer = setInterval(() => server!.emit(), 30);
      try { await owner.probeHttpFixture(server, 'events'); } finally { clearInterval(timer); }
    }
    assert.equal(server.snapshot().requests, 2); assert.equal(server.snapshot().upgrades, 2);
    await owner.logout(); assert.equal(server.snapshot().ended, true);
  } finally { await server?.close(); await owner.dispose(); }
});

for (const operation of ['read', 'events'] as const) test(`real native wrong pin sends no authenticated ${operation} request`, async () => {
  const owner = await faultOwner(endpoint => ({ ...endpoint, pin: '0'.repeat(64) })); let server: Fixture | undefined;
  try {
    await owner.issueBootstrap(); await owner.deliverSession(); server = await startIsolatedHttpWsFixture(owner);
    await assert.rejects(owner.probeHttpFixture(server, operation));
    assert.equal(server.snapshot().pending, 0); assert.equal(server.snapshot().sockets, 0);
    assert.equal(server.snapshot().requests, 0); assert.equal(server.snapshot().upgrades, 0);
    await owner.companion.lost;
  } finally { await server?.close(); await owner.dispose(); }
});

test('real native rejects foreign, substituted and fabricated endpoints before its first request', async () => {
  const owner = await CompanionBootstrapAuthority.start(), foreign = await active(); let server: Fixture | undefined;
  try {
    await owner.issueBootstrap(); await owner.deliverSession(); server = await startIsolatedHttpWsFixture(owner);
    for (const endpoint of [foreign.server, foreign.server.endpoint, server.endpoint, { ...server }, { ...server.endpoint }, null])
      for (const operation of ['read', 'events'] as const) await assert.rejects(owner.probeHttpFixture(endpoint, operation));
    assert.equal(server.snapshot().requests, 0); assert.equal(server.snapshot().upgrades, 0);
    await owner.probeHttpFixture(server, 'read');
    await assert.rejects(owner.probeHttpFixture(foreign.server, 'read'));
    assert.equal(foreign.server.snapshot().requests, 0);
  } finally { await server?.close(); await owner.dispose(); await foreign.close(); }
});

for (const operation of ['read', 'events'] as const) test(`real native ${operation} refuses redirects without credential forwarding`, async () => {
  // A trusted adversarial TLS fixture; all key material stays in private test/native memory.
  const material = JSON.parse(execFileSync(APPLICATION_COMPANION_PATH, ['--http-fixture-identity'], { encoding: 'utf8', timeout: 5000, maxBuffer: 16384, windowsHide: true }));
  const pin = createHash('sha256').update(new X509Certificate(material.cert).raw).digest('hex');
  const target = await active(); let contacted = 0;
  const rogue = createServer(material);
  rogue.on('request', (_req, res) => { contacted++; res.writeHead(302, { Location: `https://127.0.0.1:${target.server.endpoint.port}/proof` }); res.end(); });
  rogue.on('upgrade', (_req, socket) => { contacted++; socket.end(`HTTP/1.1 302 Found\r\nLocation: wss://127.0.0.1:${target.server.endpoint.port}/events\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); });
  rogue.on('tlsClientError', () => {});
  await new Promise<void>(resolve => rogue.listen(0, '127.0.0.1', resolve));
  const address = rogue.address(); assert.ok(address && typeof address !== 'string');
  const owner = await faultOwner(() => ({ port: address.port, pin })); let server: Fixture | undefined;
  try {
    await owner.issueBootstrap(); await owner.deliverSession(); server = await startIsolatedHttpWsFixture(owner);
    await assert.rejects(owner.probeHttpFixture(server, operation));
    assert.equal(contacted, 1); assert.equal(target.server.snapshot().requests, 0); assert.equal(target.server.snapshot().upgrades, 0);
  } finally { await server?.close(); await owner.dispose(); await target.close(); await new Promise<void>(resolve => rogue.close(() => resolve())); }
});

for (const ending of ['logout', 'broker-death', 'fixture-close'] as const) test(`real native pending WS is cancelled by ${ending}`, async () => {
  const owner = await CompanionBootstrapAuthority.start(); let server: Fixture | undefined;
  try {
    await owner.issueBootstrap(); await owner.deliverSession(); server = await startIsolatedHttpWsFixture(owner);
    const pending = assert.rejects(owner.probeHttpFixture(server, 'events'));
    const deadline = Date.now() + 1800;
    while (!server.snapshot().sockets && Date.now() < deadline) await delay(5);
    assert.equal(server.snapshot().sockets, 1);
    if (ending === 'logout') await owner.logout().catch(() => {});
    else if (ending === 'broker-death') process.kill(owner.companion.brokerPid);
    else await server.close();
    await pending; await owner.companion.lost; await delay(0);
    assert.equal(owner.boundaryEnded.aborted, true); assert.equal(server.snapshot().ended, true); assert.equal(server.emit(), 0);
  } finally { await server?.close(); await owner.dispose(); }
});

test('blocked event loop cannot extend an existing socket lease', async () => {
  const f = await active();
  try {
    const socket = ws(f.server, f.token()); await opened(socket); const ending = closed(socket);
    // Deliberately stop timer callbacks; outbound dispatch must enforce elapsed time itself.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2600);
    assert.equal(f.server.emit(), 0); await ending;
  } finally { await f.close(); }
});

for (const mode of ['session-heartbeat-stall', 'session-channel-loss'] as const) test(`actual ${mode} revokes fixture endpoint`, async () => {
  const owner = await CompanionBootstrapAuthority.start({ mode }); let server: Fixture | undefined;
  try {
    await owner.issueBootstrap(); await owner.deliverSession(); server = await startIsolatedHttpWsFixture(owner);
    await owner.companion.lost;
    await delay(0); assert.equal(server.snapshot().ended, true); assert.equal(server.emit(), 0);
  } finally { await server?.close(); await owner.dispose(); }
});

test('owner binding is immutable, rejects stale/closed handles and removes lifetime listeners', async () => {
  const f = await active(), foreign = await active();
  try {
    assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 1);
    for (const input of [foreign.server, f.server.endpoint, { ...f.server }, { endpoint: f.server.endpoint },
      Object.defineProperty({}, 'endpoint', { get() { throw new Error('must never inspect caller fields'); } })])
      await assert.rejects(f.owner.probeHttpFixture(input, 'read'));
    assert.equal(f.probes.length, 0);
    assert.ok(Object.isFrozen(f.server)); assert.ok(Object.isFrozen(f.server.endpoint));
    await f.owner.probeHttpFixture(f.server, 'read');
    assert.deepEqual(f.probes[0], f.server.endpoint); assert.notEqual(f.probes[0], f.server.endpoint);
    assert.ok(Object.isFrozen(f.probes[0]));
    assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 1);
    await assert.rejects(startIsolatedHttpWsFixture(f.owner));
    await f.server.close();
    assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 0);
    await assert.rejects(f.owner.probeHttpFixture(f.server, 'read'));
    await assert.rejects(startIsolatedHttpWsFixture(f.owner));
    await assert.rejects(foreign.owner.probeHttpFixture(f.server, 'events'));
    assert.equal(f.probes.length, 1); assert.equal(foreign.probes.length, 0);
  } finally { await f.close(); await foreign.close(); }
});

test('concurrent construction cannot replace the first owner endpoint', async () => {
  const f = trustedOwner();
  await f.owner.issueBootstrap(); await f.owner.deliverSession();
  const creating = startIsolatedHttpWsFixture(f.owner);
  await assert.rejects(startIsolatedHttpWsFixture(f.owner));
  const server = await creating;
  try { await f.owner.probeHttpFixture(server, 'read'); assert.deepEqual(f.probes[0], server.endpoint); }
  finally { await server.close(); await f.owner.dispose(); }
});

test('client disconnect cancels upgrade immediately and removes pending abort listeners', async () => {
  const reached = deferred(), release = deferred(), cancelled = deferred();
  let signal: AbortSignal | undefined, attempts = 0;
  const f = await active({ beforeUpgrade: async current => {
    signal = current;
    if (++attempts > 1) return;
    current.addEventListener('abort', cancelled.resolve, { once: true });
    reached.resolve(); await release.promise;
  } });
  try {
    const client = ws(f.server, f.token()); await reached.promise;
    const ending = closed(client); client.terminate();
    await Promise.race([cancelled.promise, delay(350).then(() => { throw new Error('Disconnect did not cancel upgrade promptly.'); })]);
    await ending; await delay(0);
    assert.equal(signal!.aborted, true); assert.equal(f.server.snapshot().pending, 0);
    assert.equal(getEventListeners(signal!, 'abort').length, 0);
    assert.equal(f.server.snapshot().sockets, 0);
    release.resolve(); await delay(0); assert.equal(f.server.snapshot().sockets, 0);
    const reconnected = ws(f.server, f.token()); await opened(reconnected);
    assert.equal(getEventListeners(signal!, 'abort').length, 0);
    reconnected.terminate(); await closed(reconnected);
    await f.server.close(); await delay(0);
    assert.equal(f.server.snapshot().connections, 0);
    assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 0);
  } finally { release.resolve(); await f.close(); }
});

test('native monotonic deadline rejects late certificate and post-await work without timer cancellation', () => {
  const result = execFileSync(APPLICATION_COMPANION_PATH, ['--http-fixture-deadline-self-test'], {
    encoding: 'utf8', timeout: 8000, windowsHide: true,
  });
  const value = JSON.parse(result); assert.equal(value.type, 'HTTP_FIXTURE_DEADLINE_TEST_OK');
  assert.equal(value.cases, 16); assert.equal(value.checks, 94);
});

test('real native rejects a closed endpoint before the first request without losing live owner authority', async () => {
  const owner = await CompanionBootstrapAuthority.start(); let server: Fixture | undefined;
  try {
    await owner.issueBootstrap(); await owner.deliverSession(); server = await startIsolatedHttpWsFixture(owner);
    await server.close();
    for (const operation of ['read', 'events'] as const) await assert.rejects(owner.probeHttpFixture(server, operation));
    assert.equal(server.snapshot().requests, 0); assert.equal(server.snapshot().upgrades, 0);
    assert.equal(owner.companion.alive, true);
    await assert.rejects(startIsolatedHttpWsFixture(owner));
    assert.equal(getEventListeners(owner.boundaryEnded, 'abort').length, 0);
  } finally { await server?.close(); await owner.dispose(); }
});


function assertShutdown(server: Fixture) {
  const state = server.snapshot();
  assert.equal(state.ended, true); assert.equal(state.shutdownComplete, true);
  assert.equal(state.listening, false); assert.equal(state.httpClosed, true); assert.equal(state.websocketClosed, true);
  assert.equal(state.connections, 0); assert.equal(state.websocketClients, 0);
  assert.equal(state.sockets, 0); assert.equal(state.queued, 0); assert.equal(state.pending, 0);
}
async function reusePort(port: number) {
  const listener = createListener();
  try {
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject); listener.listen({ port, host: '127.0.0.1' }, resolve);
    });
    const address = listener.address(); assert.ok(address && typeof address !== 'string'); assert.equal(address.port, port);
  } finally { if (listener.listening) await new Promise<void>(resolve => listener.close(() => resolve())); }
}

test('concurrent and abort-reentrant shutdown share one promise and join pending handlers', async () => {
  const reached = deferred(), release = deferred(); const nested: Promise<void>[] = [];
  let f!: Awaited<ReturnType<typeof active>>;
  f = await active({ readDelayMs: 800, beforeUpgrade: async signal => {
    signal.addEventListener('abort', () => nested.push(f.server.close()), { once: true });
    reached.resolve(); await release.promise;
  } });
  try {
    const client = ws(f.server, f.token()); const denied = assert.rejects(opened(client)); await reached.promise;
    const pendingRead = http(f.server, f.token()).catch(() => 0);
    while (f.server.snapshot().pending !== 2) await delay(5);
    const first = f.server.close(), second = f.server.close();
    assert.equal(first, second); assert.equal(nested.length, 1); assert.equal(nested[0], first);
    await Promise.all([first, second, ...nested]);
    assertShutdown(f.server); assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 0);
    await denied; await closed(client); assert.notEqual(await pendingRead, 200);
    release.resolve(); await delay(0); assertShutdown(f.server);
    assert.equal(f.server.close(), first); await reusePort(f.server.endpoint.port);
    await assert.rejects(f.owner.probeHttpFixture(f.server, 'read')); assert.equal(f.probes.length, 0);
  } finally { release.resolve(); await f.close(); }
});

for (const ending of ['close', 'logout', 'process-loss', 'hook-failure'] as const)
  test(`shutdown during pending listen joins late listener creation: ${ending}`, async () => {
    const f = trustedOwner(); await f.owner.issueBootstrap(); await f.owner.deliverSession();
    let shared: Promise<void> | undefined, revoking: Promise<void> | undefined;
    let port = 0, completed = false, completedAtListening: boolean | undefined, samePromise = false;
    try {
      await assert.rejects(startIsolatedHttpWsFixture(f.owner, {
        onListenRequested: close => {
          if (ending === 'logout') revoking = f.owner.logout();
          else if (ending === 'process-loss') f.lose();
          shared = close(); samePromise = shared === close();
          void shared.then(() => { completed = true; });
          if (ending === 'hook-failure') throw new Error('Trusted startup hook rejected.');
        },
        onListening: value => { port = value; completedAtListening = completed; },
      }));
      assert.ok(shared); await shared; await revoking;
      assert.equal(samePromise, true); assert.equal(completedAtListening, false); assert.equal(completed, true);
      assert.ok(port > 0); await reusePort(port);
      assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 0);
      await assert.rejects(startIsolatedHttpWsFixture(f.owner)); assert.equal(f.probes.length, 0);
    } finally { await shared; await revoking; await f.owner.dispose(); }
  });

test('shutdown completion joins established WS clients, outbound queue, TCP and HTTP work', async () => {
  const f = await active({ readDelayMs: 800 }); const clients: WebSocket[] = [];
  try {
    for (let i = 0; i < 2; i++) { const client = ws(f.server, f.token()); clients.push(client); await opened(client); }
    const endings = clients.map(closed); assert.equal(f.server.emit(), 2); assert.equal(f.server.snapshot().queued, 2);
    const pending = http(f.server, f.token()).catch(() => 0);
    while (!f.server.snapshot().pending) await delay(5);
    await Promise.all([f.server.close(), f.server.close()]);
    assertShutdown(f.server); await Promise.all(endings); assert.notEqual(await pending, 200);
    await reusePort(f.server.endpoint.port);
  } finally { clients.forEach(client => client.terminate()); await f.close(); }
});

for (const ending of ['logout', 'expiry', 'process-loss'] as const)
  test(`revocation joins pending upgrade/read work and endpoint shutdown: ${ending}`, async () => {
    const reached = deferred(), release = deferred(); let signal: AbortSignal | undefined;
    const f = await active({ readDelayMs: 800, beforeUpgrade: async current => {
      signal = current; reached.resolve(); await release.promise;
    } });
    try {
      const client = ws(f.server, f.token()); const denied = assert.rejects(opened(client)); await reached.promise;
      const pending = http(f.server, f.token()).catch(() => 0);
      while (f.server.snapshot().pending !== 2) await delay(5);
      if (ending === 'logout') await f.owner.logout();
      else if (ending === 'expiry') { f.expire(); assert.throws(() => f.owner.authorizeFixtureReceipt({ id: 'unavailable', expiresAt: Date.now() + 1000 })); }
      else { f.lose(); await f.owner.companion.lost; await delay(0); }
      await f.server.close(); assertShutdown(f.server); assert.equal(signal!.aborted, true);
      assert.equal(getEventListeners(signal!, 'abort').length, 0);
      release.resolve(); await denied; await closed(client); assert.notEqual(await pending, 200);
      await reusePort(f.server.endpoint.port);
    } finally { release.resolve(); await f.close(); }
  });

for (const order of ['disconnect-first', 'completion-first'] as const)
  test(`disconnect and upgrade completion race drains resources: ${order}`, async () => {
    const reached = deferred(), release = deferred(); let signal: AbortSignal | undefined;
    const f = await active({ beforeUpgrade: async current => { signal = current; reached.resolve(); await release.promise; } });
    try {
      const client = ws(f.server, f.token()); await reached.promise;
      const ending = closed(client);
      if (order === 'completion-first') release.resolve();
      client.terminate(); await ending;
      if (order === 'disconnect-first') release.resolve();
      await f.server.close(); assertShutdown(f.server);
      assert.equal(getEventListeners(signal!, 'abort').length, 0);
      assert.equal(f.server.emit(), 0); await reusePort(f.server.endpoint.port);
    } finally { release.resolve(); await f.close(); }
  });

test('rejected upgrade hook releases cancellation listeners and joins clean shutdown', async () => {
  let signal: AbortSignal | undefined;
  const f = await active({ beforeUpgrade: async current => { signal = current; throw new Error('Trusted upgrade hook rejected.'); } });
  try {
    const client = ws(f.server, f.token()); await assert.rejects(opened(client)); await closed(client);
    assert.equal(getEventListeners(signal!, 'abort').length, 0);
    await f.server.close(); assertShutdown(f.server); await reusePort(f.server.endpoint.port);
  } finally { await f.close(); }
});
