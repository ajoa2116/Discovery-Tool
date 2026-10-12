import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import { deferred, lifecycleFixture } from './backend_lifecycle_fixture.ts';
import { pipelineEngine } from '../core/engine/pipeline.ts';
import { projectDb } from '../core/storage/project_db.ts';
import { SiteProjectDatabase } from '../core/storage/project_db.ts';
import { TaskManager } from '../core/tasks/task_manager.ts';
import { OSCredentialVault, type CredentialStore } from '../core/storage/vault.ts';
import { PairService } from '../core/network/pair_service.ts';
import { CameraBrowserSessions } from '../core/connect/camera_browser_sessions.ts';
import { CameraRendererService } from '../core/connect/camera_renderer_service.ts';
import type { Device, PairSessionState, WindowsAdapterSnapshot } from '../types/index.ts';

test('construction is inert; startup keeps defaults, host validation and ownerless HTTP/WS denial', async () => {
  const signals = getEventListeners(process, 'SIGTERM').length;
  const f = lifecycleFixture();
  assert.equal(f.events.length, 0); assert.equal(f.backend.status().state, 'constructed');
  const start = f.backend.start(); assert.equal(f.backend.start(), start);
  await start; await f.backend.initialized();
  assert.ok(f.events.includes('listen:127.0.0.1:3001')); assert.ok(f.events.includes('schedule:1000'));
  assert.deepEqual(await f.request(), { status: 401, body: '{"error":"Application authentication unavailable."}' });
  assert.equal((await f.request('attacker.invalid')).status, 400);
  assert.equal(f.verifyUpgrade({ method: 'GET', url: '/ws', headers: {}, rawHeaders: ['Host', 'localhost:3001'] }), false);
  const shutdown = f.backend.shutdown(); assert.equal(f.backend.shutdown(), shutdown); await shutdown;
  assert.equal(f.backend.status().state, 'stopped'); assert.ok(f.signals.every(s => s.aborted));
  assert.equal(getEventListeners(process, 'SIGTERM').length, signals);
  assert.equal(f.ws.listenerCount('connection'), 0);
  await assert.rejects(f.backend.start(), /shut down/);
});

test('camera native launch remains gated without fixture authority', async () => {
  const device = { id: 'synthetic-only', anchor: { macAddress: null, onvifEndpointUuid: 'synthetic-uuid', vendor: 'Synthetic' },
    network: { ipAddress: '192.0.2.1' }, status: 'ONLINE', sessionVerification: 'VERIFIED' } as Device;
  const sessions = new CameraBrowserSessions(() => ({ key: 'test', devices: [device], collisions: [] }), () => 'http://192.0.2.1');
  let launches = 0;
  const renderer = new CameraRendererService(sessions, { capability: async () => ({ available: true, code: 'AVAILABLE' }),
    launch: () => { launches++; throw Error('Must never launch'); } });
  try { assert.equal((await renderer.open(device.id)).snapshot.code, 'GATED'); assert.equal(launches, 0); }
  finally { renderer.dispose(); sessions.clear(); }
});

test('partial startup failures clean every acquired resource', async () => {
  for (const failAt of ['http', 'ws', 'schedule', 'diagnostic', 'discovery', 'listen']) {
    const f = lifecycleFixture({ failAt });
    await assert.rejects(f.backend.start(), new RegExp(failAt));
    assert.equal((await f.backend.failure).message, failAt);
    await f.backend.shutdown();
    assert.equal(f.backend.status().state, 'stopped');
    if (failAt !== 'http') assert.ok(f.events.includes('http.close'), failAt);
    if (!['http', 'ws'].includes(failAt)) assert.ok(f.events.includes('ws.close'), failAt);
  }
});

