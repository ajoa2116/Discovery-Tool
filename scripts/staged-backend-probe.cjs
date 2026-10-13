// Copied to a fresh stage. Builtins first; guards installed before staged imports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { registerHooks, syncBuiltinESMExports, createRequire } = require('node:module');
const childProcess = require('node:child_process');
const net = require('node:net'), http = require('node:http'), https = require('node:https');
const tls = require('node:tls'), dgram = require('node:dgram'), os = require('node:os');
const timers = require('node:timers'), timerPromises = require('node:timers/promises');
const { reviewedProjects, testOnlyProjects, reviewReason, buildPackageAdmission, installPackageAdmissionHooks, selectedDependencyRequests, createSelectedPathCapture } = require('./.loading-review.cjs');
const root = fs.realpathSync(__dirname);
const modules = new Set(), checks = [], failures = [], blockedOperations = [];
let checkingGuards = false;
const projectAllowlist = new Set([...reviewedProjects, ...testOnlyProjects]);
let baselineLoadedModules = [];
const successfulProjectImports = [], moduleReviews = [];
let stagedComposition = false;
const startupSmokeOnly = process.argv[2] === '--startup-smoke';
const resolutionOnly = process.argv[2] === '--resolution-only';
const mappingOnly = process.argv[2] === '--mapping-only';
let startupSmoke;
let dependencyResolution;
let helperMapping;
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
// Rebuild from staging records and fixed review, not a caller-authored allowlist.
const stageManifest = JSON.parse(fs.readFileSync(path.join(root, 'stage-manifest.json'), 'utf8'));
const packageAdmission = buildPackageAdmission(stageManifest);
installPackageAdmissionHooks(root, packageAdmission);
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
  if (!failures.length && mappingOnly) {
    const inventory = JSON.parse(fs.readFileSync(path.join(root, 'inventory.json'), 'utf8'));
    const capture = createSelectedPathCapture(root, stageManifest, inventory);
    await check('emitted-powershell-request-captured-without-execution', async () => {
      const { observeWindowsReceive } = await load('src/core/readiness/windows_receive_observation.js');
      const blockedExec = childProcess.execFile;
      childProcess.execFile = (command, args, options, callback) => {
        assert.equal(command, 'powershell.exe');
        assert.deepEqual(args, ['-NoProfile','-NonInteractive','-File',path.join(root,'scripts/observe-windows-receive.ps1'),
          '-InterfaceIndex','12','-BackendExecutable',process.execPath]);
        assert.deepEqual(options, { windowsHide: true, timeout: 15000, maxBuffer: 131072 });
        capture.capture(args[3], 'scripts/observe-windows-receive.ps1', 'src/core/readiness/windows_receive_observation.ts',
          '../../../scripts/observe-windows-receive.ps1', 'execFile-capture', args);
        callback(null, JSON.stringify({ capturedOnly: true }));
      };
      syncBuiltinESMExports();
      try {
        assert.deepEqual(await observeWindowsReceive(12), { capturedOnly: true });
        assert.deepEqual(await observeWindowsReceive(12), { capturedOnly: true });
      } finally { childProcess.execFile = blockedExec; syncBuiltinESMExports(); }
    });
    await check('emitted-native-host-request-captured-without-execution', async () => {
      const { checkNativeCapability } = await load('src/core/connect/native_camera_capability.js');
      const blockedSpawn = childProcess.spawn;
      const before = capture.calls.length;
      childProcess.spawn = (command, args, options) => {
        assert.deepEqual(args, ['--capability']); assert.equal(options.shell, false);
        capture.capture(command, 'native/CameraBrowserHost/bin/Release/net10.0-windows/CameraBrowserHost.exe',
          'src/core/connect/native_camera_proof.ts', '../../../native/CameraBrowserHost/bin/Release/net10.0-windows/CameraBrowserHost.exe',
          'spawn-capture', args);
        // Stop at the call boundary, before timer/pipe/native initialization.
        throw Object.assign(Error('Synthetic capture stop.'), { code: 'CAPTURE_ONLY' });
      };
      syncBuiltinESMExports();
      try {
        assert.equal((await checkNativeCapability({ platform: 'win32' })).code, 'HOST_UNAVAILABLE');
        // The application catches native failures; denial must not masquerade
        // as successful path capture merely because HOST_UNAVAILABLE is returned.
        assert.equal(capture.calls.length, before + 1);
      }
      finally { childProcess.spawn = blockedSpawn; syncBuiltinESMExports(); }
    });
    await check('emitted-build-metadata-reads-captured-with-synthetic-json', async () => {
      const { readBuildIdentity } = await load('src/core/readiness/build_identity.js');
      const read = fs.readFileSync;
      fs.readFileSync = (input, encoding) => {
        assert.equal(encoding, 'utf8');
        const isPackage = input instanceof URL;
        const expected = isPackage ? 'package.json' : 'dist/build-info.json';
        capture.capture(input, expected, 'src/core/readiness/build_identity.ts', '../../../' + expected, 'readFileSync-capture');
        return JSON.stringify(isPackage ? { version: 'fixture' } : { version: 'fixture', sourceDigest: 'a'.repeat(64), commit: null, dirty: false });
      };
      syncBuiltinESMExports();
      try { assert.equal(readBuildIdentity().sourceDigest, 'a'.repeat(64)); assert.equal(readBuildIdentity().sourceDigest, 'a'.repeat(64)); }
      finally { fs.readFileSync = read; syncBuiltinESMExports(); }
    });
    await check('emitted-ui-asset-boundaries-captured-as-exact-selected-files', async () => {
      const { productionAssets, productionAssetRoot } = await load('src/server/production_assets.js');
      const express = (await import('express')).default;
      assert.equal(productionAssetRoot, path.join(root,'dist') + path.sep);
      const staticMiddleware = express.static, exists = fs.existsSync;
      const selectedAssets = stageManifest.candidates.filter(c => c.output?.startsWith('dist/') &&
        c.selectionReasons.includes('observed-module-url-directory:src/server/production_assets.ts'));
      assert.ok(selectedAssets.length > 0);
      express.static = (directory, options) => {
        assert.equal(directory, productionAssetRoot); assert.deepEqual(options, { index: 'index.html' });
        for (const asset of selectedAssets) capture.capture(path.join(directory, path.relative(path.join(root,'dist'), path.join(root,asset.output))),
          asset.output, 'src/server/production_assets.ts', '../../dist/', 'express.static-capture');
        return (_req, _res, next) => next(); // No send/file-read behavior.
      };
      fs.existsSync = input => {
        capture.capture(input, 'dist/index.html', 'src/server/production_assets.ts', '../../dist/', 'existsSync-capture'); return true;
      };
      syncBuiltinESMExports();
      try {
        const router = productionAssets();
        // Invoke only the constructed root handler; Express dispatch completion
        // schedules setImmediate, which remains prohibited by the fixture.
        const handler = router.stack.find(layer => layer.route?.path === '/')?.route.stack[0].handle;
        assert.equal(typeof handler, 'function');
        let continued = false;
        handler({ method: 'GET', url: '/', headers: {} }, syntheticResponse(), () => { continued = true; });
        assert.equal(continued, true);
      } finally { express.static = staticMiddleware; fs.existsSync = exists; syncBuiltinESMExports(); }
    });
    helperMapping = { informationalOnly: true, productionAuthority: false, completeClosure: false,
      calls: capture.calls, helpersExecuted: 0, providerExecuted: false, selectedContentsRead: false,
      references: inventory.references.filter(r => r.kind === 'module-url' &&
        stageManifest.candidates.some(c => c.source === r.source && ['transpiled','copied-candidate'].includes(c.status))).map(r => ({
        source: r.source, specifier: r.specifier, selectedTarget: r.resolvedPath ?? null,
        status: capture.calls.some(c => c.source === r.source && c.specifier === r.specifier) ? 'captured-only' : 'conditional-or-unexercised' })),
      unresolved: stageManifest.unresolved, limitations: ['Metadata identity is not signed byte provenance or race-free installation.',
        'Synthetic calls do not prove PowerShell, native/CLR/DLL/WebView2 compatibility or browser asset behavior.'] };
  }
  if (!failures.length && resolutionOnly) {
    const resolvedFiles = [], edges = [], entrypoints = [];
    const relative = file => path.relative(root, file).split(path.sep).join('/');
    const admitted = new Set(packageAdmission.admitted.map(r => r.path));
    await check('selected-admitted-file-resolution', async () => {
      for (const record of packageAdmission.admitted) {
        const resolved = relative(require.resolve('./' + record.path));
        assert.equal(resolved, record.path);
        resolvedFiles.push({ path: resolved, mode: 'require.resolve', bodyExecuted: false });
      }
    });
    await check('selected-package-dependency-edges', async () => {
      const inventory = JSON.parse(fs.readFileSync(path.join(root, 'inventory.json'), 'utf8'));
      for (const edge of selectedDependencyRequests(stageManifest, inventory, packageAdmission)) {
        const record = { parent: edge.parent, name: edge.name, classification: edge.classification,
          selectedResolution: edge.resolution, fallback: edge.fallback, bodyExecuted: false,
          unexercisedReferences: edge.unexercisedReferences, requests: [], status: 'conditional-or-unexercised' };
        for (const request of edge.requests) {
          const observation = { ...request, mode: 'require.resolve', bodyExecuted: false };
          try {
            const localRequire = createRequire(path.join(root, request.source));
            observation.path = relative(localRequire.resolve(request.specifier));
            if (!admitted.has(observation.path)) throw Object.assign(Error('Unadmitted dependency target'), { code: 'PACKAGE_FILE_DENIED' });
            if (edge.resolution.status === 'lock-candidate' && !observation.path.startsWith(edge.resolution.path + '/'))
              throw Object.assign(Error('Resolution differs from selected package'), { code: 'SELECTED_PACKAGE_MISMATCH' });
            observation.status = 'resolved-and-admitted';
          } catch (error) {
            observation.code = error.code ?? null;
            observation.status = error.code === 'PACKAGE_FILE_DENIED' ? 'conditional-or-unexercised' : 'missing-or-ambiguous';
            if (edge.classification === 'required') failures.push({ check: 'required-edge:' + request.source + ':' + request.specifier, code: observation.code });
          }
          record.requests.push(observation);
        }
        if (record.requests.length) record.status = record.requests.every(r => r.status === 'resolved-and-admitted') ? 'resolved-and-admitted' :
          record.requests.some(r => r.status === 'missing-or-ambiguous') ? 'missing-or-ambiguous' : 'conditional-or-unexercised';
        edges.push(record);
      }
    });
    await check('node-package-exports-and-cjs-esm-interoperation', async () => {
      for (const [name, expected] of [['express','node_modules/express/index.js'], ['cors','node_modules/cors/lib/index.js'],
        ['fast-xml-parser','node_modules/fast-xml-parser/src/fxp.js'], ['ws','node_modules/ws/index.js']]) {
        const result = require.resolve(name); assert.equal(relative(result), expected);
        const cjs = require(name), esm = await import(name);
        if (name === 'fast-xml-parser') {
          assert.equal(esm.XMLParser, cjs.XMLParser);
          assert.equal(new cjs.XMLParser().parse('<sample><value>42</value></sample>').sample.value, 42);
        } else assert.equal(esm.default, cjs);
        entrypoints.push({ specifier: name, requirePath: expected, importPath: name === 'ws' ? 'node_modules/ws/wrapper.mjs' : expected,
          status: 'resolved-and-admitted', loadObserved: true });
      }
    });
    await check('unselected-alternatives-and-missing-peers-denied', async () => {
      for (const name of ['node_modules/ws/browser.js', 'node_modules/iconv-lite/encodings/index.js']) {
        assert.throws(() => require('./' + name), { code: 'PACKAGE_FILE_DENIED' });
        await assert.rejects(import(pathToFileURL(path.join(root, name)).href), { code: 'PACKAGE_FILE_DENIED' });
      }
      for (const name of ['bufferutil', 'utf-8-validate', 'sql.js']) {
        assert.throws(() => require(name), { code: 'MODULE_NOT_FOUND' });
        await assert.rejects(import(name), { code: 'ERR_MODULE_NOT_FOUND' });
      }
    });
    const observed = new Set(modules), counts = new Map();
    for (const c of stageManifest.candidates) if (c.output) counts.set(c.output, (counts.get(c.output) ?? 0) + 1);
    const paths = stageManifest.candidates.filter(c => c.status !== 'unselected-unresolved' &&
      (/\.(?:[cm]?js|exe|dll|node|wasm|ps1)$/i.test(c.output ?? c.source) ||
        c.selectionReasons.some(r => r.startsWith('observed-module-url:') || r.startsWith('observed-module-url-directory:')))).map(c => {
      const name = c.output ?? c.source, present = fs.existsSync(path.join(root, name));
      const external = /\.(?:exe|dll|node|wasm|ps1)$/i.test(name);
      const status = !present || !['copied-candidate','transpiled','generated-metadata'].includes(c.status) || counts.get(name) !== 1 ? 'missing-or-ambiguous' :
        external ? 'external-execution-dependent' : resolvedFiles.some(r => r.path === name) && admitted.has(name) ? 'resolved-and-admitted' : 'conditional-or-unexercised';
      return { path: name, status, selectionStatus: c.status, selectionReasons: c.selectionReasons,
        present, admitted: admitted.has(name), loadObserved: observed.has(name), providerExecuted: false };
    });
    dependencyResolution = { informationalOnly: true, productionAuthority: false, completeClosure: false,
      conditions: 'Current Node default node/import/require conditions only; no browser/custom-condition approval.',
      resolvedFiles, edges, entrypoints, paths, unresolved: stageManifest.unresolved,
      limitations: ['Resolution is not execution closure or integrity verification.', 'Assets/helpers have presence evidence only; no PowerShell/native/CLR/DLL/WASM/provider execution.'] };
  }
  if (!failures.length && startupSmokeOnly) {
    await check('staged-startup-initialization-smoke', async () => {
      const { exerciseStagedStartupSmoke } = await load('src/test/backend_lifecycle_fixture.js');
      startupSmoke = await exerciseStagedStartupSmoke(); stagedComposition = true;
    });
  }
  if (!failures.length && !startupSmokeOnly && !resolutionOnly && !mappingOnly) {
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
    realEntrypointImported: false, stagedComposition, startupSmoke, dependencyResolution, helperMapping, tsxEsbuildUnavailable: checks.includes('isolation-controls') };
  console.log(JSON.stringify(report)); if (!report.passed) process.exitCode = 1;
})().catch(error => { console.log(JSON.stringify({ passed: false, failures: [{ check: 'probe-fatal', message: error.message }] })); process.exitCode = 1; });
