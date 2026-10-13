// Test-only composition. No real sockets, timers, discovery, adapters, stores or helpers.
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import type { Socket } from 'node:net';
import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';
import { constructBackend, type BackendDependencies } from '../server/backend_application.ts';

export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** One startup smoke with synthetic providers; the probe's process watchdog bounds a stalled promise. */
export async function exerciseStagedStartupSmoke() {
  const started = performance.now(), phases: { name: string; elapsedMs: number }[] = [];
  const deadlineMs = 3000;
  const phase = (name: string) => {
    const elapsedMs = performance.now() - started;
    phases.push({ name, elapsedMs });
    assert.ok(elapsedMs < deadlineMs, 'Synthetic startup deadline exceeded: ' + name);
  };
  let f: ReturnType<typeof lifecycleFixture> | undefined;
  try {
    phase('construct'); f = lifecycleFixture(); assert.deepEqual(f.events, []);
    phase('start'); await f.backend.start();
    phase('initialize'); await f.backend.initialized();
    assert.equal(f.backend.status().state, 'running');
    assert.equal(f.backend.status().recoveryInitialization, 'completed');
    assert.equal(f.backend.status().recoveryInspected, true);
    assert.equal(f.events.filter(e => e === 'recovery.initialize').length, 1);
    assert.equal(f.events.filter(e => e === 'credentials.initialize').length, 1);
    phase('denial'); assert.equal((await f.request()).status, 401);
    assert.equal(f.verifyUpgrade({ method: 'GET', url: '/ws', headers: {}, rawHeaders: ['Host', 'localhost:3001'] }), false);
  } catch (error) {
    throw Object.assign(new Error('Staged synthetic startup failed at ' + phases.at(-1)?.name, { cause: error }), { phases });
  } finally {
    if (f) {
      // Always initiate cleanup, even if a phase assertion failed or elapsed time expired.
      phases.push({ name: 'shutdown', elapsedMs: performance.now() - started });
      const closing = f.backend.shutdown(); assert.equal(f.backend.shutdown(), closing); await closing;
      assert.equal(f.backend.status().state, 'stopped'); assert.equal(f.http.listening, false);
      assert.ok(f.signals.every(s => s.aborted));
      // Lifecycle deliberately retains one inert error sink for late provider errors.
      assert.equal(f.http.listenerCount('error'), 1); assert.equal(f.ws.listenerCount('connection'), 0);
      assert.equal(f.ws.listenerCount('error'), 1);
      f.http.emit('error', new Error('synthetic late error')); f.ws.emit('error', new Error('synthetic late error'));
      assert.equal(f.backend.status().state, 'stopped');
    }
  }
  phase('stopped');
  return { passed: true, phases, deadlineMs, providers: 'synthetic-only', productionAuthority: false,
    apiStatus: 401, wsAllowed: false, state: f!.backend.status().state, events: f!.events };
}

