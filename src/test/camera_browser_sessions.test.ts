import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { CameraBrowserSessions, BrowserSessionError, HANDOFF_MS, BROWSER_SESSION_MS } from '../core/connect/camera_browser_sessions.ts';
import { IframeCameraRenderer } from '../shared/camera_renderer.ts';
import { cameraBrowserOriginAllowed, cameraBrowserRoutes } from '../server/camera_browser_routes.ts';
import { Device } from '../types/index.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { ConnectService } from '../core/connect/connect_service.ts';
import { ReportSet } from '../core/reporting/report_set.ts';
import { ReportService } from '../core/reporting/report_service.ts';
import { SupportBundleBuilder, sanitizeSupportEvidence } from '../core/readiness/support_bundle.ts';
import { sanitizeTechnicalDetail } from '../shared/error_presentation.ts';
import { TaskManager } from '../core/tasks/task_manager.ts';
import express from 'express';
import { createServer, request } from 'node:http';

const camera = (id = 'A', ip = '192.0.2.100'): Device => ({ id, anchor: { macAddress: id === 'A' ? '00:50:f9:63:fb:0f' : 'e4:30:22:cd:68:85', onvifEndpointUuid: 'uuid-' + id, vendor: 'Fixture' }, network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF' }, status: 'ONLINE', sessionVerification: 'VERIFIED', discoveredPhase: 3, firstSeenAt: 'now', lastSeenAt: 'now' });
function setup() {
  let now = 1_000;
  const db = new SiteProjectDatabase(); db.createNewProject('Sessions'); db.upsertDevice(camera()); db.upsertDevice(camera('B', '192.0.2.101'));
  const launches: string[] = [];
  const connect = new ConnectService(db, { available: async () => ['SYSTEM'], launch: async (url, preference, authorize) => { authorize(); launches.push(url); return { used: preference, fallback: false }; } });
  const store = () => new CameraBrowserSessions(() => { const s = db.getSession(); return { key: s.project.id, devices: s.project.devices, collisions: s.project.collisions }; }, id => connect.resolve(id).endpoint.url, () => now);
  const sessions = store(), channel = sessions.createHostChannel();
  const issue = (id = 'A') => sessions.createNative(id, channel);
  const active = (id = 'A') => { const h = issue(id); return channel.redeem(h.session.sessionId, id, h.secret.expose()); };
  return { db, sessions, channel, issue, active, store, launches, connect, advance: (ms: number) => { now += ms; } };
}
const denied = (fn: () => unknown) => assert.throws(fn, BrowserSessionError);
const message = (a: ReturnType<ReturnType<typeof setup>['active']>, type = 'STATUS') => ({ type, sessionId: a.session.sessionId, deviceId: a.session.deviceId, token: a.channelToken.expose() });

test('approved stable device creates session bound to exact current address/origin', () => { const s = setup(), h = s.issue(); assert.equal(h.session.deviceId, 'A'); assert.equal(h.session.address, '192.0.2.100'); assert.equal(h.session.origin, 'http://192.0.2.100'); assert.equal(h.session.renderer, 'WINDOWS_WEBVIEW2'); });
test('blocked device cannot create authorization', () => { const s = setup(); s.db.getDeviceById('A')!.sessionVerification = 'NOT_VERIFIED'; denied(() => s.issue()); });
test('IP alone is neither a device selector nor identity', () => { const s = setup(); denied(() => s.issue('192.0.2.100')); s.db.getDeviceById('A')!.anchor = { macAddress: null, vendor: 'Fixture' }; denied(() => s.issue()); });
test('handoffs contain independent 256-bit cryptographic opaque secrets', () => { const s = setup(), tokens = Array.from({ length: 32 }, () => s.issue().secret.expose()); assert.equal(new Set(tokens).size, 32); tokens.forEach(t => assert.match(t, /^cbh_[A-Za-z0-9_-]{43}$/)); });
test('camera URL and public authorization contain no secret or password', () => { const s = setup(); Object.assign(s.db.getDeviceById('A')!, { password: 'fixture-password', credentials: { password: 'fixture-password' } }); const h = s.issue(); assert.equal(new URL(h.session.origin).search, ''); assert.ok(!JSON.stringify(h.session).includes(h.secret.expose())); assert.ok(!JSON.stringify(h.session).includes('fixture-password')); });
test('default log/JSON inspection omits store and handoff secrets', () => { const s = setup(), h = s.issue(); const logs = [inspect(h), inspect(s.sessions), String(h.secret), JSON.stringify(h), JSON.stringify(s.sessions)].join(' '); assert.ok(!logs.includes(h.secret.expose())); });
test('one-time redemption rotates secret and rejects replay', () => { const s = setup(), h = s.issue(), a = s.channel.redeem(h.session.sessionId, 'A', h.secret.expose()); assert.notEqual(a.channelToken.expose(), h.secret.expose()); denied(() => s.channel.redeem(h.session.sessionId, 'A', h.secret.expose())); denied(() => s.channel.dispatch({ ...message(a), token: h.secret.expose() })); });
test('expired handoff fails at exact deadline', () => { const s = setup(), h = s.issue(); s.advance(HANDOFF_MS); denied(() => s.channel.redeem(h.session.sessionId, 'A', h.secret.expose())); });
test('revoked handoff fails', () => { const s = setup(), h = s.issue(); s.sessions.revoke(h.session.sessionId); denied(() => s.channel.redeem(h.session.sessionId, 'A', h.secret.expose())); });
test('wrong device cannot redeem', () => { const s = setup(), h = s.issue(); denied(() => s.channel.redeem(h.session.sessionId, 'B', h.secret.expose())); });
test('wrong session cannot redeem', () => { const s = setup(), h = s.issue(), other = s.issue('B'); denied(() => s.channel.redeem(other.session.sessionId, 'A', h.secret.expose())); });
test('unrelated channel cannot redeem a stolen bearer token', () => { const s = setup(), h = s.issue(), other = s.sessions.createHostChannel(); denied(() => other.redeem(h.session.sessionId, 'A', h.secret.expose())); });
test('active token cannot control another session', () => { const s = setup(), a = s.active(), b = s.active('B'); denied(() => s.channel.dispatch({ ...message(b), token: a.channelToken.expose() })); });
test('active token cannot move to another channel', () => { const s = setup(), a = s.active(); denied(() => s.sessions.createHostChannel().dispatch(message(a))); });
test('restart invalidates all prior handoff and channel state', () => { const s = setup(), h = s.issue(), a = s.active(), restarted = s.store().createHostChannel(); denied(() => restarted.redeem(h.session.sessionId, 'A', h.secret.expose())); denied(() => restarted.dispatch(message(a))); });
for (const change of ['duplicate', 'conflict', 'address', 'removed', 'stale', 'anchor', 'project'] as const) test(`${change} revokes active authorization`, () => {
  const s = setup(), a = s.active(), d = s.db.getDeviceById('A')!;
  if (change === 'duplicate') s.db.getDeviceById('B')!.network.ipAddress = d.network.ipAddress;
  if (change === 'conflict') d.identityConflicts = [{ detectedAt: 'now', reason: 'conflicting identity' }];
  if (change === 'address') d.network.ipAddress = '192.0.2.200';
  if (change === 'removed') d.id = 'removed';
  if (change === 'stale') d.sessionVerification = 'NOT_FOUND';
  if (change === 'anchor') d.anchor.macAddress = '00:50:f9:63:fb:aa';
  if (change === 'project') s.db.createNewProject('Different');
  s.sessions.reconcile(); denied(() => s.channel.dispatch(message(a)));
});
test('resolved collision cannot revive revoked lease; fresh issue uses current decision', () => { const s = setup(), a = s.active(), b = s.db.getDeviceById('B')!; b.network.ipAddress = '192.0.2.100'; s.sessions.reconcile(); b.network.ipAddress = '192.0.2.101'; denied(() => s.channel.dispatch(message(a))); assert.equal(s.active().session.deviceId, 'A'); });
test('redemption rechecks evidence even without reconcile timer', () => { const s = setup(), h = s.issue(); s.db.getDeviceById('A')!.network.ipAddress = '192.0.2.200'; denied(() => s.channel.redeem(h.session.sessionId, 'A', h.secret.expose())); });
test('active expiry is absolute and cannot be renewed by readiness/status', () => { const s = setup(), a = s.active(); s.advance(BROWSER_SESSION_MS - 1); assert.equal(s.channel.dispatch(message(a, 'READY')).state, 'ACTIVE'); s.advance(1); denied(() => s.channel.dispatch(message(a))); });
test('closing one of multiple sessions leaves others active', () => { const s = setup(), a = s.active(), b = s.active('B'); s.channel.dispatch(message(a, 'CLOSE')); denied(() => s.channel.dispatch(message(a))); assert.equal(s.channel.dispatch(message(b)).session.deviceId, 'B'); });
test('channel disconnect revokes its sessions and disallows new issuance', () => { const s = setup(), a = s.active(); s.channel.disconnect(); denied(() => s.channel.dispatch(message(a))); denied(() => s.issue()); });
for (const operation of ['PAIR', 'MATCH_NETWORK', 'CREDENTIALS', 'PROJECT_WRITE', 'REPORT_WRITE', 'DISCOVERY', 'CONFIGURE']) test(`native contract rejects ${operation}`, () => { const s = setup(), a = s.active(); denied(() => s.channel.dispatch(message(a, operation))); });
test('native contract rejects URL/password payloads instead of echoing them', () => { const s = setup(), a = s.active(); denied(() => s.channel.dispatch({ ...message(a), password: 'fixture-password', url: 'http://evil.invalid' })); });
test('host readiness/navigation reports cannot change device evidence', () => { const s = setup(), a = s.active(), before = JSON.stringify(s.db.getSession()); s.channel.dispatch(message(a, 'READY')); s.channel.dispatch({ ...message(a, 'NAVIGATION'), canGoBack: true, canGoForward: false }); assert.equal(JSON.stringify(s.db.getSession()), before); });
test('creation and redemption are read-only with no launch or Windows dependencies', () => { const s = setup(), before = JSON.stringify(s.db.getSession()); s.active(); assert.equal(JSON.stringify(s.db.getSession()), before); assert.equal(s.launches.length, 0); });
test('external access works without renderer session creation or availability', async () => { const s = setup(); s.sessions.clear(); await s.connect.open('A', 'SYSTEM'); assert.deepEqual(s.launches, ['http://192.0.2.100']); });
test('iframe capability lifecycle keeps history disabled and expiry block terminal', () => { const s = setup(), h = s.sessions.createIframe('A'), r = new IframeCameraRenderer(); r.open(h.session); assert.equal(r.state, 'LOADING'); r.displayed(); assert.equal(r.state, 'DISPLAYED'); const revision = r.revision; r.refresh(); assert.equal(r.revision, revision + 1); r.goBack(); r.goForward(); assert.equal(r.canGoBack || r.canGoForward, false); r.block(); r.refresh(); assert.equal(r.state, 'BLOCKED'); assert.equal(r.session, null); });
test('iframe sessions cannot use native redemption and close independently', () => { const s = setup(), a = s.sessions.createIframe('A'), b = s.sessions.createIframe('B'); denied(() => s.channel.redeem(a.session.sessionId, 'A', a.secret.expose())); s.sessions.closeIframe(a.session.sessionId, 'A', a.secret.expose()); assert.equal(s.sessions.iframeStatus(b.session.sessionId, 'B', b.secret.expose()).deviceId, 'B'); });
test('unsafe endpoint and URL credentials fail closed', () => { const s = setup(); for (const url of ['http://user:pass@192.0.2.100', 'http://192.0.2.100/?token=x', 'http://192.0.2.101', 'file:///tmp/x']) { const store = new CameraBrowserSessions(() => ({ key: 'x', devices: s.db.getDevices(), collisions: [] }), () => url); denied(() => store.createIframe('A')); } });
test('caller mutation of metadata cannot retarget server-owned session', () => { const s = setup(), h = s.issue(); h.session.origin = 'http://192.0.2.200'; assert.equal(s.channel.redeem(h.session.sessionId, 'A', h.secret.expose()).session.origin, 'http://192.0.2.100'); });
test('origin gate rejects cameras, absent/null origin, foreign hosts and missing custom header', () => { assert.ok(cameraBrowserOriginAllowed('localhost:3001', 'http://localhost:3001', '1')); assert.ok(cameraBrowserOriginAllowed('localhost:3001', 'http://localhost:5173', '1', true)); for (const origin of [undefined, 'null', 'http://192.0.2.100', 'http://localhost.evil:3001', 'http://localhost:5173']) assert.equal(cameraBrowserOriginAllowed('localhost:3001', origin, '1'), false); assert.equal(cameraBrowserOriginAllowed('evil:3001', 'http://localhost:3001', '1'), false); assert.equal(cameraBrowserOriginAllowed('localhost:3001', 'http://localhost:3001', undefined), false); });

for (const output of ['project', 'report', 'reportSet', 'support', 'tasks', 'errors'] as const) test(`authorization secrets absent from actual ${output} serialization`, () => {
  const s = setup(), h = s.issue(), a = s.active(), secrets = [h.secret.expose(), a.channelToken.expose()];
  let serialized = '';
  if (output === 'project') serialized = s.db.exportProjectJson();
  if (output === 'report') { const reports = new ReportService(); serialized = reports.json(reports.build(s.db.getSession(), [], { type: 'DEVICE_INVENTORY', scope: 'ALL' })); }
  if (output === 'reportSet') { const set = new ReportSet(() => s.db.getSession()); set.add(['A']); serialized = JSON.stringify(set.snapshot()); }
  if (output === 'support') serialized = JSON.stringify(new SupportBundleBuilder().build({ application: { name: 'fixture', version: 'test', runtime: 'test', platform: 'test' }, readiness: {}, network: [], monitoring: {}, discovery: {}, projectSession: s.db.getSession(), events: [], pair: null }));
  if (output === 'tasks') { const tasks = new TaskManager(); tasks.begin('DIAGNOSTICS', secrets[0]); serialized = JSON.stringify(tasks.snapshot()); }
  if (output === 'errors') { try { s.channel.redeem('wrong', 'A', secrets[0]); } catch (e) { serialized = String(e); } }
  secrets.forEach(secret => assert.ok(!serialized.includes(secret)));
});
test('defense-in-depth redacts bare browser secrets in support/error text', () => { const s = setup(), h = s.issue(), raw = h.secret.expose(); assert.ok(!JSON.stringify(sanitizeSupportEvidence({ message: 'Failure ' + raw })).includes(raw)); assert.ok(!sanitizeTechnicalDetail('Failure ' + raw)?.includes(raw)); });
test('normal service lifecycle emits no authorization secrets to server logs', () => {
  const s = setup(), logs: string[] = [], originals = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  try {
    for (const key of ['log', 'info', 'warn', 'error'] as const) console[key] = (...args: unknown[]) => { logs.push(args.map(v => inspect(v)).join(' ')); };
    const h = s.issue(), a = s.channel.redeem(h.session.sessionId, 'A', h.secret.expose()); s.channel.dispatch(message(a)); s.channel.disconnect();
    assert.equal(logs.length, 0);
  } finally { Object.assign(console, originals); }
});
test('changed approved origin revokes a live lease', () => { const s = setup(), h = s.sessions.createIframe('A'); s.db.getDeviceById('A')!.network.xAddr = 'https://192.0.2.100:8443/onvif'; denied(() => s.sessions.iframeStatus(h.session.sessionId, 'A', h.secret.expose())); });
test('store capacity is bounded and expired leases are collected', () => { const s = setup(); for (let i = 0; i < 128; i++) s.issue(); denied(() => s.issue()); s.advance(HANDOFF_MS); assert.equal(s.issue().session.deviceId, 'A'); });
test('failed host report invalidates session permanently', () => { const s = setup(), a = s.active(); assert.equal(s.channel.dispatch(message(a, 'FAILED')).state, 'CLOSED'); denied(() => s.channel.dispatch(message(a, 'READY'))); });

test('HTTP contract exposes iframe-only scoped operations and denies broad/native authority', async () => {
  const s = setup(), app = express(); app.use('/api/camera-browser', cameraBrowserRoutes(s.sessions));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const call = (path: string, body: unknown = {}, token = '', origin = 'http://localhost:3001') => new Promise<Response>((resolve, reject) => {
      const req = request(`http://127.0.0.1:${port}/api/camera-browser${path}`, { method: 'POST', headers: { Host: 'localhost:3001', Origin: origin, 'Content-Type': 'application/json', 'X-CCTV-Workspace': '1', 'X-CCTV-Browser-Token': token } }, res => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(new Response(Buffer.concat(chunks).toString(), { status: res.statusCode, headers: { 'cache-control': String(res.headers['cache-control'] || '') } }))); });
      req.on('error', reject); req.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
    assert.equal((await call('/sessions', { deviceId: 'A' }, '', 'http://192.0.2.100')).status, 403);
    assert.equal((await call('/sessions', { deviceId: 'A', renderer: 'WINDOWS_WEBVIEW2' })).status, 409);
    const response = await call('/sessions', { deviceId: 'A' }); assert.equal(response.headers.get('cache-control'), 'no-store'); const body = await response.json();
    const malformed = await call('/sessions', '{' + body.controlToken); assert.equal(malformed.status, 400); assert.ok(!(await malformed.text()).includes(body.controlToken));
    const oversized = await call('/sessions', { deviceId: 'A'.repeat(3000) }); assert.equal(oversized.status, 400);
    assert.equal(body.session.renderer, 'IFRAME');
    assert.equal((await call(`/sessions/${body.session.sessionId}/status`, { deviceId: 'B' }, body.controlToken)).status, 409);
    assert.equal((await call(`/sessions/${body.session.sessionId}/status`, { deviceId: 'A' }, body.controlToken)).status, 200);
    for (const path of ['/redeem', '/pair', '/credentials', '/project', '/reports', '/sessions/x/configure']) assert.equal((await call(path, { deviceId: 'A' }, body.controlToken)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
