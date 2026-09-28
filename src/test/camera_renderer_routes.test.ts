import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import express from 'express';
import { CameraBrowserSessions } from '../core/connect/camera_browser_sessions.ts';
import { CameraRendererService } from '../core/connect/camera_renderer_service.ts';
import { cameraBrowserRoutes } from '../server/camera_browser_routes.ts';
import { Device } from '../types/index.ts';

test('normal HTTP selection keeps production gate, scoped controls and redaction', async () => {
  const device = { id: 'fixture-A', anchor: { macAddress: null, onvifEndpointUuid: 'fixture-uuid', vendor: 'Fixture' }, network: { ipAddress: '192.0.2.1' }, status: 'ONLINE', sessionVerification: 'VERIFIED' } as Device;
  const sessions = new CameraBrowserSessions(() => ({ key: 'test', devices: [device], collisions: [] }), () => 'http://192.0.2.1');
  let launches = 0;
  const service = new CameraRendererService(sessions, { capability: async () => ({ available: true, code: 'AVAILABLE' }), launch: () => { launches++; throw Error('must never launch'); } });
  const app = express(); app.use('/api/camera-browser', cameraBrowserRoutes(sessions, true, service));
  const server = createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const call = (path: string, body: object, token = '', origin = 'http://localhost:5173') => new Promise<{ code: number; body: any }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: (server.address() as { port: number }).port, path: '/api/camera-browser' + path, method: 'POST', headers: { Host: 'localhost:3001', Origin: origin, 'X-CCTV-Workspace': '1', 'X-CCTV-Browser-Token': token, 'Content-Type': 'application/json' } }, res => { let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ code: res.statusCode!, body: JSON.parse(text) })); }); req.on('error', reject); req.end(JSON.stringify(body));
  });
  try {
    for (const extra of [{ fixture: true }, { renderer: 'WINDOWS_WEBVIEW2' }, { url: 'http://192.0.2.1' }, { nativeEnabled: true }]) assert.equal((await call('/open', { deviceId: device.id, ...extra })).code, 409);
    assert.equal((await call('/open', { deviceId: device.id }, '', 'http://192.0.2.1')).code, 403);
    assert.equal((await call('/open', { deviceId: '192.0.2.1' })).code, 409);
    const opened = await call('/open', { deviceId: device.id }); assert.equal(opened.code, 200); assert.equal(opened.body.snapshot.code, 'GATED'); assert.equal(launches, 0);
    const id = opened.body.session.sessionId, token = opened.body.controlToken;
    assert.equal((await call(`/controls/${id}/status`, { deviceId: device.id })).code, 409);
    const status = await call(`/controls/${id}/status`, { deviceId: device.id }, token); assert.equal(status.code, 200); assert.ok(!JSON.stringify(status.body).includes(token));
    assert.equal((await call(`/controls/${id}/command`, { deviceId: device.id, command: 'REFRESH' }, token)).code, 409);
    assert.equal((await call('/redeem', { deviceId: device.id, token }, token)).code, 404);
    assert.equal((await call(`/controls/${id}/close`, { deviceId: device.id }, token)).code, 200);
    assert.equal((await call(`/controls/${id}/status`, { deviceId: device.id }, token)).code, 409);
  } finally { service.dispose(); await new Promise<void>(r => server.close(() => r())); }
});

test('evidence changed during capability probing fails before launch', async () => {
  const device = { id: 'fixture-A', anchor: { macAddress: null, onvifEndpointUuid: 'fixture-uuid', vendor: 'Fixture' }, network: { ipAddress: '192.0.2.1' }, status: 'ONLINE', sessionVerification: 'VERIFIED' } as Device;
  const sessions = new CameraBrowserSessions(() => ({ key: 'test', devices: [device], collisions: [] }), () => 'http://192.0.2.1');
  let launches = 0;
  const service = new CameraRendererService(sessions, { fixtureAuthority: { permits: () => true }, capability: async () => { device.sessionVerification = 'NOT_VERIFIED'; return { available: true, code: 'AVAILABLE' }; }, launch: () => { launches++; throw Error(); } });
  await assert.rejects(service.open(device.id)); assert.equal(launches, 0); service.dispose();
});

test('shutdown during capability probing cannot launch a late native window', async () => {
  const device = { id: 'fixture-A', anchor: { macAddress: null, onvifEndpointUuid: 'fixture-uuid', vendor: 'Fixture' }, network: { ipAddress: '192.0.2.1' }, status: 'ONLINE', sessionVerification: 'VERIFIED' } as Device;
  const sessions = new CameraBrowserSessions(() => ({ key: 'test', devices: [device], collisions: [] }), () => 'http://192.0.2.1');
  let release!: () => void, launches = 0;
  const wait = new Promise<void>(resolve => release = resolve);
  const service = new CameraRendererService(sessions, { fixtureAuthority: { permits: () => true }, capability: async () => { await wait; return { available: true, code: 'AVAILABLE' }; }, launch: () => { launches++; throw Error(); } });
  const pending = service.open(device.id); service.dispose(); release();
  await assert.rejects(pending); await assert.rejects(service.open(device.id)); assert.equal(launches, 0);
});
