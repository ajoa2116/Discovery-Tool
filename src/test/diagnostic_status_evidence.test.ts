import { DeviceDiagnosticEngine } from '../core/engine/diagnostic_engine.ts';
import type { Device, DiagnosticCheckEvidence, DiagnosticCheckType } from '../types/index.ts';

// Inert provider-injection tests only: no default providers, sockets, timers or child processes.
const ip = '192.0.2.50';
const historicalAt = '2025-01-01T00:00:00.000Z';
const observedAt = '2026-10-17T12:00:00.000Z';
let passed = 0, failed = 0;
const assert = (condition: unknown, name: string) => {
  if (condition) { passed++; console.log('PASS: ' + name); }
  else { failed++; console.error('FAIL: ' + name); }
};
const evidence = (type: DiagnosticCheckType, success = false, port?: number): DiagnosticCheckEvidence => ({
  type, targetIp: ip, port, success, transportReachable: success, timestamp: observedAt,
  ...(success ? {} : { errorCategory: 'TIMEOUT' as const, timeout: true }),
});
const device = (): Device => ({
  id: 'inert-camera', anchor: { macAddress: '00:11:22:33:44:50', vendor: 'Fixture' },
  network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF' },
  status: 'UNKNOWN', sessionVerification: 'NOT_VERIFIED', discoveredPhase: 3,
  firstSeenAt: historicalAt, lastSeenAt: historicalAt,
  reachability: { wsDiscoveryRespondedAt: historicalAt },
});
const engine = (successful?: DiagnosticCheckType) => new DeviceDiagnosticEngine({
  ping: { async check() { return evidence('PING', successful === 'PING'); } },
  http: { async check(_ip, options) {
    const type = options.protocol === 'https' ? 'HTTPS' : 'HTTP';
    return { ...evidence(type, successful === type, options.port),
      ...(successful === type ? { httpStatus: 200, ...(type === 'HTTPS' ? { certificateTrusted: false, certificateWarning: 'Synthetic untrusted certificate' } : {}) } : {}) };
  } },
  tcp: { async check(_ip, options) { return evidence('TCP', successful === 'TCP', options.port); } },
});

async function run() {
  const historical = device();
  const oldCheck: DiagnosticCheckEvidence = { type: 'ONVIF_WS_DISCOVERY', targetIp: ip, success: true, timestamp: historicalAt };
  historical.diagnostics = { checks: [structuredClone(oldCheck)], lastSuccessfulContactAt: historicalAt };
  const observed: DiagnosticCheckEvidence[] = [];
  await engine().diagnose(historical, { onEvidence: item => observed.push(structuredClone(item)) });
  assert(historical.status === 'UNKNOWN', 'historical discovery plus failed probes stays Unknown, never Online');
  assert(historical.reachability?.wsDiscoveryRespondedAt === historicalAt, 'original discovery timestamp is unchanged');
  assert(JSON.stringify(historical.diagnostics.checks[0]) === JSON.stringify(oldCheck), 'existing historical diagnostic record is unchanged');
  assert(observed.length === 4 && observed.every(item => item.type !== 'ONVIF_WS_DISCOVERY' && !item.success), 'callbacks report only four current failed probes, without historical replay');
  assert(historical.diagnostics.checks.length === 5, 'history contains the original record and exactly the current probes');
  assert(historical.diagnostics.lastSuccessfulContactAt === historicalAt, 'failed probes do not renew last successful contact');
  assert(historical.sessionVerification === 'NOT_VERIFIED', 'historical discovery does not promote current verification');
  await engine().diagnose(historical);
  assert(historical.status === 'UNKNOWN' && historical.diagnostics.checks.filter(item => item.type === 'ONVIF_WS_DISCOVERY').length === 1, 'repeated manual runs do not replay discovery or manufacture Online');

  const noContact = device();
  await engine().diagnose(noContact);
  assert(noContact.diagnostics?.lastSuccessfulContactAt === undefined, 'historical discovery alone cannot create a successful diagnostic contact');

  for (const type of ['PING', 'HTTP', 'HTTPS', 'TCP'] as const) {
    const current = device(); await engine(type).diagnose(current);
    assert(current.status === 'ONLINE' && current.sessionVerification === 'VERIFIED', type + ' fresh success establishes Online');
    assert(current.diagnostics?.lastSuccessfulContactAt === observedAt && current.diagnostics.checks.some(item => item.type === type && item.success), type + ' success retains its genuine current observation');
    assert(current.reachability?.wsDiscoveryRespondedAt === historicalAt, type + ' success does not rewrite discovery history');
    if (type === 'HTTPS') assert(current.diagnostics?.checks.some(item => item.type === 'HTTPS' && item.success && item.certificateTrusted === false), 'HTTPS communication remains distinct from certificate trust');
  }

  const pingOnly = device(); pingOnly.sessionVerification = 'VERIFIED'; pingOnly.diagnostics = { checks: [] };
  engine().deriveStatus(pingOnly, [evidence('PING')], false);
  assert(pingOnly.status === 'UNKNOWN', 'failed ping alone does not establish Offline even for a verified device');
  const empty = device(); empty.diagnostics = { checks: [] };
  engine().deriveStatus(empty, [], false);
  assert(empty.status === 'UNKNOWN', 'empty evidence remains Unknown');

  const different = device(); different.reachability!.subnetClassification = 'DIFFERENT_SUBNET';
  await engine('HTTP').diagnose(different);
  assert(different.status === 'DIFFERENT_SUBNET', 'actual different-subnet evidence retains precedence over successful probes');
  const collision = device(); collision.status = 'COLLISION'; collision.reachability!.subnetClassification = 'DIFFERENT_SUBNET';
  await engine('PING').diagnose(collision, { ambiguousIdentity: true });
  assert(collision.status === 'COLLISION' && collision.diagnostics?.checks.every(item => item.ambiguousIdentity), 'Collision retains precedence and ambiguous responses remain marked');

  const session = device();
  await engine('PING').diagnose(session);
  await engine().diagnose(session, { isRefresh: true });
  assert(session.status === 'UNREACHABLE' && session.diagnostics?.consecutiveFailedRefreshes === 1, 'genuine current-session success followed by failed refresh becomes Unreachable');
  await engine('TCP').diagnose(session, { isRefresh: true });
  assert(session.status === 'ONLINE' && session.diagnostics?.consecutiveFailedRefreshes === 0, 'fresh recovery restores Online and resets failed-refresh count');
  const unknownSession = device(); await engine().diagnose(unknownSession, { isRefresh: true });
  assert(unknownSession.status === 'UNKNOWN', 'historical discovery alone cannot establish previously reachable session truth');
  const verified = device(); verified.sessionVerification = 'VERIFIED';
  await engine().diagnose(verified);
  assert(verified.status === 'OFFLINE', 'existing verified multi-probe negative classification is preserved without historical replay');

  const actualDiscovery = device(); actualDiscovery.diagnostics = { checks: [] };
  engine().deriveStatus(actualDiscovery, [{ ...oldCheck, timestamp: observedAt }], false);
  assert(actualDiscovery.status === 'ONLINE', 'an explicitly supplied current discovery observation remains valid positive evidence');
  console.log(`\nInert diagnostic status evidence: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
