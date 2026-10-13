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
const { reviewedProjects, testOnlyProjects, reviewReason } = require('./node-launch-review.cjs');
const root = fs.realpathSync(__dirname);
const modules = new Set(), checks = [], failures = [], blockedOperations = [];
let checkingGuards = false;
const projectAllowlist = new Set([...reviewedProjects, ...testOnlyProjects]);
let baselineLoadedModules = [];
const successfulProjectImports = [], moduleReviews = [];
let stagedComposition = false;
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
  catch (error) { failures.push({ check: name, code: error.code ?? null, message: error.message }); }
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
  assert.equal(process.version, 'v24.19.0');
  assert.equal(process.arch, 'x64');
  assert.equal(process.cwd(), root);
  for (const key of ['NODE_OPTIONS','NODE_PATH','NODE_PRELOAD','NODE_LOADER','TSX_TSCONFIG_PATH','ESBUILD_BINARY_PATH','PATH']) assert.equal(process.env[key], undefined);
  assert.equal(process.permission.has('child'), false);
  assert.equal(process.permission.has('addons'), false);
  assert.equal(process.permission.has('fs.write', path.join(root, 'forbidden-write')), false);
  assert.ok(!process.execArgv.some(arg => /--(?:import|require|loader)/.test(arg)));
  checkingGuards = true;
  try {
    for (const action of [() => childProcess.spawn('DO_NOT_EXECUTE'), () => net.createServer(), () => dgram.createSocket('udp4'), () => os.networkInterfaces(), () => setInterval(() => {}, 1)]) assert.throws(action, {code:'HARNESS_BLOCKED'});
    for (const input of ['tsx','esbuild','@esbuild/win32-x64','./src/server/index.js']) await assert.rejects(import(input), {code:'HARNESS_BLOCKED'});
  } finally { checkingGuards = false; }
  if(process.argv[2]==='hold'){
    // Lifetime control only: report the measured runtime alive, never backend completion.
    fs.writeFileSync(path.join(root,'node-launch-result.json'),JSON.stringify({passed:false,terminal:false,lifetimeReady:true,
      productionAuthority:false,runtime:process.version,executable:process.execPath,blockedOperations}),{flag:'w'});
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);return;
  }
  const { OSCredentialVault } = await load('src/core/storage/vault.js');
  OSCredentialVault.prototype.initialize = () => deny('credential-initialization');
  const { exerciseStagedLifecycle } = await load('src/test/backend_lifecycle_fixture.js');
  await exerciseStagedLifecycle();
  const { decideCameraAccess } = await load('src/shared/camera_access.js');
  assert.equal(decideCameraAccess('fixture-missing-evidence', [], []).allowed, false);
  assert.deepEqual(blockedOperations, []);
  assert.ok(!modules.has('src/server/index.js'));
  fs.writeFileSync(path.join(root, 'node-launch-result.json'), JSON.stringify({passed:true, terminal:true,productionAuthority:false, completeClosure:false, runtime:process.version, executable:process.execPath, arguments:process.execArgv, cwd:process.cwd(), environmentKeys:Object.keys(process.env).sort(), stagedComposition:true, realEntrypointImported:false, blockedOperations, loadedModules:[...modules].sort()}), {flag:'w'});
})().catch(error => { try { fs.writeFileSync(path.join(root, 'node-launch-result.json'), JSON.stringify({passed:false,terminal:true,productionAuthority:false,code:error.code ?? null, message:error.message}), {flag:'w'}); } catch {} process.exitCode=1; });
