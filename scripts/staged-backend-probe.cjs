// Copied to a fresh stage. Builtins first; guards installed before staged imports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { registerHooks, syncBuiltinESMExports } = require('node:module');
const childProcess = require('node:child_process');
const net = require('node:net'), http = require('node:http'), https = require('node:https');
const tls = require('node:tls'), dgram = require('node:dgram'), os = require('node:os');
const timers = require('node:timers'), timerPromises = require('node:timers/promises');
const { reviewedProjects, testOnlyProjects, reviewReason } = require('./.loading-review.cjs');
const root = fs.realpathSync(__dirname);
const modules = new Set(), checks = [], failures = [], blockedOperations = [];
let checkingGuards = false;
const projectAllowlist = new Set([...reviewedProjects, ...testOnlyProjects]);
let baselineLoadedModules = [];
const successfulProjectImports = [], moduleReviews = [];
let stagedComposition = false;
const startupSmokeOnly = process.argv[2] === '--startup-smoke';
let startupSmoke;
function deny(label) {
  const error = Error('Harness prevented ' + label); error.code = 'HARNESS_BLOCKED';
  if (!checkingGuards) blockedOperations.push(label);
  throw error;
}
function block(object, names, prefix) { for (const name of names) object[name] = () => deny(prefix + '.' + name); }
block(childProcess, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], 'child_process');
block(net, ['connect', 'createConnection', 'createServer'], 'net');
block(net.Socket.prototype, ['connect'], 'net.Socket'); block(net.Server.prototype, ['listen'], 'net.Server');
block(http, ['request', 'get', 'createServer'], 'http'); block(https, ['request', 'get', 'createServer'], 'https');
block(tls, ['connect', 'createServer'], 'tls'); block(dgram, ['createSocket'], 'dgram');
block(os, ['networkInterfaces'], 'os');
block(timers, ['setTimeout', 'setInterval', 'setImmediate'], 'timers');
block(timerPromises, ['setTimeout', 'setInterval', 'setImmediate'], 'timers/promises');
block(globalThis, ['setTimeout', 'setInterval', 'setImmediate', 'fetch', 'WebSocket', 'EventSource'], 'global');
syncBuiltinESMExports();
function stagePath(url) {
  const full = fs.realpathSync(fileURLToPath(url));
  const relative = path.relative(root, full);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) deny('outside-stage-resolution');
  const name = relative.split(path.sep).join('/');
  if (/\.(?:tsx?|mts|cts|node)$/i.test(name) || /(?:^|\/)node_modules\/(?:tsx|esbuild|@esbuild)(?:\/|$)/.test(name)) deny('forbidden-runtime-input:' + name);
  if (!name.startsWith('node_modules/') && !projectAllowlist.has(name)) deny('unreviewed-project-module:' + name);
  return name;
}
registerHooks({
  resolve(specifier, context, next) {
    if (/^(?:tsx|esbuild|@esbuild)(?:\/|$)/.test(specifier)) deny('forbidden-package:' + specifier);
    const result = next(specifier, context);
    if (!result.url.startsWith('node:')) stagePath(result.url);
    return result;
  },
  load(url, context, next) {
    if (!url.startsWith('node:')) modules.add(stagePath(url));
    return next(url, context);
  },
});
const load = name => import(pathToFileURL(path.join(root, name)).href);
async function check(name, run) {
  try { await run(); checks.push(name); }
  catch (error) { failures.push({ check: name, code: error.code ?? null, message: error.message, phases: error.phases }); }
}
function syntheticResponse() {
  return { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, setHeader() {} };
}
async function route(router, method, url) {
  const res = syntheticResponse();
  await new Promise((resolve, reject) => {
    const json = res.json; res.json = body => { json.call(res, body); resolve(); return res; };
    router.handle({ method, url, headers: {}, body: {} }, res, error => reject(error ?? Error('Synthetic route did not respond.')));
  });
  return res;
}
(async () => {
  await check('isolation-controls', async () => {
    assert.equal(process.permission.has('child'), false);
    assert.equal(process.permission.has('fs.write'), false);
    assert.equal(process.permission.has('addons'), false);
    assert.ok(!process.execArgv.some(arg => /--(?:import|require|loader)/.test(arg)));
    for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_PRELOAD', 'NODE_LOADER', 'TSX_TSCONFIG_PATH', 'ESBUILD_BINARY_PATH']) assert.equal(process.env[name], undefined);
    for (const name of ['tsx', 'esbuild', '@esbuild']) assert.equal(fs.existsSync(path.join(root, 'node_modules', name)), false);
    checkingGuards = true;
    try {
      for (const call of [() => childProcess.spawn('DO_NOT_EXECUTE'), () => net.createServer(), () => dgram.createSocket('udp4'),
        () => os.networkInterfaces(), () => globalThis.fetch('http://127.0.0.1'), () => setInterval(() => {}, 1)]) assert.throws(call, { code: 'HARNESS_BLOCKED' });
      for (const name of ['tsx', 'esbuild', '@esbuild/win32-x64', './src/server/index.js'])
        await assert.rejects(import(name), { code: 'HARNESS_BLOCKED' });
    } finally { checkingGuards = false; }
  });
  // Failure of isolation controls prevents all application imports.
  if (!failures.length && startupSmokeOnly) {
    await check('staged-startup-initialization-smoke', async () => {
      const { exerciseStagedStartupSmoke } = await load('src/test/backend_lifecycle_fixture.js');
      startupSmoke = await exerciseStagedStartupSmoke(); stagedComposition = true;
    });
  }
  if (!failures.length && !startupSmokeOnly) {
    await check('runtime-packages', async () => {
      const express = (await import('express')).default;
      const cors = (await import('cors')).default;
      const ws = await import('ws');
      const { XMLParser } = await import('fast-xml-parser');
      assert.equal(typeof express().use, 'function'); assert.equal(typeof cors(), 'function');
      assert.equal(typeof ws.WebSocketServer, 'function'); // Never construct a socket/server.
      assert.equal(new XMLParser().parse('<sample><value>42</value></sample>').sample.value, 42);
    });
    await check('tasks-with-synthetic-services', async () => {
      const { TaskManager } = await load('src/core/tasks/task_manager.js');
      const { taskHttpIntegration } = await load('src/server/task_routes.js');
      let refreshes = 0;
      const tasks = new TaskManager();
      const id = tasks.begin('REPORT'); tasks.update(id, { state: 'COMPLETED', phase: 'DONE' });
      const service = taskHttpIntegration(tasks, { refresh: () => refreshes++, monitoring: () => ({ enabled: false, status: 'OFF' }),
        bulk: () => undefined, cancelBulk: () => false, cancelReverify: () => false });
      const response = await route(service.router, 'GET', '/');
      assert.equal(response.body.active, 0); assert.equal(response.body.tasks[0].state, 'COMPLETED'); assert.equal(refreshes, 1);
    });
    await check('foreground-with-synthetic-discovery', async () => {
      const { ForegroundDiscovery } = await load('src/core/engine/foreground_discovery.js');
      const { createForegroundDiscoveryRouter } = await load('src/server/foreground_discovery_routes.js');
      const foreground = new ForegroundDiscovery(); let scans = 0;
      const router = createForegroundDiscoveryRouter({ foreground, yieldMonitoring: async () => {}, busy: () => false,
        quick: async () => { scans++; }, prepare: async () => { throw Error('Unexercised advanced path'); },
        advanced: async () => { throw Error('Unexercised advanced path'); }, monitoring: () => ({ status: 'OFF' }),
        details: () => ({}), error: () => { throw Error('Unexpected route error'); }, failed: () => { throw Error('Unexpected synthetic scan failure'); } });
      assert.equal((await route(router, 'GET', '/status')).body.running, false);
      assert.equal((await route(router, 'POST', '/start')).statusCode, 202);
      await Promise.resolve(); assert.equal(scans, 1); assert.equal(foreground.getState().session.state, 'COMPLETED');
    });
    await check('in-memory-vault', async () => {
      const { OSCredentialVault, InMemoryCredentialStore } = await load('src/core/storage/vault.js');
      OSCredentialVault.prototype.initialize = () => deny('credential-initialization');
      const vault = new OSCredentialVault(new InMemoryCredentialStore());
      // No credential initialization, including the default OS-backed singleton.
      assert.deepEqual(vault.getSafeReferences(), []);
      const saved = await vault.saveCredential({ label: 'Synthetic', username: 'fixture', password: 'synthetic-only' });
      assert.equal(await vault.resolveCredentialSecret(saved.id), 'synthetic-only'); await vault.deleteCredential(saved.id);
    });
    await check('ownerless-api-and-websocket-denied', async () => {
      const { ProductionAuthenticationBoundary } = await load('src/server/production_authentication_boundary.js');
      const boundary = new ProductionAuthenticationBoundary();
      const req = { method: 'GET', url: '/ws', rawHeaders: ['Host', 'localhost:3001'], headers: {} };
      const res = syntheticResponse(); let next = false;
      boundary.http(req, res, () => { next = true; });
      assert.equal(res.statusCode, 401); assert.equal(next, false); assert.equal(boundary.verifyUpgrade(req), false);
      boundary.dispose();
    });
    baselineLoadedModules = [...modules].sort();
    for (const name of reviewedProjects.filter(name => !modules.has(name))) {
      await check('reviewed-import:' + name, async () => {
        const exports = await load(name);
        assert.equal(typeof exports, 'object');
        successfulProjectImports.push(name);
      });
      moduleReviews.push({ module: name, reason: reviewReason(name), operationalMethodsExercised: false });
    }
    await check('project-report-and-current-list-synthetic-state', async () => {
      const { SiteProjectDatabase } = await load('src/core/storage/project_db.js');
      const { ReportSet } = await load('src/core/reporting/report_set.js');
      const { createCurrentListRouter } = await load('src/server/current_list_routes.js');
      const { createReportSetRouter } = await load('src/server/report_set_routes.js');
      const db = new SiteProjectDatabase();
      const set = new ReportSet(() => db.getSession());
      assert.deepEqual((await route(createReportSetRouter(set), 'GET', '/')).body.members, []);
      assert.ok((await route(createCurrentListRouter(db, () => {}), 'GET', '/suppression')).body);
      assert.deepEqual(db.getProject().devices, []);
    });
    await check('advanced-route-with-synthetic-adapter-service', async () => {
      const { createAdvancedScanRouter } = await load('src/server/advanced_scan_routes.js');
      let calls = 0;
      const router = createAdvancedScanRouter({ listAdapters: async () => { calls++; return []; },
        validate: async () => { throw Error('Not exercised'); } }, () => { throw Error('Unexpected synthetic adapter error'); });
      assert.deepEqual((await route(router, 'GET', '/adapters')).body, []); assert.equal(calls, 1);
    });
    await check('receive-status-with-synthetic-matrix', async () => {
      const { createReceiveMatrixRouter } = await load('src/server/receive_matrix_routes.js');
      const router = createReceiveMatrixRouter({ snapshot: () => null, start: () => deny('discovery'), stop: () => false });
      assert.deepEqual((await route(router, 'GET', '/')).body, { matrix: null });
    });
    await check('camera-access-denies-missing-evidence', async () => {
      const { decideCameraAccess } = await load('src/shared/camera_access.js');
      assert.equal(decideCameraAccess('synthetic-missing', [], []).allowed, false);
    });
    await check('staged-composition-lifecycle-with-test-only-dependencies', async () => {
      const { exerciseStagedLifecycle } = await load('src/test/backend_lifecycle_fixture.js');
      await exerciseStagedLifecycle(); stagedComposition = true;
    });
  }
  if (blockedOperations.length) failures.push({ check: 'unexpected-side-effects', message: blockedOperations.join(', ') });
  const report = { passed: failures.length === 0, informationalOnly: true, productionAuthority: false, completeClosure: false,
    runtime: { executable: process.execPath, version: process.version, platform: process.platform, arch: process.arch, execArgv: process.execArgv },
    checks, failures, blockedOperations, loadedModules: [...modules].sort(), baselineLoadedModules, successfulProjectImports, moduleReviews,
    realEntrypointImported: false, stagedComposition, startupSmoke, tsxEsbuildUnavailable: checks.includes('isolation-controls') };
  console.log(JSON.stringify(report)); if (!report.passed) process.exitCode = 1;
})().catch(error => { console.log(JSON.stringify({ passed: false, failures: [{ check: 'probe-fatal', message: error.message }] })); process.exitCode = 1; });
