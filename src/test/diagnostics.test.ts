import http from 'node:http';
import net from 'node:net';
import { Device, DiagnosticCheckEvidence } from '../types/index.ts';
import {
  DeviceDiagnosticEngine,
  DiagnosticRefreshMonitor,
  HttpDiagnosticProvider,
  NodeHttpDiagnosticProvider,
  NodeTcpDiagnosticProvider,
  PingProvider,
  TcpDiagnosticProvider,
} from '../core/engine/diagnostic_engine.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';

const evidence = (type: DiagnosticCheckEvidence['type'], ip: string, success: boolean, extra: Partial<DiagnosticCheckEvidence> = {}): DiagnosticCheckEvidence => ({ type, targetIp: ip, success, transportReachable: success, timestamp: new Date().toISOString(), ...extra });
const makeDevice = (id = 'device-1', ip = '192.168.1.50', mac: string | null = '00:40:8c:00:00:50', uuid = 'uuid-1'): Device => {
  const now = new Date().toISOString();
  return { id, anchor: { macAddress: mac, onvifEndpointUuid: uuid, vendor: 'Axis' }, network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF' }, status: 'UNKNOWN', discoveredPhase: 3, firstSeenAt: now, lastSeenAt: now };
};

class FakePing implements PingProvider {
  constructor(public result: DiagnosticCheckEvidence) {}
  async check(): Promise<DiagnosticCheckEvidence> { return structuredClone(this.result); }
}
class FakeHttp implements HttpDiagnosticProvider {
  constructor(public httpResult: DiagnosticCheckEvidence, public httpsResult: DiagnosticCheckEvidence) {}
  async check(_ip: string, options: { protocol: 'http' | 'https' }): Promise<DiagnosticCheckEvidence> { return structuredClone(options.protocol === 'http' ? this.httpResult : this.httpsResult); }
}
class FakeTcp implements TcpDiagnosticProvider {
  constructor(public result: DiagnosticCheckEvidence) {}
  async check(): Promise<DiagnosticCheckEvidence> { return structuredClone(this.result); }
}

async function withHttpServer(status: number, action: (port: number) => Promise<void>, delayMs = 0) {
  const server = http.createServer((_req, res) => setTimeout(() => { res.statusCode = status; res.end(); }, delayMs));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await action((server.address() as net.AddressInfo).port); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

async function run() {
  let passed = 0, failed = 0;
  const assert = (condition: unknown, name: string) => { if (condition) { console.log(`  PASS: ${name}`); passed++; } else { console.error(`  FAIL: ${name}`); failed++; } };

  const httpProvider = new NodeHttpDiagnosticProvider();
  for (const status of [200, 401, 403, 302]) {
    await withHttpServer(status, async port => {
      const result = await httpProvider.check('127.0.0.1', { protocol: 'http', port, timeoutMs: 500 });
      assert(result.success && result.transportReachable && result.httpStatus === status, `HTTP ${status} counts as response evidence`);
    });
  }
  await withHttpServer(200, async port => {
    const result = await httpProvider.check('127.0.0.1', { protocol: 'http', port, timeoutMs: 25 });
    assert(!result.success && result.timeout && result.errorCategory === 'TIMEOUT', 'HTTP timeout is classified');
  }, 200);

  const tcpServer = net.createServer();
  await new Promise<void>(resolve => tcpServer.listen(0, '127.0.0.1', resolve));
  const openPort = (tcpServer.address() as net.AddressInfo).port;
  const tcpProvider = new NodeTcpDiagnosticProvider();
  const open = await tcpProvider.check('127.0.0.1', { port: openPort, timeoutMs: 300 });
  await new Promise<void>(resolve => tcpServer.close(() => resolve()));
  const closed = await tcpProvider.check('127.0.0.1', { port: openPort, timeoutMs: 300 });
  assert(open.success && open.transportReachable, 'TCP open port evidence');
  assert(!closed.success && closed.errorCategory === 'CONNECTION_REFUSED', 'TCP closed port evidence');

  const ip = '192.168.1.50';
  const pingSuccess = evidence('PING', ip, true, { responseTimeMs: 4 });
  const pingFailure = evidence('PING', ip, false, { timeout: true, errorCategory: 'TIMEOUT' });
  const httpFailure = evidence('HTTP', ip, false, { port: 80, errorCategory: 'CONNECTION_REFUSED' });
  const httpsFailure = evidence('HTTPS', ip, false, { port: 443, errorCategory: 'TIMEOUT' });
  const tcpFailure = evidence('TCP', ip, false, { port: 554, errorCategory: 'CONNECTION_REFUSED' });
  const tcpSuccess = evidence('TCP', ip, true, { port: 554 });

  const pingEngine = new DeviceDiagnosticEngine({ ping: new FakePing(pingSuccess), http: new FakeHttp(httpFailure, httpsFailure), tcp: new FakeTcp(tcpFailure) });
  const pingDevice = await pingEngine.diagnose(makeDevice());
  assert(pingDevice.diagnostics?.checks.some(check => check.type === 'PING' && check.success && check.responseTimeMs === 4), 'successful ping evidence recorded');

  const failedEngine = new DeviceDiagnosticEngine({ ping: new FakePing(pingFailure), http: new FakeHttp(httpFailure, httpsFailure), tcp: new FakeTcp(tcpFailure) });
  const failedDevice = await failedEngine.diagnose(makeDevice());
  assert(failedDevice.status === 'UNKNOWN', 'failed ping and insufficient prior session truth do not automatically mean Offline');

  const tlsEvidence = evidence('HTTPS', ip, true, { port: 443, certificateTrusted: false, certificateWarning: 'self-signed certificate' });
  const tlsEngine = new DeviceDiagnosticEngine({ ping: new FakePing(pingFailure), http: new FakeHttp(httpFailure, tlsEvidence), tcp: new FakeTcp(tcpFailure) });
  const tlsDevice = await tlsEngine.diagnose(makeDevice());
  assert(tlsDevice.status === 'ONLINE' && tlsDevice.diagnostics?.checks.some(check => check.type === 'HTTPS' && check.transportReachable && check.certificateTrusted === false), 'self-signed HTTPS remains reachable with certificate warning');

  const rtspEngine = new DeviceDiagnosticEngine({ ping: new FakePing(pingFailure), http: new FakeHttp(httpFailure, httpsFailure), tcp: new FakeTcp(tcpSuccess) });
  const rtspDevice = await rtspEngine.diagnose(makeDevice());
  assert(rtspDevice.status === 'ONLINE' && !rtspDevice.telemetry?.rtspStreamActive, 'TCP 554 success does not claim RTSP active');

  const onvifDevice = makeDevice();
  onvifDevice.reachability = { wsDiscoveryRespondedAt: new Date().toISOString() };
  await failedEngine.diagnose(onvifDevice);
  assert(onvifDevice.status === 'ONLINE' && onvifDevice.diagnostics?.checks.some(check => check.type === 'ONVIF_WS_DISCOVERY' && check.success), 'WS-Discovery evidence contributes to Online');

  const different = makeDevice('different', '192.168.2.50');
  different.reachability = { subnetClassification: 'DIFFERENT_SUBNET' };
  await pingEngine.diagnose(different);
  assert(different.status === 'DIFFERENT_SUBNET', 'Different Subnet classification is preserved');

  const db = new SiteProjectDatabase();
  db.createNewProject('Duplicates');
  const duplicateA = makeDevice('dup-a', ip, '00:40:8c:00:00:01', 'uuid-a');
  const duplicateB = makeDevice('dup-b', ip, '00:40:8c:00:00:02', 'uuid-b');
  db.upsertDevice(duplicateA); db.upsertDevice(duplicateB);
  assert(db.getDevices().length === 2, 'duplicate IP remains identity-separated');
  duplicateA.status = 'COLLISION';
  await pingEngine.diagnose(duplicateA, { ambiguousIdentity: true });
  assert(duplicateA.status === 'COLLISION' && duplicateA.diagnostics?.checks.every(check => check.ambiguousIdentity), 'ambiguous duplicate response is not attached as unique identity proof');

  const transition = makeDevice('transition');
  await pingEngine.diagnose(transition);
  await failedEngine.diagnose(transition, { isRefresh: true });
  assert(transition.status === 'UNREACHABLE', 'Online to Unreachable current-session transition');
  await pingEngine.diagnose(transition, { isRefresh: true });
  assert(transition.status === 'ONLINE', 'Unreachable to Online recovery');

  const persisted = new SiteProjectDatabase();
  persisted.createNewProject('History'); persisted.upsertDevice(transition);
  const reopened = new SiteProjectDatabase(); reopened.importProjectJson(persisted.exportProjectJson());
  assert(reopened.getDevices()[0].status === 'UNKNOWN' && !reopened.getDevices()[0].diagnostics, 'historical status and diagnostics do not become current live truth');

  let cancellationCleaned = false;
  const cancellablePing: PingProvider = { check(_ip, options) { return new Promise(resolve => { const done = () => { cancellationCleaned = true; resolve(evidence('PING', ip, false, { errorCategory: 'CANCELLED' })); }; options.signal?.addEventListener('abort', done, { once: true }); if (options.signal?.aborted) done(); }); } };
  const cancellableHttp: HttpDiagnosticProvider = { check(_ip, options) { return new Promise(resolve => { const done = () => resolve(evidence(options.protocol === 'http' ? 'HTTP' : 'HTTPS', ip, false, { errorCategory: 'CANCELLED' })); options.signal?.addEventListener('abort', done, { once: true }); if (options.signal?.aborted) done(); }); } };
  const cancellableTcp: TcpDiagnosticProvider = { check(_ip, options) { return new Promise(resolve => { const done = () => resolve(evidence('TCP', ip, false, { errorCategory: 'CANCELLED', port: options.port })); options.signal?.addEventListener('abort', done, { once: true }); if (options.signal?.aborted) done(); }); } };
  const controller = new AbortController();
  const pending = new DeviceDiagnosticEngine({ ping: cancellablePing, http: cancellableHttp, tcp: cancellableTcp }).diagnose(makeDevice('cancel'), { signal: controller.signal });
  controller.abort(); await pending;
  assert(cancellationCleaned, 'diagnostic cancellation cleans up provider work');

  class CountingEngine extends DeviceDiagnosticEngine {
    active = 0; max = 0;
    override async diagnose(device: Device): Promise<Device> { this.active++; this.max = Math.max(this.max, this.active); await new Promise(resolve => setTimeout(resolve, 10)); this.active--; return device; }
  }
  const counting = new CountingEngine();
  const monitorDevices = Array.from({ length: 8 }, (_, index) => makeDevice(`monitor-${index}`, `192.168.1.${index + 10}`));
  const monitor = new DiagnosticRefreshMonitor(counting, () => monitorDevices, () => undefined, 30_000, 3);
  await monitor.refreshNow();
  assert(counting.max <= 3, 'recurring refresh honors concurrency limit');
  monitor.start(); assert(monitor.getState().enabled && monitor.getState().intervalMs === 30_000, 'refresh cadence and state are truthful'); monitor.stop();

  assert(!rtspDevice.telemetry && !rtspDevice.switchTelemetry, 'diagnostics create no fabricated telemetry or switch data');
  const serializedEvidence = JSON.stringify(tlsDevice.diagnostics);
  assert(!/password|authorization|bearer|token|secret-key/i.test(serializedEvidence), 'diagnostic evidence contains no secrets or authorization data');

  console.log(`\nDiagnostics summary: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run().catch(error => { console.error(error); process.exit(1); });