test('shutdown during initialization/binding ignores late completions and callbacks', async () => {
  const recovery = deferred<any>(), credentials = deferred<void>();
  const f = lifecycleFixture({ delayListen: true, recovery: recovery.promise, credentials: credentials.promise });
  const starting = f.backend.start(); const cancelled = assert.rejects(starting, { name: 'AbortError' });
  await Promise.resolve();
  let reentrant: Promise<void> | undefined;
  f.signals[0].addEventListener('abort', () => { reentrant = f.backend.shutdown(); });
  const closing = f.backend.shutdown(); assert.equal(reentrant, closing); await closing; await cancelled;
  assert.equal(f.backend.status().recoveryInspected, false);
  recovery.resolve({ state: 'PAIRED' }); credentials.resolve(); await f.backend.initialized();
  f.lateListen(); f.lateReconcile(); await Promise.resolve();
  assert.equal(f.backend.status().state, 'stopped'); assert.equal(f.http.listening, false);
  assert.equal(f.backend.status().recoveryInspected, false);
  assert.equal(f.events.filter(e => e === 'diagnostic.start').length, 1);
});

test('initialization warnings remain nonfatal and recovery failure stays uninspected', async () => {
  const warnings: unknown[][] = [], original = console.error;
  console.error = (...args) => { warnings.push(args); };
  const f = lifecycleFixture({ recovery: Promise.reject(Error('recovery')), credentials: Promise.reject(Error('vault')) });
  try {
    await f.backend.start(); await f.backend.initialized();
    assert.equal(f.backend.status().state, 'running'); assert.equal(f.backend.status().recoveryInspected, false);
    assert.ok(warnings.some(w => String(w[0]).startsWith('Pair recovery inspection failed.')));
    assert.ok(warnings.some(w => String(w[0]).startsWith('Windows secure credential store unavailable:')));
  } finally { await f.backend.shutdown(); console.error = original; }
});

test('cleanup failure does not skip later closes and pipeline subscription is released', async () => {
  const original = pipelineEngine.subscribe.bind(pipelineEngine); let active = 0;
  pipelineEngine.subscribe = cb => { active++; const unsubscribe = original(cb); return () => { active--; unsubscribe(); }; };
  const f = lifecycleFixture({ cleanupFailure: 'timer' });
  try {
    await f.backend.start(); assert.equal(active, 1);
    await assert.rejects(f.backend.shutdown(), AggregateError);
    assert.equal(active, 0); assert.ok(f.events.includes('ws.close')); assert.ok(f.events.includes('http.close'));
    assert.equal(f.backend.status().state, 'stopped');
  } finally { pipelineEngine.subscribe = original; }
});

test('discovery cancellation failure cannot skip task cancellation, client termination or listener cleanup', async () => {
  const stop = pipelineEngine.stopDiscovery, snapshot = TaskManager.prototype.snapshot;
  const cancelPreparation = PairService.prototype.cancelPreparation;
  let seeded = false, cancelled = 0, terminated = 0, pairCancelled = 0;
  PairService.prototype.cancelPreparation = function () { pairCancelled++; return cancelPreparation.call(this); };
  TaskManager.prototype.snapshot = function () {
    if (!seeded) { seeded = true; this.begin('REPORT', undefined, () => { cancelled++; return true; }); }
    return snapshot.call(this);
  };
  pipelineEngine.stopDiscovery = () => { throw Error('synthetic stop failure'); };
  const f = lifecycleFixture();
  try {
    await f.backend.start();
    const httpFailure = f.http.listeners('error')[0], wsFailure = f.ws.listeners('error')[0];
    f.ws.clients.add({ terminate() { terminated++; } });
    await assert.rejects(f.backend.shutdown(), AggregateError);
    assert.equal(cancelled, 1); assert.equal(terminated, 1); assert.equal(pairCancelled, 1);
    assert.ok(f.events.includes('http.close')); assert.ok(f.events.includes('http.closeAllConnections')); assert.ok(f.events.includes('ws.close'));
    assert.equal(f.ws.listenerCount('connection'), 0);
    assert.ok(!f.http.listeners('error').includes(httpFailure)); assert.ok(!f.ws.listeners('error').includes(wsFailure));
    f.http.emit('error', Error('late error')); f.ws.emit('error', Error('late error'));
    assert.equal(f.backend.status().state, 'stopped');
  } finally { pipelineEngine.stopDiscovery = stop; TaskManager.prototype.snapshot = snapshot; PairService.prototype.cancelPreparation = cancelPreparation; }
});

