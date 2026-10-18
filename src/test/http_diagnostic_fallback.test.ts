import { DeviceDiagnosticEngine, NodeHttpDiagnosticProvider } from '../core/engine/diagnostic_engine.ts';
import type { Device, DiagnosticCheckEvidence } from '../types/index.ts';

// Per-instance request stubs: the real provider's check() runs, but no HTTP transport is invoked.
const ip = '192.0.2.50';
const headAt = '2026-10-18T12:00:00.000Z', getAt = '2026-10-18T12:00:01.000Z';
let passed = 0, failed = 0;
const assert = (value: unknown, label: string) => {
  if (value) { passed++; console.log('PASS: ' + label); }
  else { failed++; console.error('FAIL: ' + label); }
};
const response = (protocol: 'http' | 'https', status: number, timestamp = headAt): DiagnosticCheckEvidence => ({
  type: protocol === 'http' ? 'HTTP' : 'HTTPS', targetIp: ip, port: protocol === 'http' ? 80 : 443,
  protocol: protocol.toUpperCase(), success: true, transportReachable: true, httpStatus: status,
  timestamp, responseTimeMs: timestamp === headAt ? 7 : 19,
  ...(protocol === 'https' ? { certificateTrusted: false, certificateWarning: timestamp === headAt ? 'HEAD certificate warning' : 'GET certificate warning' } : {}),
});
const failure = (protocol: 'http' | 'https', category: 'TIMEOUT' | 'NETWORK_UNREACHABLE' | 'CANCELLED' | 'TRANSPORT_ERROR'): DiagnosticCheckEvidence => ({
  type: protocol === 'http' ? 'HTTP' : 'HTTPS', targetIp: ip, port: protocol === 'http' ? 80 : 443,
  protocol: protocol.toUpperCase(), success: false, transportReachable: false, timestamp: getAt,
  errorCategory: category, timeout: category === 'TIMEOUT', errorMessage: 'Injected ' + category,
});
const stub = (head: DiagnosticCheckEvidence, get?: DiagnosticCheckEvidence, duringGet?: () => void) => {
  const provider = new NodeHttpDiagnosticProvider();
  const calls: Array<{ ip: string; method: string; signal?: AbortSignal }> = [];
  Object.defineProperty(provider, 'request', { value: async (target: string, options: { signal?: AbortSignal }, method: string) => {
    calls.push({ ip: target, method, signal: options.signal });
    if (method === 'HEAD') return structuredClone(head);
    if (method !== 'GET' || !get) throw Error('Unexpected stub request: ' + method);
    duringGet?.(); return structuredClone(get);
  } });
  return { provider, calls };
};
const options = (protocol: 'http' | 'https', signal?: AbortSignal) => ({ protocol, port: protocol === 'http' ? 80 : 443, timeoutMs: 100, signal });
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function run() {
  for (const protocol of ['http', 'https'] as const) for (const status of [405, 501]) {
    const head = response(protocol, status);
    for (const category of ['TIMEOUT', 'NETWORK_UNREACHABLE', 'TRANSPORT_ERROR'] as const) {
      const failedGet = failure(protocol, category), fixture = stub(head, failedGet);
      const result = await fixture.provider.check(ip, options(protocol));
      assert(equal(result, head), protocol + ' HEAD ' + status + ' survives GET ' + category + ' with original details');
      assert(fixture.calls.map(call => call.method).join() === 'HEAD,GET' && fixture.calls.every(call => call.ip === ip), 'fallback remains bounded to HEAD then GET for the same target');
      assert(result.httpStatus === status && result.timestamp === headAt && result.success && result.transportReachable, 'no fabricated GET 200 or replacement response timestamp');
    }
    for (const getStatus of [200, 401]) {
      const get = response(protocol, getStatus, getAt), fixture = stub(head, get);
      const result = await fixture.provider.check(ip, options(protocol));
      assert(equal(result, get), protocol + ' valid GET ' + getStatus + ' after HEAD ' + status + ' preserves actual GET evidence');
    }
    const cancelled = failure(protocol, 'CANCELLED'), controller = new AbortController();
    const cancellation = stub(head, cancelled, () => controller.abort());
    const cancelledResult = await cancellation.provider.check(ip, options(protocol, controller.signal));
    assert(equal(cancelledResult, cancelled) && !cancelledResult.success, protocol + ' cancellation is not replaced by earlier HEAD success');
    assert(cancellation.calls.every(call => call.signal === controller.signal), 'same cancellation signal reaches both requests');
  }
  for (const protocol of ['http', 'https'] as const) for (const status of [200, 302, 401, 403]) {
    const head = response(protocol, status), fixture = stub(head);
    const result = await fixture.provider.check(ip, options(protocol));
    assert(equal(result, head) && fixture.calls.length === 1, protocol + ' non-fallback HEAD ' + status + ' is unchanged');
  }
  for (const protocol of ['http', 'https'] as const) {
    const initial = failure(protocol, 'CANCELLED'), controller = new AbortController(); controller.abort();
    const fixture = stub(initial);
    assert(equal(await fixture.provider.check(ip, options(protocol, controller.signal)), initial) && fixture.calls.length === 1, 'cancelled HEAD remains cancelled without GET');
    const head = response(protocol, 405), controller2 = new AbortController();
    const lateAbort = stub(head, failure(protocol, 'TIMEOUT'), () => controller2.abort());
    const cancelled = await lateAbort.provider.check(ip, options(protocol, controller2.signal));
    assert(cancelled.errorCategory === 'CANCELLED' && !cancelled.success && !cancelled.transportReachable, protocol + ' abort observed at fallback decision remains explicit cancellation');
  }
  for (const protocol of ['http', 'https'] as const) for (const starting of ['UNKNOWN', 'OFFLINE', 'ONLINE'] as const) {
    const device: Device = { id: 'fixture', anchor: { macAddress: '00:11:22:33:44:50', onvifEndpointUuid: 'fixture-uuid', vendor: 'Fixture' },
      network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF' }, status: starting,
      sessionVerification: starting === 'UNKNOWN' ? 'NOT_VERIFIED' : 'VERIFIED', discoveredPhase: 3, firstSeenAt: headAt, lastSeenAt: headAt };
    const anchor = structuredClone(device.anchor), head = response(protocol, 405), fixture = stub(head, failure(protocol, 'TIMEOUT'));
    const engine = new DeviceDiagnosticEngine({
      ping: { async check() { return { ...failure('http', 'TIMEOUT'), type: 'PING' }; } },
      http: { async check(target, settings) { return settings.protocol === protocol ? fixture.provider.check(target, settings) : failure(settings.protocol, 'TIMEOUT'); } },
      tcp: { async check() { return { ...failure('http', 'TIMEOUT'), type: 'TCP', port: 554 }; } },
    });
    await engine.diagnose(device, { isRefresh: starting === 'ONLINE' });
    assert(device.status === 'ONLINE' && device.diagnostics?.checks.some(check => check.httpStatus === 405 && check.success && check.timestamp === headAt), protocol + ' classifier retains current HTTP response instead of false ' + starting + ' loss');
    assert(equal(device.anchor, anchor) && device.status !== ('AUTHENTICATED' as string), 'response evidence does not modify physical anchors or claim authenticated access');
  }
  console.log(`HTTP diagnostic fallback: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
