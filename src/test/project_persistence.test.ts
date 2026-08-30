import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Device } from '../types/index.ts';
import { ProjectValidationError, SiteProjectDatabase } from '../core/storage/project_db.ts';
import { ProjectReverificationEngine } from '../core/engine/reverification.ts';

function device(id: string, ip: string, mac: string | null, uuid?: string): Device {
  const now = new Date().toISOString();
  return {
    id,
    anchor: { macAddress: mac, onvifEndpointUuid: uuid, serialNumber: `serial-${id}`, vendor: 'Axis Communications', model: 'P3265-LV' },
    network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF', ipAddressHistory: [ip] },
    status: 'ONLINE', discoveredPhase: 3, firstSeenAt: now, lastSeenAt: now,
    reachability: { lastSuccessfulResponseAt: now },
  };
}

async function expectReject(action: () => unknown | Promise<unknown>): Promise<boolean> {
  try { await action(); return false; } catch { return true; }
}

async function run() {
  let passed = 0;
  let failed = 0;
  const assert = (condition: unknown, name: string) => {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.error(`  FAIL: ${name}`); failed++; }
  };
  const directory = await fs.mkdtemp(join(tmpdir(), 'cctv-project-'));
  try {
    const db = new SiteProjectDatabase();
    assert(db.getSession().mode === 'QUICK_WORK' && db.getDevices().length === 0, 'empty Quick Work startup');
    db.upsertDevice(device('stable-1', '192.168.1.10', '00:40:8c:00:00:01', 'uuid-1'));
    assert(db.getSession().mode === 'QUICK_WORK' && !db.getSession().filePath, 'Quick Work remains memory-only');
    assert(await expectReject(() => db.exportProjectJson()), 'Quick Work cannot be silently exported');

    const originalId = db.getDevices()[0].id;
    db.createProjectFromCurrentResults('Site Alpha', 'Current survey');
    assert(db.getSession().mode === 'PROJECT' && db.getDevices().length === 1, 'create project from current results');
    assert(db.getDevices()[0].id === originalId, 'stable id preserved when keeping Quick Work results');

    db.updateDeviceTechnicianFields(originalId, { name: 'Lobby Camera', location: 'Lobby North', notes: 'Above entrance' });
    db.getDevices()[0].configuredState = { inferred: null, manualOverride: false };
    db.getDevices()[0].manufacturerParams = {
      harmlessSetting: 'retained', password: 'camera-password', nested: { authorization: 'Bearer token', apiKey: 'secret-key' },
    };
    db.getDevices()[0].customStaticProfile = { assignedIp: '192.168.1.10', assignedSubnet: '255.255.255.0', assignedGateway: '192.168.1.1', appliedCredentialsId: 'cred-axis-default' };
    const file = join(directory, 'site-alpha.cctvproj');
    await db.saveAs(file);
    const raw = await fs.readFile(file, 'utf8');
    const bundle = JSON.parse(raw);
    assert(bundle.format === 'CCTV_DISCOVERY_PROJECT' && bundle.schemaVersion === 1, 'versioned .cctvproj bundle');
    assert(!raw.includes('camera-password') && !raw.includes('Bearer token') && !raw.includes('secret-key') && !raw.includes('cred-axis-default'), 'passwords, tokens, authorization, and credential references excluded');

    const loadedDb = new SiteProjectDatabase();
    await loadedDb.openProject(file);
    const loaded = loadedDb.getDevices()[0];
    assert(loaded.id === originalId, 'stable id survives save/load');
    assert(loaded.anchor.macAddress === '00:40:8c:00:00:01', 'MAC survives save/load');
    assert(loaded.anchor.onvifEndpointUuid === 'uuid-1', 'UUID survives save/load');
    assert(loaded.network.ipAddressHistory?.includes('192.168.1.10'), 'IP history survives save/load');
    assert(loaded.technician?.name === 'Lobby Camera', 'technician name survives save/load');
    assert(loaded.technician?.location === 'Lobby North', 'location survives save/load');
    assert(loaded.technician?.notes === 'Above entrance', 'notes survive save/load');
    assert(loaded.anchor.model === 'P3265-LV', 'technician rename does not overwrite model');
    assert(loaded.status === 'UNKNOWN' && loaded.savedStatusSnapshot === 'ONLINE' && loaded.sessionVerification === 'NOT_VERIFIED', 'historical status is not restored as live state');
    assert(loaded.configuredState?.inferred === null && loaded.configuredState.manualOverride === false, 'configured state structure survives without invented evidence');
    loadedDb.importProjectJson(raw);
    assert(loadedDb.getDevices().length === 1, 'opening a project again does not duplicate devices');

    const emptyDb = new SiteProjectDatabase();
    emptyDb.createNewProject('Empty Site');
    assert(emptyDb.getDevices().length === 0 && emptyDb.getProject().name === 'Empty Site', 'new empty project');
    const beforeMalformed = emptyDb.getProject().id;
    assert(await expectReject(() => emptyDb.importProjectJson('{not-json')), 'malformed project rejected');
    assert(emptyDb.getProject().id === beforeMalformed, 'malformed import does not corrupt current session');
    assert(await expectReject(() => emptyDb.importProjectJson(JSON.stringify({ format: 'CCTV_DISCOVERY_PROJECT', schemaVersion: 99, project: {} }))), 'unsupported schema version rejected');

    const knownMac = device('saved-mac', '192.168.1.20', '00:40:8c:00:00:20');
    const liveMac = device('different-runtime-id', '192.168.1.120', '00:40:8c:00:00:20');
    const macResult = ProjectReverificationEngine.reverifyProject([knownMac], [liveMac]);
    assert(macResult.recognizedCount === 1 && macResult.changedIpCount === 1 && knownMac.id === 'saved-mac' && knownMac.network.ipAddress === '192.168.1.120', 'same MAC at changed IP reverifies same stable device');

    const knownUuid = device('saved-uuid', '10.0.0.20', null, 'same-uuid');
    const liveUuid = device('new-runtime-id', '10.0.0.55', null, 'same-uuid');
    const uuidResult = ProjectReverificationEngine.reverifyProject([knownUuid], [liveUuid]);
    assert(uuidResult.recognizedCount === 1 && knownUuid.id === 'saved-uuid' && knownUuid.network.ipAddress === '10.0.0.55', 'same UUID at changed IP reverifies same stable device');

    const inventoryDb = new SiteProjectDatabase();
    inventoryDb.createNewProject('Inventory');
    inventoryDb.upsertDevice(knownMac);
    inventoryDb.upsertDevice(device('brand-new', '192.168.1.90', '00:40:8c:00:00:90'));
    assert(inventoryDb.getDevices().length === 2 && inventoryDb.getDeviceById('saved-mac') && inventoryDb.getDeviceById('brand-new'), 'new device is added without overwriting saved device');

    const originalRaw = await fs.readFile(file, 'utf8');
    const unrelated = join(directory, 'unrelated.cctvproj');
    await fs.writeFile(unrelated, JSON.stringify({ id: 'another-project', name: 'Other', devices: [], collisions: [], rogueDhcpEvents: [], auditLogs: [] }));
    assert(await expectReject(() => db.saveAs(unrelated)), 'save refuses to overwrite unrelated project');
    assert(await fs.readFile(file, 'utf8') === originalRaw, 'failed save leaves prior valid project intact');

    const legacy = JSON.stringify({ id: 'legacy', name: 'Legacy', siteLocation: '', technicianName: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), totalDevices: 0, devices: [], collisions: [], rogueDhcpEvents: [], auditLogs: [] });
    assert(new SiteProjectDatabase().importProjectJson(legacy).id === 'legacy', 'unversioned prototype project migrates safely');

    console.log(`\nProject persistence summary: ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exit(1); });