test('synchronous provider failure stops subsequent acquisition and late monitor callbacks are inert', async () => {
  const f = lifecycleFixture({ errorDuringDiagnosticStart: true });
  await assert.rejects(f.backend.start(), /synchronous provider error/);
  await f.backend.shutdown();
  assert.ok(!f.events.includes('discovery.start')); assert.ok(!f.events.some(e => e.startsWith('listen:')));
  const apply = projectDb.applyDiagnosticRefresh, scan = pipelineEngine.runDiscoveryScan;
  let mutations = 0, scans = 0;
  projectDb.applyDiagnosticRefresh = () => { mutations++; return undefined as any; };
  pipelineEngine.runDiscoveryScan = async () => { scans++; return 'BUSY'; };
  try {
    f.diagnosticDevice({}); await f.discoveryCallbacks.runCycle('late');
    assert.equal(f.discoveryCallbacks.canRun().allowed, false);
    assert.equal(mutations, 0); assert.equal(scans, 0);
  } finally { projectDb.applyDiagnosticRefresh = apply; pipelineEngine.runDiscoveryScan = scan; }
});

test('Pair cancellation prevents late adapter inspection from resurrecting any preparation path', async () => {
  for (const mode of ['camera', 'network', 'preview']) {
    const inspected = deferred<WindowsAdapterSnapshot[]>(); let signal: AbortSignal | undefined;
    const db = new SiteProjectDatabase(); db.startQuickWork();
    db.upsertDevice({ id:'synthetic', anchor:{macAddress:null,onvifEndpointUuid:'synthetic',vendor:'Synthetic'},
      network:{ipAddress:'192.0.2.1'},status:'DIFFERENT_SUBNET' } as Device);
    const pair = new PairService({ inspectAdapters: async s => { signal=s;return inspected.promise; },
      isAdministrator: async () => { throw Error('Must not query'); }, applyTemporary: async () => { throw Error('Must not mutate'); },
      restore: async () => { throw Error('Must not restore'); } }, undefined, undefined,
      { load:async()=>null, save:async()=>{throw Error('Must not save');},clear:async()=>{throw Error('Must not clear');} }, db);
    const pending = mode==='camera' ? pair.prepare('synthetic',8) : mode==='network'
      ? pair.prepareNetwork({interfaceIndex:8,ipAddress:'192.0.2.2',prefixLength:24}) : pair.prepareMatchPreview({} as any);
    const rejected=assert.rejects(pending,{code:'CANCELLED'});
    await assert.rejects(pair.initializeRecovery(), {code:'PAIR_OPERATION_ACTIVE'});
    pair.cancelPreparation(); assert.equal(signal?.aborted,true); inspected.resolve([]); await rejected;
    assert.equal(pair.getStatus(),null);
    assert.equal(await pair.initializeRecovery(),null);
  }
});

