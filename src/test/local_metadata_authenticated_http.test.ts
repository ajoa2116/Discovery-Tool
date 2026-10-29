import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import { createServer, request } from 'node:http';
import type { Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { ProductionAuthenticationBoundary } from '../server/production_authentication_boundary.ts';
import { CompanionBootstrapAuthority } from '../server/companion_bootstrap_authority.ts';
import type { CompanionLifetime, CompanionLoss } from '../server/application_companion_supervisor.ts';
import { validateHttpHost } from '../server/http_host_validation.ts';
import { registerLocalMetadataRoute } from '../server/local_metadata_route.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { LegacyConfigurationBoundary } from '../core/network/legacy_configuration_boundary.ts';
import { MetadataWriteConflictError } from '../shared/metadata_write_context.ts';
import type { AuditLogEntry, Device, SiteProject } from '../types/index.ts';

// Established trusted private-channel test model, not a new production credential
// seam: production_authentication_boundary.test.ts / Phase 18C.7P shared owner contract.
// The real authority issues and activates both secrets. No native process is started.
async function activeFixtureOwner() {
  let bootstrap = '', token = '', alive = true;
  let lose!: (reason: CompanionLoss) => void;
  const lost = new Promise<CompanionLoss>(resolve => { lose = resolve; });
  const transport: CompanionLifetime = {
    pid: 1, brokerPid: 2, generation: 1, get alive() { return alive; }, lost,
    closed: lost.then(() => true), failureCode: lost.then(() => undefined),
    async deliverBootstrap(input) { bootstrap = JSON.parse(input).token; }, async activateBootstrap() {},
    async requestBootstrapRedemption() { return bootstrap; }, async deliverSession(value) { token = value; },
    async activateSession() {}, async logoutSession() {},
    async shutdown() { alive = false; bootstrap = ''; token = ''; lose('closed'); },
  };
  const owner = Reflect.construct(CompanionBootstrapAuthority, [transport, Date.now, () => 0]) as CompanionBootstrapAuthority;
  try { await owner.issueBootstrap(); await owner.deliverSession(); }
  catch (error) { await owner.dispose(); throw error; }
  return { owner, token: () => token, alive: () => alive };
}

test('shared local-metadata POST behind real authentication: isolated HTTP contract', { timeout: 15000 }, async t => {
  const db = new SiteProjectDatabase('ISOLATED_TEST');
  const camera = (id: string, mac: string): Device => ({ id, anchor: { macAddress: mac, vendor: 'Synthetic' },
    network: { ipAddress: '192.0.2.50', subnetMask: '255.255.255.0', port: 80, protocol: 'ONVIF', ipAddressHistory: [] },
    technician: { name: 'Original', location: 'Original location', notes: 'Original notes' },
    status: 'UNKNOWN', sessionVerification: 'NOT_VERIFIED', evidenceProvenance: 'SYNTHETIC_TEST',
    discoveredPhase: 3, firstSeenAt: 'fixture', lastSeenAt: 'fixture' });
  const seed = () => { db.upsertDevice(camera('shared', '00:11:22:33:44:50')); db.upsertDevice(camera('neighbor', '00:11:22:33:44:52')); };
  db.createNewProject('Synthetic A'); seed(); db.exportProjectJsonForSave();
  const boundary = new LegacyConfigurationBoundary(db);
  let metadataCalls = 0, lookups = 0, admitted = 0;
  const update = boundary.updateLocalMetadata.bind(boundary), lookup = db.getDeviceByIdentifier.bind(db);
  boundary.updateLocalMetadata = (id, body) => { metadataCalls++; return update(id, body); };
  db.getDeviceByIdentifier = id => { lookups++; return lookup(id); };
  const audits: AuditLogEntry[] = [];
  const broadcasts: Array<{ type: 'DEVICE_METADATA_UPDATED'; data: { device: Device; project: SiteProject } }> = [];
  const planned: string[] = [], observed: string[] = [], unexpected: string[] = [];
  const sockets = new Set<Socket>();
  let foreign: Awaited<ReturnType<typeof activeFixtureOwner>> | undefined;
  const authenticated = await activeFixtureOwner();
  const authentication = new ProductionAuthenticationBoundary({ owner: authenticated.owner });
  const app = express();
  app.use(validateHttpHost);
  app.use('/api', authentication.http);
  app.use('/api', (_req, _res, next) => { admitted++; next(); });
  app.use(cors({ exposedHeaders: ['X-CCTV-Report-Renderer', 'Content-Disposition'] }));
  app.use(express.json());
  registerLocalMetadataRoute(app, { projectDb: db, legacyConfigurationBoundary: boundary,
    logAudit: entry => { audits.push(structuredClone(entry)); },
    broadcast: event => { broadcasts.push(structuredClone(event)); } });
  app.use((_req, res) => { unexpected.push('unmatched route'); res.sendStatus(404); });
  const server = createServer((req, res) => {
    const signature = `${req.method} ${req.url}`;
    if (req.socket.remoteAddress !== '127.0.0.1' || signature !== planned[observed.length]) {
      unexpected.push('unplanned request'); req.socket.destroy(); return;
    }
    observed.push(signature); app(req, res);
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (_req, socket) => { unexpected.push('upgrade'); socket.destroy(); });
  server.on('clientError', (_error, socket) => { unexpected.push('protocol error'); socket.destroy(); });
  const state = () => JSON.stringify({ session: db.getSession(), history: db.listProjectHistory(), audits, broadcasts });
  let requests = 0, denials = 0, passes = 0;
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const post = (body: unknown, credentials: 'active' | 'none' | 'foreign' = 'active', id = 'shared') => {
      const path = `/api/device/${encodeURIComponent(id)}/config`;
      assert.ok(id === 'shared' || id === 'neighbor' || id === 'unknown');
      const text = body === undefined ? '' : JSON.stringify(body);
      const token = credentials === 'active' ? authenticated.token() : credentials === 'foreign' ? foreign!.token() : undefined;
      planned.push(`POST ${path}`); requests++;
      return new Promise<{ status: number; body: Record<string, any> }>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: address.port, method: 'POST', path, agent: false, timeout: 2000,
          headers: { Host: 'localhost:3001', Origin: 'http://localhost:3001', Connection: 'close',
            'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text),
            ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, res => {
          let output = '';
          res.on('error', reject); res.on('aborted', () => reject(new Error('Fixture response aborted')));
          res.on('data', chunk => { output += String(chunk); if (Buffer.byteLength(output) > 65536) res.destroy(new Error('Fixture response bound')); });
          res.on('end', () => {
            try { assert.equal(res.headers['cache-control'], 'no-store'); assert.match(String(res.headers['content-type']), /application\/json/);
              resolve({ status: res.statusCode!, body: JSON.parse(output) }); } catch (error) { reject(error); }
          });
        });
        req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Fixture HTTP timeout'))); req.end(text);
      });
    };
    const payload = (context: unknown, location = 'Rejected change') => ({ metadataWriteContext: context, technician: { location } });
    const denied = async (name: string, body: unknown, expectedStatus = 409, expectedBody: Record<string, unknown> = {
      status: 'CONFLICT', code: 'METADATA_PROJECT_CONFLICT', error: new MetadataWriteConflictError().message,
    }, credentials: 'active' | 'none' | 'foreign' = 'active', id = 'shared') => {
      await t.test(name, async () => {
        db.exportProjectJsonForSave(); // Clean in-memory baseline for every denial.
        assert.equal(db.getSession().dirty, false);
        const before = state(), beforeCounts = { admitted, metadataCalls, lookups };
        const result = await post(body, credentials, id);
        assert.equal(result.status, expectedStatus); assert.deepEqual(result.body, expectedBody);
        assert.notEqual(result.body.status, 'LOCAL_METADATA_UPDATED'); assert.ok(!('device' in result.body));
        assert.equal(state(), before, 'no inventory/history/dirty/audit/broadcast change');
        assert.equal(admitted - beforeCounts.admitted, expectedStatus === 401 ? 0 : 1);
        assert.equal(metadataCalls - beforeCounts.metadataCalls, expectedStatus === 401 ? 0 : 1);
        assert.equal(lookups - beforeCounts.lookups, expectedStatus === 404 ? 1 : 0);
        denials++; passes++;
      });
    };
    const accepted = async (name: string, id: string, fields: Record<string, string>) => {
      await t.test(name, async () => {
        db.exportProjectJsonForSave(); // In-memory saved/clean baseline; no filesystem output.
        assert.equal(db.getSession().dirty, false);
        const context = db.getMetadataWriteContext(), history = db.listProjectHistory().length;
        const others = JSON.stringify(db.getDevices().filter(device => device.id !== id));
        const counts = [audits.length, broadcasts.length];
        const result = await post({ metadataWriteContext: context, technician: fields }, 'active', id);
        assert.equal(result.status, 200); assert.equal(result.body.status, 'LOCAL_METADATA_UPDATED');
        assert.equal(result.body.device.id, id);
        for (const [key, value] of Object.entries(fields)) assert.equal(result.body.device.technician[key], value);
        assert.equal(JSON.stringify(db.getDevices().filter(device => device.id !== id)), others);
        assert.equal(db.getSession().dirty, true); assert.equal(db.listProjectHistory().length, history + Object.keys(fields).length);
        assert.deepEqual(db.getMetadataWriteContext(), context);
        assert.equal(audits.length, counts[0] + 1); assert.equal(broadcasts.length, counts[1] + 1);
        const audit = audits.at(-1)!, event = broadcasts.at(-1)!;
        assert.equal(audit.deviceId, id); assert.equal(audit.message, 'Local technician metadata updated.');
        assert.equal(audit.category, 'SYSTEM'); assert.equal(audit.level, 'INFO');
        assert.equal(event.type, 'DEVICE_METADATA_UPDATED');
        // HTTP JSON omits optional undefined properties retained in the in-memory event.
        assert.deepEqual(JSON.parse(JSON.stringify(event.data.device)), result.body.device);
        assert.deepEqual(event.data.project, db.getProject()); passes++;
      });
    };

    await accepted('current generation preserves exact Name/Location/Notes over HTTP', 'shared', { name: '  Exact Name  ', location: '  Exact Location  ', notes: '  Exact Notes  ' });
    await accepted('same-IP distinct identity updates only the requested stable ID', 'neighbor', { location: '  Neighbor only  ' });
    await denied('absent body has typed HTTP 409', undefined);
    await denied('missing context has typed HTTP 409', { technician: { location: 'Rejected' } });
    for (const [name, context] of [['null', null], ['array', []], ['empty', {}],
      ['wrong version', { ...db.getMetadataWriteContext(), version: 2 }],
      ['extra field', { ...db.getMetadataWriteContext(), extra: true }],
      ['malformed generation', { ...db.getMetadataWriteContext(), generation: 'invalid' }]] as const) {
      await denied(`malformed context: ${name}`, payload(context));
    }
    await denied('physical camera payload remains HTTP 410', { ...payload(db.getMetadataWriteContext()), network: {} }, 410,
      { status: 'UNSUPPORTED', error: 'This legacy endpoint cannot change physical camera configuration. Use the authenticated Device Configuration workflow.' });
    await denied('non-string metadata remains HTTP 400', { metadataWriteContext: db.getMetadataWriteContext(), technician: { location: 123 } }, 400,
      { status: 'UNAVAILABLE', error: 'location must be text.' });
    await denied('unknown identity remains HTTP 404', payload(db.getMetadataWriteContext()), 404, { status: 'UNAVAILABLE', error: 'Device not found.' }, 'active', 'unknown');

    const aContext = db.getMetadataWriteContext(), savedA = db.exportProjectJsonForSave();
    db.createNewProject('Synthetic B'); seed(); db.exportProjectJsonForSave();
    await denied('A context denied in B despite reused device ID and address', payload(aContext));
    await accepted('fresh B context updates reused ID in B only', 'shared', { location: 'Synthetic B location' });
    db.importProjectJson(savedA);
    await denied('A to B to A does not revive original generation', payload(aContext));
    const reopened = db.getMetadataWriteContext();
    db.importProjectJson(savedA);
    await denied('same-project reopen invalidates previous generation', payload(reopened));
    await accepted('fresh reopened A context remains writable', 'shared', { location: 'Reopened A location' });

    await denied('missing authentication denies otherwise valid metadata independently', payload(db.getMetadataWriteContext()), 401,
      { error: 'Application authentication unavailable.' }, 'none');
    await denied('missing authentication precedes missing-generation validation', { technician: { location: 'Rejected' } }, 401,
      { error: 'Application authentication unavailable.' }, 'none');
    foreign = await activeFixtureOwner();
    await denied('real session from foreign fixture owner is denied independently', payload(db.getMetadataWriteContext()), 401,
      { error: 'Application authentication unavailable.' }, 'foreign');

    await t.test('production registration still has original position behind unchanged default-deny authentication', () => {
      const source = readFileSync('src/server/backend_application.ts', 'utf8');
      const mount = 'registerLocalMetadataRoute(app, {projectDb,legacyConfigurationBoundary,logAudit:entry=>appStateDb.logAudit(entry),broadcast});';
      assert.equal(source.split(mount).length - 1, 1);
      assert.match(source, /new ProductionAuthenticationBoundary\(\)/);
      assert.ok(source.indexOf("app.use('/api', authentication.http)") < source.indexOf('app.use(express.json())'));
      assert.ok(source.indexOf('app.use(express.json())') < source.indexOf("app.get('/api/device/:identifier/config'"));
      assert.ok(source.indexOf("app.get('/api/device/:identifier/config'") < source.indexOf(mount));
      assert.ok(source.indexOf(mount) < source.indexOf("app.post('/api/device/:identifier/ptz'"));
      assert.ok(!source.includes("app.post('/api/device/:identifier/config',")); passes++;
    });
    assert.deepEqual(unexpected, []); assert.deepEqual(observed, planned); assert.equal(requests, observed.length);
  } finally {
    authentication.dispose();
    if (server.listening) {
      const socketClosures = [...sockets].map(socket => new Promise<void>(resolve => socket.once('close', () => resolve())));
      const closing = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      for (const socket of sockets) socket.destroy();
      await Promise.all([closing, ...socketClosures]);
    }
    await authenticated.owner.dispose(); await foreign?.owner.dispose();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(server.listening, false); assert.equal(server.address(), null); assert.equal(sockets.size, 0);
    assert.equal(authenticated.alive(), false); assert.ok(!foreign || !foreign.alive());
    assert.equal(getEventListeners(authenticated.owner.boundaryEnded, 'abort').length, 0);
    assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ casesPassed: passes, deniedWithoutEffects: denials, requests, unexpectedRequests: unexpected.length,
      listenersRemaining: 0, socketsRemaining: sockets.size, nativeChildren: 0, temporaryRoots: 0, projectFiles: 0 }));
  }
});
