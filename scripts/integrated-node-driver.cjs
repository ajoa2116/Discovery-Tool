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
const projectAllowlist = new Set([...reviewedProjects, ...testOnlyProjects, 'src/test/support/synthetic_tls_binding.js',
  'src/test/support/backend_tls_binding.js',
  'src/server/backend_identity_handoff.js', 'src/server/companion_bootstrap_authority.js', 'src/server/application_companion_supervisor.js',
  'src/server/private_bootstrap_transport.js', 'src/server/bootstrap_async_supervisor.js', 'src/server/bootstrap_ack_decoder.js',
  'src/server/application_session_authority.js', 'src/server/companion_deadline.js']);
const addonPath=path.join(root,'node-owner-bridge.node'); const actualDlopen=process.dlopen; let addonLoaded=false;
process.dlopen=function(module, file, ...args) {
  const ordinary=file.startsWith('\\\\?\\')?file.slice(4):file;
  if(addonLoaded || path.resolve(ordinary)!==addonPath || fs.realpathSync(ordinary)!==addonPath) return deny('unmeasured-addon');
  addonLoaded=true; return actualDlopen.call(process,module,file,...args);
};
let baselineLoadedModules = [];
const successfulProjectImports = [], moduleReviews = [];
let stagedComposition = false;
let diagnosticPhase = 'driver';
function deny(label) {
  const error = Error('Harness prevented ' + label); error.code = 'HARNESS_BLOCKED';
  if (!checkingGuards) blockedOperations.push(label);
  throw error;
}
function block(object, names, prefix) { for (const name of names) object[name] = () => deny(prefix + '.' + name); }
block(childProcess, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], 'child_process');
block(net, ['connect', 'createConnection', 'createServer'], 'net');
block(net.Socket.prototype, ['connect'], 'net.Socket'); const actualListen = net.Server.prototype.listen; let ownedServer;
net.Server.prototype.listen = function(...args) { if(this !== ownedServer || args[0] !== 0 || args[1] !== '127.0.0.1') return deny('foreign-listener'); return actualListen.apply(this,args); };
block(http, ['request', 'get', 'createServer'], 'http'); const actualHttpsServer = https.createServer;
block(https, ['request','get'], 'https');
https.createServer = function(...args) { if(ownedServer) return deny('second-listener'); return ownedServer = actualHttpsServer(...args); };
block(tls, ['connect', 'createServer'], 'tls'); block(dgram, ['createSocket'], 'dgram');
block(os, ['networkInterfaces'], 'os');
block(timers, ['setTimeout', 'setInterval', 'setImmediate'], 'timers');
block(timerPromises, ['setTimeout', 'setInterval', 'setImmediate'], 'timers/promises');
const actualInterval = globalThis.setInterval;
block(globalThis, ['setTimeout','setImmediate','fetch','WebSocket','EventSource'], 'global');
globalThis.setInterval = function(callback, delay, ...args) { if(delay !== 50) return deny('unexpected-fixture-timer'); return actualInterval(callback,delay,...args); };
syncBuiltinESMExports();
function stagePath(url) {
  const full = fs.realpathSync(fileURLToPath(url));
  const relative = path.relative(root, full);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) deny('outside-stage-resolution');
  const name = relative.split(path.sep).join('/');
  if (full === addonPath && name === 'node-owner-bridge.node') return name;
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
  assert.equal(process.version,'v24.19.0'); assert.equal(process.arch,'x64'); assert.equal(process.cwd(),root);
  assert.equal(process.permission.has('child'),false);
  for(const key of ['NODE_OPTIONS','NODE_PATH','PATH','NODE_PRELOAD','NODE_LOADER']) assert.equal(process.env[key],undefined);
  const [pipe, ownerHandle, mode] = process.argv.slice(2);
  diagnosticPhase='addon-load'; const addon=require(addonPath); diagnosticPhase='authentication';
  if(mode==='no-connect') { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0); return; }
  const ended=new AbortController(); let tlsMaterial; const compositionEvidence={}; const resourceStarted=performance.now(); let loadRequests=0, replayDenials=0;
  const resourceModes=['owner-wire-oversized','owner-wire-zero','owner-wire-limit','owner-wire-type','owner-wire-short','owner-tls-malformed',
    'node-wire-oversized','node-wire-zero','duplicate-load','cancel-load','port-wrap','port-fraction'];
  try {
    tlsMaterial=addon.authenticate(BigInt(ownerHandle),pipe,()=>ended.abort(), mode);
    const composition=mode.startsWith('composition-');
    const { syntheticTlsFixture }=composition?{}:await load('src/test/support/synthetic_tls_binding.js');
    const bridge={ended:ended.signal,
      acquireTLS() { assert.ok(tlsMaterial); const material=tlsMaterial; tlsMaterial=undefined; return material; },
      bind:(server,ws,session,port)=>{
        const pending=addon.bind(server,ws,session,mode==='port-wrap'?4294967296+port:mode==='port-fraction'?port+0.5:port);
        if(mode==='duplicate-load'||mode==='cancel-load') {
          pending.catch(()=>{}); // Attach before any terminal cancellation can settle it.
          for(let i=0;i<64;i++) {
            loadRequests++;
            if(mode==='duplicate-load') {try {addon.bind(server,ws,session,port);throw Error('Duplicate accepted.');}
              catch(error) {assert.equal(error.code,'replay');replayDenials++;}}
            else Promise.resolve().then(()=>addon.revoke());
          }
        }
        return pending;
      },
      assert:(server,ws,session)=>addon.assert(server,ws,session), revoke:()=>addon.revoke() };
    const fixture=composition?await (await load('src/test/support/backend_tls_binding.js')).actualBackendTlsFixture(bridge,mode,compositionEvidence):await syntheticTlsFixture({bridge});
    assert.equal(fixture.snapshot().nativeOwnerAuthenticated,true);
    assert.equal(fixture.snapshot().productionAuthority,false);
    fixture.assertLive();
    if(mode==='node-exit') process.exit(0);
    if(mode==='listener-loss') await fixture.loseListenerForTest();
    if(mode==='ws-loss') await fixture.loseWsForTest();
    if(mode==='composition-listener-loss')await fixture.loseListenerForTest();
    if(mode==='composition-ws-loss')await fixture.loseWsForTest();
    let denial=null;
    if(mode==='object-swap') { try { addon.assert({}, {}, {}); } catch(error) { denial=error.code; } assert.equal(denial,'object'); }
    if(mode==='composition-object-swap'){try{fixture.substituteForTest();}catch(error){denial=error.code;}assert.equal(denial,'object');}
    if(mode==='bind-replay') { try { addon.bind({}, {}, {}, 0); } catch(error) { denial=error.code; } assert.equal(denial,'replay'); }
    if(['pipe-loss','expiry','cancel','owner-exit','composition-pipe-loss','composition-expiry'].includes(mode)) {
      if(!ended.signal.aborted) await new Promise(resolve=>ended.signal.addEventListener('abort',resolve,{once:true}));
    }
    await fixture.close(); assert.equal(fixture.snapshot().connections,0); assert.equal(fixture.snapshot().pendingClients,0);
    assert.equal(fixture.snapshot().shutdownComplete,true);
    const native=addon.snapshot(); assert.equal(native.handlesClosed,true); assert.equal(native.referencesReleased,true);
    assert.deepEqual(blockedOperations,[]); assert.ok(!modules.has('src/server/index.js'));
    fs.writeFileSync(path.join(root,'node-launch-result.json'),JSON.stringify({passed:true,productionAuthority:false,completeClosure:false,authenticatedBeforeClose:true,mode,denial,native,
      fixture:fixture.snapshot(),compositionEvidence,loadedModules:[...modules].sort(),blockedOperations}),{flag:'wx'});
  } catch(error) {
    addon.revoke();
    if(resourceModes.includes(mode)||mode.startsWith('composition-')) {
      assert.equal(ownedServer?.listening??false,false); assert.deepEqual(blockedOperations,[]);
      assert.ok(!modules.has('src/server/index.js'));
    }
    fs.writeFileSync(path.join(root,'node-launch-result.json'),JSON.stringify({passed:false,productionAuthority:false,mode,denial:error.code??null,
      native:addon.snapshot(),compositionEvidence,resourceElapsedMs:performance.now()-resourceStarted,loadRequests,replayDenials,listenerStopped:!(ownedServer?.listening),message:'Integrated fixture unavailable.'}),{flag:'wx'});
    if(!['wrong-owner','foreign-owner','bad-nonce','replay','wrong-pin','bind-queue-failure','composition-ws-failure','composition-bind-cancel','composition-endpoint-swap',...resourceModes].includes(mode)) process.exitCode=1;
  }
})().catch(error=>{ fs.writeFileSync(path.join(root,'node-launch-result.json'),JSON.stringify({passed:false,code:error.code??null,phase:diagnosticPhase,
  loaderDiagnostic:diagnosticPhase==='addon-load'?error.message:null,blockedOperations,message:'Fixture driver failed.'}),{flag:'wx'});process.exitCode=1; });
