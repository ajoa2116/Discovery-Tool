const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { registerHooks } = require('node:module');
const fixture = require('./project_process_fixture.cjs');
const role = process.argv[2];
assert.ok(role === 'writer' || role === 'reader');

// Bounded, parent-owned private stdin protocol. No sockets or process IPC channel.
let input = '', queued = [], waiting;
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk; if (Buffer.byteLength(input) > 8192) throw Error('Input bound');
  for (let end; (end = input.indexOf('\n')) >= 0;) {
    const value = JSON.parse(input.slice(0, end)); input = input.slice(end + 1);
    if (waiting) { const resolve = waiting; waiting = undefined; resolve(value); } else queued.push(value);
  }
});
const receive = () => queued.length ? Promise.resolve(queued.shift()) : new Promise(resolve => { waiting = resolve; });
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
let stage = 'startup';

async function run() {
  const { owner, writer } = await receive(); fixture.ownRoot(owner);
  const violations = fixture.guards(owner, role); // BEFORE any storage/boundary import.
  // Installed source-test compiler, in memory only: no esbuild helper child/cache/bundle.
  const ts = require('typescript');
  stage = 'source-import';
  const sourceRoot = path.resolve(__dirname, '../..');
  registerHooks({ load(url, context, next) {
    if (!url.startsWith('file:') || !url.endsWith('.ts')) return next(url, context);
    const source = fileURLToPath(url), relative = path.relative(sourceRoot, source);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative));
    assert.ok(!/^(server|ui|test|core[\\/]drivers)[\\/]/.test(relative), 'No backend/UI/provider imports');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(fs.readFileSync(source, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, fileName: source,
    }).outputText };
  } });
  const { SiteProjectDatabase } = await import(pathToFileURL(path.join(sourceRoot, 'core/storage/project_db.ts')).href);
  const { LegacyConfigurationBoundary } = await import(pathToFileURL(path.join(sourceRoot, 'core/network/legacy_configuration_boundary.ts')).href);
  send({ type: 'READY', role, pid: process.pid, ppid: process.ppid });
  assert.deepEqual(await receive(), { type: 'GO' });
  const results = [];
  for (const spec of fixture.specs) {
    stage = role + '-' + spec.name;
    fixture.ownRoot(owner);
    const db = new SiteProjectDatabase('ISOLATED_TEST');
    if (role === 'writer') {
      const project = db.createNewProject(spec.projectName); project.technicianName = 'Synthetic technician';
      const device = (id, ip) => ({ id, anchor: { macAddress: spec.mac, onvifEndpointUuid: spec.uuid, serialNumber: 'Synthetic-' + spec.name, vendor: 'Synthetic' },
        network: { ipAddress: ip, subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF', ipAddressHistory: [ip] },
        status: 'ONLINE', sessionVerification: 'NOT_VERIFIED', evidenceProvenance: 'SYNTHETIC_TEST',
        discoveredPhase: 3, firstSeenAt: '2026-10-28T12:00:00Z', lastSeenAt: '2026-10-28T12:00:00Z' });
      db.upsertDevice(device('shared', spec.before)); db.upsertDevice(device('observed-new-id', spec.after));
      assert.equal(db.getDevices().length, 1); assert.equal(db.getDevices()[0].id, 'shared');
      const context = db.getMetadataWriteContext();
      new LegacyConfigurationBoundary(db).updateLocalMetadata('shared', { metadataWriteContext: context, technician: spec.metadata });
      db.appendHistory({ type: 'NOTES_UPDATED', title: 'Fixture marker', summary: 'Non-secret process fixture marker', deviceId: 'shared' });
      const file = fixture.file(owner, spec.name, false); assert.equal(await db.saveAs(file), file);
      assert.equal(db.getSession().dirty, false);
      const raw = fs.readFileSync(fixture.file(owner, spec.name), 'utf8');
      assert.ok(!raw.includes(context.generation)); fixture.noSecrets(raw);
      results.push({ name: spec.name, projectId: project.id, hash: fixture.hash(raw), generationHash: fixture.hash(context.generation), historyHash: fixture.hash(JSON.stringify(db.getProject().auditLogs)) });
    } else {
      const prior = writer.results.find(result => result.name === spec.name); assert.ok(prior);
      const file = fixture.file(owner, spec.name), raw = fs.readFileSync(file, 'utf8');
      assert.equal(fixture.hash(raw), prior.hash); fixture.noSecrets(raw);
      await db.openProject(file);
      const project = db.getProject(), device = db.getDeviceById('shared');
      assert.equal(project.id, prior.projectId); assert.equal(project.name, spec.projectName); assert.equal(db.getDevices().length, 1);
      assert.equal(db.getSession().dirty, false); assert.deepEqual(device.technician, spec.metadata);
      assert.equal(device.id, 'shared'); assert.equal(device.anchor.macAddress, spec.mac); assert.equal(device.anchor.onvifEndpointUuid, spec.uuid);
      assert.equal(device.network.ipAddress, spec.after); assert.deepEqual(device.network.ipAddressHistory, [spec.before, spec.after]);
      assert.equal(device.status, 'UNKNOWN'); assert.equal(device.sessionVerification, 'NOT_VERIFIED'); assert.equal(device.savedStatusSnapshot, 'ONLINE');
      assert.equal(device.evidenceProvenance, 'SYNTHETIC_TEST');
      for (const key of ['reachability', 'telemetry', 'diagnostics']) assert.equal(device[key], undefined);
      assert.notEqual(fixture.hash(db.getMetadataWriteContext().generation), prior.generationHash);
      assert.equal(fixture.hash(JSON.stringify(project.auditLogs)), prior.historyHash);
      const history = db.listProjectHistory();
      for (const type of ['IP_ADDRESS_CHANGED', 'TECHNICIAN_NAME_CHANGED', 'LOCATION_CHANGED', 'NOTES_UPDATED']) assert.ok(history.some(event => event.type === type));
      assert.ok(history.some(event => event.summary === 'Non-secret process fixture marker'));
      assert.equal(fs.readFileSync(file, 'utf8'), raw);
      results.push({ name: spec.name, projectId: project.id, hash: fixture.hash(raw) });
    }
  }
  assert.notEqual(results[0].projectId, results[1].projectId); fixture.entries(owner, fixture.names); assert.deepEqual(violations, []);
  send({ type: 'DONE', role, pid: process.pid, results, networkOrProcessViolations: violations, files: fixture.names });
  assert.deepEqual(await receive(), { type: 'EXIT' });
  process.stdin.destroy();
}
run().catch(error => { process.stderr.write('Project process fixture failed at ' + stage + ': ' + error.message.slice(0, 220) + '\n'); process.exitCode = 1; process.stdin.destroy(); });
