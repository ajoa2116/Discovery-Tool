/** Fixture-only composition. No CLI target, environment gate, production database or adapter service. */
import { createServer, request as httpRequest } from 'node:http';
import { networkInterfaces } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import express from 'express';
import assert from 'node:assert/strict';
import { CameraBrowserSessions } from '../core/connect/camera_browser_sessions.ts';
import { CameraRendererService } from '../core/connect/camera_renderer_service.ts';
import { checkNativeCapability } from '../core/connect/native_camera_capability.ts';
import { launchNativeProof } from '../core/connect/native_camera_proof.ts';
import { cameraBrowserRoutes } from '../server/camera_browser_routes.ts';
import { decideCameraAccess } from '../shared/camera_access.ts';
import { Device } from '../types/index.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let passed = 0, hits = 0, rendered = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); passed++; console.log('PASS: ' + label); };
const address = Object.values(networkInterfaces()).flat().find(n => n && !n.internal && n.family === 'IPv4' && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address;
if (!address) throw Error('Existing private local address required; no adapter changes permitted.');
const resource = createServer((req, res) => {
  hits++; res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
  res.end(`<html><body style="font:24px sans-serif;padding:40px"><h1 id="fixture-proof">CCTV controlled native fixture</h1><p>${req.url === '/second' ? 'Second controlled page' : 'Initial controlled page'}</p><p>No camera credentials or network configuration.</p>${req.url === '/' ? '<script>if(!sessionStorage.visited){sessionStorage.visited="1";setTimeout(()=>location.href="/second",2500)}</script>' : ''}</body></html>`);
});
await new Promise<void>(resolve => resource.listen(0, address, resolve));
const origin = `http://${address}:${(resource.address() as { port: number }).port}`;
const device: Device = { id: 'phase17e-owned-local-fixture', anchor: { macAddress: null, onvifEndpointUuid: 'phase17e-fixture-uuid', vendor: 'Controlled fixture', model: 'Local test page' }, technician: { name: 'Phase 17E fixture' }, network: { ipAddress: address, port: 80, protocol: 'ONVIF', subnetMask: '255.255.255.0' }, status: 'ONLINE', sessionVerification: 'VERIFIED', discoveredPhase: 3, firstSeenAt: 'fixture', lastSeenAt: 'fixture' };
const sessions = new CameraBrowserSessions(() => ({ key: '17e-fixture', devices: [device], collisions: [] }), () => origin);
const handles: ReturnType<typeof launchNativeProof>[] = [];
const service = new CameraRendererService(sessions, {
  fixtureAuthority: Object.freeze({ permits: (id: string, target: string) => resource.listening && id === device.id && target === origin }),
  launch: (authority, id, options) => {
    const handle = launchNativeProof(authority, id, { ...options, integrationSmoke: true, onEvent: event => { console.log('Native event: ' + event.code); if (event.code === 'PAGE_RENDERED') rendered++; options?.onEvent?.(event); } });
    handles.push(handle); return handle;
  },
});
const app = express();
app.use('/api/camera-browser', cameraBrowserRoutes(sessions, true, service));
app.get('/api/connect/:id', (req, res) => res.json({ endpoint: { url: origin, scheme: 'http', source: 'DIAGNOSTIC', verified: true }, accessDecision: decideCameraAccess(req.params.id, [device], []) }));
const api = createServer(app); await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  check((await checkNativeCapability()).available, 'actual unelevated host/runtime capability');
  const page = await browser.newPage(), errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  await page.addInitScript((d: Device) => { (window as any).__nativeFixture = d; }, device);
  // Transport proxy only: all renderer/session decisions run through the actual router/service.
  await page.route('http://localhost:3001/**', async (route: any) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const outgoing = httpRequest(apiOrigin + path, { method: req.method(), headers: { ...req.headers(), host: 'localhost:3001', origin: 'http://127.0.0.1:5173' } }, incoming => { let body = ''; incoming.on('data', chunk => body += chunk); incoming.on('end', () => resolve({ status: incoming.statusCode!, body })); });
      outgoing.on('error', reject); outgoing.end(req.postData() || undefined);
    });
    await route.fulfill({ status: response.status, contentType: 'application/json', body: response.body });
  });
  await page.goto('http://127.0.0.1:5179/src/test/browser/native_workspace.html');
  await page.getByRole('button', { name: 'Open fixture', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Camera Browser' });
  await workspace.getByText('Native browser active in the dedicated Camera Browser window.', { exact: true }).waitFor({ timeout: 20000 }).catch(async (error: Error) => { console.log(await workspace.innerText()); throw error; });
  check(true, 'React authorization → selection → private pipe → real WebView2 active');
  await page.waitForFunction(() => document.querySelector('iframe') === null);
  check(await workspace.locator('iframe').count() === 0, 'native workspace has no misleading iframe');
  await workspace.getByRole('button', { name: 'Back', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Back')?.disabled === false);
  for (let i = 0; i < 100 && rendered < 2; i++) await new Promise(r => setTimeout(r, 100));
  check(rendered >= 2, 'fixed native DOM assertion and screenshot confirm both fixture pages rendered');
  check(hits >= 2, 'only owned local resource received fixture navigation');
  await workspace.getByRole('button', { name: 'Back', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Forward')?.disabled === false);
  check(true, 'native Back updates workspace Forward capability');
  await workspace.getByRole('button', { name: 'Forward', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Forward')?.disabled === true);
  check(true, 'native Forward updates workspace history');
  const before = hits, renderedBeforeRefresh = rendered; await workspace.getByRole('button', { name: 'Refresh', exact: true }).click();
  for (let i = 0; i < 50 && hits === before; i++) await new Promise(r => setTimeout(r, 100));
  for (let i = 0; i < 100 && rendered <= renderedBeforeRefresh; i++) await new Promise(r => setTimeout(r, 100));
  check(hits > before, 'React Refresh reloads the authorized native session');
  const reused = await service.open(device.id);
  check(handles.length === 1, 'same-camera repeated access focuses/reuses one window');
  // Request normal OS close only for the host child of our owned broker.
  const broker = handles[0].processId!;
  const title = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${Number(broker)} -and $_.Name -eq 'CameraBrowserHost.exe' } | ForEach-Object { (Get-Process -Id $_.ProcessId).MainWindowTitle }`], { windowsHide: true, encoding: 'utf8' });
  check(title.includes('Phase 17E fixture') && title.includes(address) && title.includes(device.id), 'actual native title carries authorized name/address/stable identity context');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${Number(broker)} -and $_.Name -eq 'CameraBrowserHost.exe' } | ForEach-Object { (Get-Process -Id $_.ProcessId).CloseMainWindow() | Out-Null }`], { windowsHide: true, stdio: 'ignore' });
  await workspace.getByText('Native renderer closed. Reopen to check current access.', { exact: true }).waitFor({ timeout: 15000 });
  check(true, 'native OS close reaches workspace CLOSED state');
  await workspace.getByRole('button', { name: 'Close Camera Browser', exact: true }).click();
  await page.getByRole('button', { name: 'Open fixture', exact: true }).click();
  await workspace.getByText('Native browser active in the dedicated Camera Browser window.', { exact: true }).waitFor({ timeout: 20000 });
  const reopened = await service.open(device.id);
  check(reopened.session.sessionId !== reused.session.sessionId && handles.length === 2, 'reopen receives fresh session and private handoff');
  device.sessionVerification = 'NOT_VERIFIED'; service.reconcile();
  await workspace.getByText('Native browser authorization or security check failed. Close and reopen to check current evidence.', { exact: true }).waitFor({ timeout: 10000 });
  check(true, 'evidence revocation stops native and blocks workspace');
  check(errors.length === 0, 'no React runtime errors');
  console.log(`Native application GUI integration: ${passed} passed, 0 failed, 0 skipped`);
} finally {
  service.dispose(); sessions.clear(); handles.forEach(h => h.close());
  await Promise.all(handles.map(h => h.done)); await browser.close();
  await Promise.all([new Promise<void>(r => api.close(() => r())), new Promise<void>(r => resource.close(() => r()))]);
}
