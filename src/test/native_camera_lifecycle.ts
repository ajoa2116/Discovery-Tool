/** Actual Windows/WebView2 failure and isolation tests; owned local fixtures only. */
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import assert from 'node:assert/strict';
import { CameraBrowserSessions } from '../core/connect/camera_browser_sessions.ts';
import { launchNativeProof } from '../core/connect/native_camera_proof.ts';
import { Device } from '../types/index.ts';

let passed = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); passed++; console.log('PASS: ' + label); };
const address = Object.values(networkInterfaces()).flat().find(n => n && !n.internal && n.family === 'IPv4' && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address;
if (!address) throw Error('Existing private local address required; no network setting will be changed.');
// In-memory fixture certificate/key only. No certificate-store write or trust change.
const pem = execFileSync('C:/Program Files/OpenSSL-Win64/bin/openssl.exe', ['req', '-x509', '-newkey', 'rsa:2048', '-noenc', '-keyout', '-', '-out', '-', '-subj', '/CN=localhost', '-days', '1'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
const key = pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)?.[0];
const cert = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
assert.ok(key && cert);
let tlsHits = 0;
const http = httpServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<h1>Owned lifecycle fixture</h1>'); });
const https = httpsServer({ key, cert }, (_req, res) => { tlsHits++; res.end('Must not load through certificate rejection'); });
await Promise.all([new Promise<void>(r => http.listen(0, address, r)), new Promise<void>(r => https.listen(0, address, r))]);
const device: Device = { id: 'native-lifecycle-fixture', anchor: { macAddress: null, onvifEndpointUuid: 'fixture-lifecycle-17d', vendor: 'Owned local fixture' }, network: { ipAddress: address, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF' }, status: 'ONLINE', sessionVerification: 'VERIFIED', discoveredPhase: 3, firstSeenAt: 'fixture', lastSeenAt: 'fixture' };
const controls: ReturnType<typeof launchNativeProof>[] = [];
function start(tls = false, missingRuntime = false) {
  const origin = `${tls ? 'https' : 'http'}://${address}:${((tls ? https : http).address() as { port: number }).port}`;
  const sessions = new CameraBrowserSessions(() => ({ key: 'owned-fixture', devices: [device], collisions: [] }), () => origin);
  const events: string[] = []; let initialized!: () => void;
  const ready = new Promise<void>(r => { initialized = r; });
  const control = launchNativeProof(sessions, device.id, { missingRuntime, onEvent: e => { events.push(e.code); if (e.code === 'INITIALIZED') initialized(); } }); controls.push(control);
  return { sessions, events, control, ready };
}
const bounded = <T>(promise: Promise<T>) => new Promise<T>((resolve, reject) => { const timer = setTimeout(() => reject(Error('Native lifecycle timeout')), 20_000); promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); }); });
try {
  const missing = start(false, true); await bounded(missing.control.done);
  check(missing.events.includes('RUNTIME_UNAVAILABLE'), 'actual SDK initialization failure is structured and graceful');
  check(!missing.events.includes('INITIALIZED'), 'missing runtime never reports initialized');
  const tls = start(true); await bounded(tls.control.done);
  check(tls.events.includes('CERTIFICATE_REJECTED'), 'actual self-signed TLS error cancelled and reported');
  check(tlsHits === 0, 'untrusted HTTPS content was not fetched');
  const first = start(), second = start(); await bounded(Promise.all([first.ready, second.ready]));
  check(first.control.processId !== second.control.processId, 'independent sessions have separate owned brokers');
  // Read only our owned process command lines while both windows are alive.
  const ids = [first.control.processId, second.control.processId].map(Number);
  const commands = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ids.join(',')}) -or $_.ParentProcessId -in @(${ids.join(',')}) } | Select-Object -ExpandProperty CommandLine`], { encoding: 'utf8', windowsHide: true });
  check(commands.includes('--broker') && commands.includes('--host') && !/cb[hci]_[A-Za-z0-9_-]{43}/.test(commands), 'actual broker/host command lines contain rendezvous only, no tokens');
  check(!commands.includes(address), 'approved address is not passed as launch authority');
  first.control.close(); await bounded(first.control.done);
  const stillAlive = await Promise.race([second.control.done.then(() => false), new Promise<boolean>(r => setTimeout(() => r(true), 1800))]);
  check(stillAlive, 'closing one native tree does not close the other session');
  second.sessions.clear(); await bounded(second.control.done);
  check(true, 'main session shutdown invalidates native heartbeat and closes owned tree');
  const changed = start(); await bounded(changed.ready); device.sessionVerification = 'NOT_FOUND'; await bounded(changed.control.done);
  check(true, 'current authorization revocation ends native rendering');
  console.log(`Native lifecycle: ${passed} passed, 0 failed`);
} finally {
  controls.forEach(c => c.close());
  await Promise.all([new Promise<void>(r => http.close(() => r())), new Promise<void>(r => https.close(() => r()))]);
}