test('cancelled initialization cannot hydrate credentials or clear recovery evidence', async () => {
  const controller = new AbortController(), metadata = deferred<any[]>();
  const store = { list: () => metadata.promise } as CredentialStore;
  const vault = new OSCredentialVault(store); const work = vault.initialize(controller.signal);
  controller.abort(); metadata.resolve([{ id: '00000000-0000-0000-0000-000000000001', label: 'Synthetic', username: 'test' }]);
  await assert.rejects(work, { name: 'AbortError' }); assert.deepEqual(vault.getSafeReferences(), []);
  let cleared = false; const load = deferred<null>();
  const pair = new PairService(undefined, undefined, undefined, { load: () => load.promise, save: async () => {}, clear: async () => { cleared = true; } });
  const cancellation = new AbortController(); const recovery = pair.initializeRecovery(cancellation.signal);
  cancellation.abort(); load.resolve(null); await assert.rejects(recovery, { name: 'AbortError' }); assert.equal(cleared, false);
  const now = new Date().toISOString(), guid = '11111111-2222-3333-4444-555555555555';
  const original: WindowsAdapterSnapshot = { interfaceGuid: guid, interfaceIndex: 8, interfaceAlias: 'Synthetic', mediaType: 'ETHERNET',
    operationalStatus: 'Up', eligible: true, dhcpEnabled: false, ipv4Addresses: [{ address: '192.168.0.124', prefixLength: 24 }],
    defaultGateways: [], dnsAutomatic: true, dnsServers: [], capturedAt: now };
  const current = { ...original, ipv4Addresses: [{ address: '192.168.1.137', prefixLength: 24 }] };
  const candidate = { ipAddress: '192.168.1.137', prefixLength: 24, confidence: 'AVAILABLE' as const, evidence: ['Synthetic'] };
  const record: PairSessionState = { id: crypto.randomUUID(), purpose: 'NETWORK_MATCH', state: 'PAIRED', deviceId: '', cameraIp: '',
    cameraSubnetMask: '255.255.255.0', adapter: current, originalAdapter: original, candidates: [candidate], selectedCandidate: candidate,
    adapterConfigurationVerified: true, recoveryAvailable: true, createdAt: now, updatedAt: now, technicianConfirmedAt: now };
  const inspecting = deferred<void>(), adapters = deferred<WindowsAdapterSnapshot[]>(), aborted = new AbortController();
  let forwarded: AbortSignal | undefined;
  const inspection = new PairService({ inspectAdapters: async signal => { forwarded = signal; inspecting.resolve(); return adapters.promise; },
    isAdministrator: async () => false, applyTemporary: async () => { throw Error('Must not mutate'); }, restore: async () => { throw Error('Must not restore'); } },
    undefined, undefined, { load: async () => record, save: async () => { throw Error('Must not save'); }, clear: async () => { cleared = true; } });
  const pending = inspection.initializeRecovery(aborted.signal); await inspecting.promise;
  assert.equal(forwarded, aborted.signal); aborted.abort(); adapters.resolve([original]);
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(cleared, false);
  const clearing = deferred<void>(), beganClear = deferred<void>(), duringClear = new AbortController();
  let retained: PairSessionState | undefined;
  const lateClear = new PairService({ inspectAdapters: async () => [original], isAdministrator: async () => false,
    applyTemporary: async () => { throw Error('Must not mutate'); }, restore: async () => { throw Error('Must not restore'); } },
    undefined, undefined, { load: async () => record, save: async value => { retained = value; },
      clear: async () => { beganClear.resolve(); await clearing.promise; } });
  const lateWork = lateClear.initializeRecovery(duringClear.signal); await beganClear.promise;
  await assert.rejects(lateClear.initializeRecovery(), { code: 'PAIR_OPERATION_ACTIVE' });
  duringClear.abort(); clearing.resolve(); await assert.rejects(lateWork, { name: 'AbortError' });
  assert.deepEqual(retained, record); assert.equal(lateClear.getStatus()?.state, 'ROLLBACK_REQUIRED');
  assert.equal(lateClear.getRecoveryPersistence(), 'retained');
  const failedRetention = new AbortController();
  const storageFailure = new PairService({ inspectAdapters: async () => [original], isAdministrator: async () => false,
    applyTemporary: async () => { throw Error('Must not mutate'); }, restore: async () => { throw Error('Must not restore'); } },
    undefined, undefined, { load: async () => record, save: async () => { throw Error('retention storage failure'); },
      clear: async () => { failedRetention.abort(); } });
  await assert.rejects(storageFailure.initializeRecovery(failedRetention.signal), /retention storage failure/);
  assert.equal(storageFailure.getStatus()?.state,'ROLLBACK_REQUIRED');
  assert.equal(storageFailure.getRecoveryPersistence(), 'failed');
  assert.equal(storageFailure.getStatus()?.errorCode, 'RECOVERY_RETENTION_FAILED');
  assert.doesNotMatch(storageFailure.getStatus()?.message ?? '', /preserved|safely retained/i);
  const providers = { inspectAdapters: async () => [original], isAdministrator: async () => false,
    applyTemporary: async () => { throw Error('Must not mutate'); }, restore: async () => { throw Error('Must not restore'); } };
  const absent = new PairService(providers, undefined, undefined, {load:async()=>null,save:async()=>{throw Error('Must not save');},clear:async()=>{throw Error('Must not clear');}});
  await absent.initializeRecovery(); assert.equal(absent.getRecoveryPersistence(), 'absent');
  let clearCount=0;
  const restored = new PairService(providers, undefined, undefined, {load:async()=>record,save:async()=>{throw Error('Must not save');},clear:async()=>{clearCount++;}});
  await restored.initializeRecovery(); assert.equal(clearCount,1); assert.equal(restored.getRecoveryPersistence(),'cleared');
  assert.equal(restored.getStatus()?.recoveryAvailable,false);
  const clearFailure = new PairService(providers, undefined, undefined, {load:async()=>record,save:async()=>{throw Error('Must not save');},clear:async()=>{throw Error('PRIVATE_STORAGE_DETAIL');}});
  await clearFailure.initializeRecovery(); assert.equal(clearFailure.getRecoveryPersistence(),'failed');
  assert.equal(clearFailure.getStatus()?.errorCode,'RECOVERY_PERSISTENCE_FAILED');
  assert.equal(clearFailure.getStatus()?.recoveryAvailable,true);
  assert.doesNotMatch(clearFailure.getStatus()?.message ?? '',/PRIVATE_STORAGE_DETAIL|preserved/);
  const unreadable = new PairService(providers, undefined, undefined, {load:async()=>{throw Error('unreadable');},save:async()=>{throw Error('Must not save');},clear:async()=>{throw Error('Must not clear');}});
  await unreadable.initializeRecovery(); assert.equal(unreadable.getRecoveryPersistence(),'unverified');
  assert.match(unreadable.getStatus()?.message ?? '',/Persistence is unverified/);
});

