/** Deliberate fixture-only development invocation. No CLI address or arbitrary target input. */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import assert from 'node:assert/strict';
import { CameraBrowserSessions } from '../core/connect/camera_browser_sessions.ts';
import { launchNativeProof, NativeProofEvent } from '../core/connect/native_camera_proof.ts';
import { Device } from '../types/index.ts';

const address = Object.values(networkInterfaces()).flat().find(n => n && !n.internal && n.family === 'IPv4' && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address;
if (!address) throw Error('Native fixture requires an existing private local IPv4 address; no adapter change will be attempted.');
let hits = 0;
const server = createServer((_req, res) => {
  hits++; res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.end('<!doctype html><html><head><title>CCTV local native fixture</title></head><body style="font:24px sans-serif;padding:40px;background:#f8fafc;color:#172554"><h1 id="fixture-proof">CCTV controlled native fixture</h1><p>Local test content only. No camera credentials or network configuration.</p></body></html>');
});
await new Promise<void>(resolve => server.listen(0, address, resolve));
try {
  const origin = `http://${address}:${(server.address() as { port: number }).port}`;
  const device: Device = { id: 'controlled-native-fixture', anchor: { macAddress: null, onvifEndpointUuid: 'fixture-native-17d', vendor: 'Controlled local fixture' }, network: { ipAddress: address, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF' }, status: 'ONLINE', sessionVerification: 'VERIFIED', discoveredPhase: 3, firstSeenAt: 'fixture', lastSeenAt: 'fixture' };
  const sessions = new CameraBrowserSessions(() => ({ key: 'local-native-fixture', devices: [device], collisions: [] }), () => origin);
  const events: NativeProofEvent[] = [];
  const native = launchNativeProof(sessions, device.id, { smoke: true, onEvent: event => { events.push(event); console.log(JSON.stringify(event)); } });
  const result = await native.done;
  assert.ok(result.closed, 'native host closes through its authorized session');
  assert.ok(events.some(e => e.code === 'INITIALIZED'), 'actual WebView2 initialization');
  assert.ok(events.some(e => e.code === 'PAGE_RENDERED'), 'controlled DOM marker and native screenshot captured');
  assert.ok(hits > 0, 'owned HTTP fixture was requested');
  console.log('Native GUI smoke: 4 passed, 0 failed');
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
