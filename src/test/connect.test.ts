import { BrowserPreference, Device } from '../types/index.ts';
import { BrowserLauncher, ConnectError, ConnectService } from '../core/connect/connect_service.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { OSCredentialVault } from '../core/storage/vault.ts';
import { DeviceDiagnosticEngine } from '../core/engine/diagnostic_engine.ts';

const makeDevice = (): Device => ({ id: 'stable-camera', anchor: { macAddress: '00:40:8c:00:00:64', onvifEndpointUuid: 'uuid-camera', vendor: 'Axis', model: 'P3265' }, network: { ipAddress: '192.168.1.64', subnetMask: '255.255.255.0', port: 8080, protocol: 'ONVIF' }, status: 'ONLINE', discoveredPhase: 3, firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), technician: { name: 'Lobby', location: 'North Entry' }, diagnostics: { checks: [] } });
class FakeLauncher implements BrowserLauncher { launches: Array<{ url: string; preference: BrowserPreference }> = []; supported: BrowserPreference[] = ['SYSTEM', 'EMBEDDED']; async available() { return this.supported; } async launch(url: string, preference: BrowserPreference) { this.launches.push({ url, preference }); return { used: this.supported.includes(preference) ? preference : 'SYSTEM' as BrowserPreference, fallback: !this.supported.includes(preference) }; } }
class FakeDiagnostics extends DeviceDiagnosticEngine { override async diagnose(device: Device) { device.status = 'ONLINE'; device.diagnostics = { checks: [{ type: 'HTTP', targetIp: device.network.ipAddress, port: 80, success: true, timestamp: new Date().toISOString() }] }; return device; } }