test('recovery diagnostics distinguish actual persistence outcomes from resource cleanup', async () => {
  const read = PairService.prototype.getRecoveryPersistence;
  const f = lifecycleFixture();
  try {
    await f.backend.start(); await f.backend.initialized(); await f.backend.shutdown();
    for(const [outcome, expected] of [['absent',/No Pair recovery record was found/],['retained',/retained during initialization/],['cleared',/cleared after verifying/],['unverified',/persistence is unverified/],['failed',/persistence failed/]] as const) {
      PairService.prototype.getRecoveryPersistence = () => outcome;
      assert.match(f.backend.recoveryDiagnostic(), expected);
    }
  } finally { PairService.prototype.getRecoveryPersistence = read; await f.backend.shutdown(); }
});

test('shutdown reports pending recovery honestly and late persistence failure remains visible', async () => {
  const recovery = deferred<any>(), f = lifecycleFixture({ recovery: recovery.promise });
  const messages: string[] = [], log = console.error;
  console.error = (...items) => { messages.push(items.join(' ')); };
  try {
    await f.backend.start(); await f.backend.shutdown();
    assert.match(f.backend.recoveryDiagnostic(), /pending.*unverified/);
    recovery.reject(Error('synthetic retention failure with PRIVATE_DETAIL'));
    await f.backend.initialized();
    assert.equal(f.backend.status().recoveryInitialization, 'failed');
    assert.equal(f.backend.status().recoveryInspected, false);
    assert.match(f.backend.recoveryDiagnostic(), /persistence failed/);
    assert.equal(messages.length, 1); assert.match(messages[0], /Persistence is unverified/);
    assert.doesNotMatch(messages.join(' '), /PRIVATE_DETAIL|preserved/);
    assert.equal(f.backend.status().state, 'stopped');
  } finally { console.error = log; }
});

test('cancelled initialization does not claim preservation or report an ordinary abort as failure', async () => {
  const recovery = deferred<any>(), f = lifecycleFixture({ recovery: recovery.promise });
  const messages: unknown[] = [], log = console.error;
  console.error = (...items) => { messages.push(items); };
  try {
    await f.backend.start(); await f.backend.shutdown();
    recovery.reject(Object.assign(Error('cancelled'), {name:'AbortError'})); await f.backend.initialized();
    assert.equal(f.backend.status().recoveryInitialization, 'cancelled');
    assert.match(f.backend.recoveryDiagnostic(), /unverified/);
    assert.equal(messages.length, 0);
  } finally { console.error = log; }
});