/** Also executed as emitted JavaScript by plain Node under the isolation guards. */
export async function exerciseStagedLifecycle() {
  const f = lifecycleFixture(); assert.equal(f.events.length, 0);
  await f.backend.start(); await f.backend.initialized();
  assert.equal((await f.request()).status, 401); assert.equal((await f.request('invalid.example')).status, 400);
  assert.equal(f.verifyUpgrade({ method: 'GET', url: '/ws', headers: {}, rawHeaders: ['Host', 'localhost:3001'] }), false);
  assert.ok(f.events.includes('listen:127.0.0.1:3001')); assert.ok(f.events.includes('schedule:1000'));
  const closing = f.backend.shutdown(); assert.equal(f.backend.shutdown(), closing); await closing;
  assert.equal(f.backend.status().state, 'stopped'); assert.ok(f.signals.every(s => s.aborted));
  for (const failAt of ['ws', 'schedule', 'diagnostic', 'discovery', 'listen']) {
    const failed = lifecycleFixture({ failAt }); await assert.rejects(failed.backend.start()); await failed.backend.shutdown();
    assert.ok(failed.events.includes('http.close')); assert.equal(failed.backend.status().state, 'stopped');
  }
  const recovery = deferred<any>(), credentials = deferred<void>();
  const late = lifecycleFixture({ delayListen: true, recovery: recovery.promise, credentials: credentials.promise });
  const started = late.backend.start(), rejected = assert.rejects(started, { name: 'AbortError' });
  await Promise.resolve(); await late.backend.shutdown(); await rejected;
  recovery.resolve(null); credentials.resolve(); await late.backend.initialized();
  late.lateListen(); late.lateReconcile(); await Promise.resolve();
  assert.equal(late.http.listening, false); assert.equal(late.backend.status().recoveryInspected, false);
  assert.equal(late.backend.status().state, 'stopped');
}
export function lifecycleFixture(options: { delayListen?: boolean; failAt?: string; recovery?: Promise<any>; credentials?: Promise<void>; cleanupFailure?: string; errorDuringDiagnosticStart?: boolean } = {}) {
  const events: string[] = [], signals: AbortSignal[] = [];
  let listenCallback = () => {}, reconcile = () => {};
  let verifyUpgrade: (info: any) => boolean = () => false;
  let diagnosticDevice: (device: any) => void = () => {};
  let discoveryCallbacks: any;
  const broken = (name: string) => { if (options.failAt === name) throw Object.assign(new Error(name), { code: 'EADDRINUSE' }); };
  class Http extends EventEmitter {
    listening = false;
    listen(port: number, host: string, callback: () => void) {
      events.push(`listen:${host}:${port}`); broken('listen');
      listenCallback = () => { this.listening = true; callback(); };
      if (!options.delayListen) queueMicrotask(listenCallback);
      return this;
    }
    close(callback: (error?: Error) => void) {
      events.push('http.close'); this.listening = false;
      callback(options.cleanupFailure === 'http' ? new Error('http cleanup') : undefined); return this;
    }
    closeAllConnections() { events.push('http.closeAllConnections'); }
  }
  class Ws extends EventEmitter {
    clients = new Set<any>();
    close(callback: (error?: Error) => void) {
      events.push('ws.close'); callback(options.cleanupFailure === 'ws' ? new Error('ws cleanup') : undefined);
    }
  }
  const http = new Http(), ws = new Ws();
  const monitor = (name: string) => ({
    start() { events.push(name + '.start'); broken(name); if(name==='diagnostic' && options.errorDuringDiagnosticStart)http.emit('error', Error('synchronous provider error')); },
    stop() { events.push(name + '.stop'); if (options.cleanupFailure === name) throw Error('monitor cleanup'); },
    cancelCurrent() { events.push(name + '.cancel'); },
    getState: () => ({ enabled: false, running: false, status: 'OFF', intervalMs: 30000, maxConcurrency: 3 }),
    setIntervalMs() {}, refreshNow: async () => {}, yieldToTechnician: async () => {}, runNow: async () => 'SKIPPED',
  });
  const dependencies: BackendDependencies = {
    createHttpServer() { events.push('http.create'); broken('http'); return http as unknown as Server; },
    createWebSocketServer(args: any) {
      events.push('ws.create'); broken('ws'); verifyUpgrade = args.verifyClient;
      if (args.path !== '/ws' || args.maxPayload !== 256 || args.perMessageDeflate !== false) throw Error('Security options changed');
      return ws as unknown as WebSocketServer;
    },
    createDiagnosticMonitor: (_engine, _devices, onDevice) => { diagnosticDevice=onDevice;return monitor('diagnostic') as any; },
    createDiscoveryMonitor: callbacks => { discoveryCallbacks=callbacks;return monitor('discovery') as any; },
    scheduleReconciliation(callback, intervalMs) {
      events.push('schedule:' + intervalMs); broken('schedule'); reconcile = callback;
      return { cancel() { events.push('timer.cancel'); if (options.cleanupFailure === 'timer') throw Error('timer cleanup'); } };
    },
    initializeRecovery(_pair, signal) { events.push('recovery.initialize'); signals.push(signal); return options.recovery ?? Promise.resolve(null); },
    initializeCredentials(_vault, signal) { events.push('credentials.initialize'); signals.push(signal); return options.credentials ?? Promise.resolve(); },
  };
  const backend = constructBackend(dependencies);
  const request = (host = 'localhost:3001', url = '/api/system/about') => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = new IncomingMessage(new PassThrough() as unknown as Socket);
    req.method = 'GET'; req.url = url; req.headers = { host }; req.rawHeaders = ['Host', host];
    const res = new ServerResponse(req);
    res.end = ((chunk?: any) => { resolve({ status: res.statusCode, body: String(chunk ?? '') }); return res; }) as typeof res.end;
    backend.app(req as any, res as any, (error?: any) => reject(error ?? Error('Unanswered synthetic request')));
  });
  return { backend, events, signals, http, ws, request, verifyUpgrade: (req: any) => verifyUpgrade({ req }),
    lateListen: () => listenCallback(), lateReconcile: () => reconcile(), diagnosticDevice: (device: any) => diagnosticDevice(device), discoveryCallbacks };
}