async function run() {
  let passed = 0, failed = 0; const assert = (value: unknown, name: string) => { if (value) { console.log(`  PASS: ${name}`); passed++; } else { console.error(`  FAIL: ${name}`); failed++; } };
  const setup = () => { const db = new SiteProjectDatabase(); db.createNewProject('Connect Test'); const device = makeDevice(); db.upsertDevice(device); const launcher = new FakeLauncher(); const vault = new OSCredentialVault(); return { db, device, launcher, vault, service: new ConnectService(db, launcher, vault, new FakeDiagnostics()) }; };
  const s = setup();
  s.device.diagnostics!.checks = [
    { type: 'HTTP', targetIp: s.device.network.ipAddress, port: 8080, success: true, timestamp: new Date().toISOString() },
    { type: 'HTTPS', targetIp: s.device.network.ipAddress, port: 8443, success: true, certificateTrusted: false, certificateWarning: 'self-signed', timestamp: new Date().toISOString() },
  ];
  let resolved = s.service.resolve(s.device.id);
  assert(resolved.endpoint.url === 'https://192.168.1.64:8443' && resolved.endpoint.verified, 'HTTPS preferred and non-default verified port preserved');
  s.device.diagnostics!.checks = s.device.diagnostics!.checks.filter(check => check.type !== 'HTTPS');
  resolved = s.service.resolve(s.device.id); assert(resolved.endpoint.url === 'http://192.168.1.64:8080', 'HTTP fallback uses verified non-default port');
  s.device.diagnostics!.checks = []; resolved = s.service.resolve(s.device.id); assert(resolved.endpoint.url === 'http://192.168.1.64' && !resolved.endpoint.port && resolved.endpoint.source === 'IP_FALLBACK', 'unverified fallback invents no explicit port');
  s.device.network.xAddrs = ['https://192.168.1.64:9443/onvif/device_service']; resolved = s.service.resolve(s.device.id); assert(resolved.endpoint.url === 'https://192.168.1.64:9443', 'validated XAddr preserves real port');
  s.device.status = 'DIFFERENT_SUBNET'; resolved = s.service.resolve(s.device.id); assert(resolved.readiness.pairAvailable && resolved.readiness.state === 'DIFFERENT_SUBNET' && !s.launcher.launches.length, 'Different Subnet presents Pair without automatic network or browser action');
  s.device.status = 'UNREACHABLE'; assert(s.service.resolve(s.device.id).readiness.retryDiagnoseAvailable, 'Unreachable presents Retry Diagnose');
  s.device.status = 'UNKNOWN'; assert(s.service.resolve(s.device.id).readiness.canOpenManually, 'Unknown permits cautious manual open');
  const duplicate = makeDevice(); duplicate.id = 'duplicate-2'; duplicate.anchor.macAddress = '00:40:8c:00:00:65'; duplicate.anchor.onvifEndpointUuid = 'uuid-2'; s.db.upsertDevice(duplicate); s.device.status = 'COLLISION'; resolved = s.service.resolve(s.device.id); assert(resolved.readiness.state === 'AMBIGUOUS' && resolved.deviceId === 'stable-camera' && resolved.identity.mac === '00:40:8c:00:00:64', 'duplicate ambiguity and selected stable identity preserved');
  s.device.status = 'ONLINE'; await s.service.open(s.device.id, 'SYSTEM'); assert(s.launcher.launches.at(-1)?.preference === 'SYSTEM', 'external browser defaults to Windows System Default');
  const fallback = await s.service.open(s.device.id, 'CHROME'); assert(fallback.browser.fallback && fallback.browser.used === 'SYSTEM', 'unavailable preferred browser falls back safely');
  const embedded = await s.service.open(s.device.id, 'EMBEDDED'); assert(embedded.browser.used === 'EMBEDDED' && !s.launcher.launches.at(-1)?.url.includes('@'), 'embedded mode remains optional with external-safe URL');
  assert(s.launcher.launches.every(item => !item.url.includes('@') && !/password|credential/i.test(item.url)), 'credentials never appear in URLs');
  assert(!('clipboard' in s.service), 'Connect service has no automatic clipboard password surface');
  const safe = s.service.safeCredentials(s.device.id); assert(safe.references.length > 0 && safe.references.every(ref => !('password' in ref)), 'saved password never returned to frontend');
  const reference = safe.references[0]; assert(s.service.associateCredential(s.device.id, reference.id).credentialId === reference.id, 'opaque credential reference association');
  const saved = s.service.saveCredential(s.device.id, { username: 'tech', password: 'super-secret-value', remember: true }); assert(saved.remembered && !JSON.stringify(saved).includes('super-secret-value'), 'credential save response excludes plaintext');
  assert(!s.db.exportProjectJson().includes('super-secret-value'), 'project serialization excludes credentials');
  assert(!JSON.stringify(s.device.connectionHistory).includes('super-secret-value') && s.device.connectionHistory?.every(entry => entry.url.startsWith('http')), 'connect history is non-sensitive');
  assert(s.service.markFirstLogin(s.device.id, true) === 'PASSWORD_SETUP_REQUIRED' && s.device.activationState !== 'TECHNICIAN_REPORTED_COMPLETE', 'first-login requirement does not fabricate completion');
  const rechecked = await s.service.recheck(s.device.id); assert(rechecked.device.diagnostics?.checks.some(check => check.success) && rechecked.device.connectionHistory?.some(entry => entry.event === 'RECHECK'), 'return Recheck updates existing diagnostic evidence');
  const stableId = s.device.id; const moved = makeDevice(); moved.network.ipAddress = '192.168.2.64'; moved.anchor.macAddress = s.device.anchor.macAddress; moved.anchor.onvifEndpointUuid = s.device.anchor.onvifEndpointUuid; s.db.upsertDevice(moved); assert(s.db.getDevices().some(d => d.id === stableId && d.network.ipAddress === '192.168.2.64'), 'camera IP change retains stable identity');
  assert(!('pair' in s.service), 'camera IP change cannot auto-Pair');
  const projectJson = s.db.exportProjectJson(); const openedDb = new SiteProjectDatabase(); openedDb.importProjectJson(projectJson); const unopenedLauncher = new FakeLauncher(); new ConnectService(openedDb, unopenedLauncher, new OSCredentialVault(), new FakeDiagnostics()); assert(unopenedLauncher.launches.length === 0, 'opening a project does not auto-connect');
  const quickDb = new SiteProjectDatabase(); const quick = makeDevice(); quickDb.upsertDevice(quick); const quickLauncher = new FakeLauncher(); await new ConnectService(quickDb, quickLauncher, new OSCredentialVault(), new FakeDiagnostics()).open(quick.id, 'SYSTEM'); assert(quickDb.getSession().mode === 'QUICK_WORK' && quickLauncher.launches.length === 1, 'Quick Work connects without project creation');
  s.device.network.xAddrs = ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test', 'http://10.0.0.1/admin']; s.device.diagnostics!.checks = []; resolved = s.service.resolve(s.device.id); assert(resolved.endpoint.source === 'IP_FALLBACK' && /^http:\/\/192\.168\.2\.64$/.test(resolved.endpoint.url), 'URL/protocol validation prevents arbitrary URL and SSRF targets');
  let invalidBrowser = false; try { await s.service.open(s.device.id, 'SAFARI' as BrowserPreference); } catch (error) { invalidBrowser = error instanceof ConnectError && error.code === 'INVALID_BROWSER'; } assert(invalidBrowser, 'arbitrary browser/process launch prevented');
  assert(!('launchUrl' in s.service) && !('execute' in s.service), 'no arbitrary URL or process execution surface');
  s.db.getDeviceById(s.device.id)!.status = 'COLLISION'; assert(s.service.resolve(s.device.id).readiness.warning?.includes('cannot be attributed'), 'duplicate shared-IP access remains visibly ambiguous');
  console.log(`\nConnect summary: ${passed} passed, ${failed} failed`); if (failed) process.exit(1);
}
run().catch(error => { console.error(error); process.exit(1); });
