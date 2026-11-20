// WF-005 revision 2: actual callbacks, denial paths only. No target modules run.
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), Module = require('node:module');
const cp = require('node:child_process'), net = require('node:net'), dgram = require('node:dgram');
const http = require('node:http'), https = require('node:https'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');

test('package callbacks can be captured without imports beyond inspected first-party declarations and built-ins', async t => {
  const reviewed = path.resolve(__dirname, '../../scripts/staged-backend-review.cjs');
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const beforeDigest = digest(reviewed), environment = { ...process.env };
  const beforeCache = Object.keys(require.cache).sort(), restore = [], attempts = [];
  let root, callbacks, captures = 0, notifications = 0, firstPartyImports = 0;
  const patch = (object, key, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { ...descriptor, value });
    restore.push(() => Object.defineProperty(object, key, descriptor));
  };
  const deny = () => { attempts.push('execution/network/real registration'); throw Error('Forbidden operation'); };
  // Existing WF-002 deny/instrument/restore pattern, installed BEFORE the sole first-party import.
  for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) patch(cp, key, deny);
  patch(net.Socket.prototype, 'connect', deny); patch(net.Server.prototype, 'listen', deny);
  patch(dgram, 'createSocket', deny); patch(process, 'dlopen', deny);
  if (typeof globalThis.fetch === 'function') patch(globalThis, 'fetch', deny);
  for (const object of [http, https]) for (const key of ['get', 'request']) patch(object, key, deny);
  for (const key of ['register', 'registerHooks']) patch(Module, key, deny);
  for (const key of ['Script', 'SourceTextModule', 'SyntheticModule', 'compileFunction', 'runInThisContext', 'runInNewContext', 'runInContext']) {
    if (typeof vm[key] === 'function') patch(vm, key, deny);
  }
  const originalLoad = Module._load, originalCompile = Module.prototype._compile;
  patch(Module, '_load', function(request, parent, ...args) {
    if (!Module.isBuiltin(request)) {
      if (request !== reviewed || parent !== module || firstPartyImports !== 0) {
        attempts.push(request); throw Error('Unapproved module import: ' + request);
      }
      firstPartyImports++;
    }
    return originalLoad.call(this, request, parent, ...args);
  });
  patch(Module.prototype, '_compile', function(content, filename) {
    if (filename !== reviewed) { attempts.push(filename); throw Error('Unapproved module evaluation'); }
    return originalCompile.call(this, content, filename);
  });
  try {
    assert.equal(require.cache[reviewed], undefined, 'reviewed script must not be preloaded');
    const { buildPackageAdmission, installPackageAdmissionHooks } = require(reviewed);
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-package-callback-')));
    const deniedFile = path.join(root, 'node_modules/inert/denied.cjs');
    fs.mkdirSync(path.dirname(deniedFile), { recursive: true });
    fs.writeFileSync(deniedFile, 'INERT DATA; NEVER EVALUATE');
    const url = pathToFileURL(deniedFile).href;
    const noRegistration = Module.registerHooks;
    const sentinel = Object.freeze({ capturedOnly: true });
    function capture(admission) {
      // No call/forwarding to the original API, no registration handle or deregistration.
      Module.registerHooks = value => { captures++; callbacks = value; return sentinel; };
      try { return installPackageAdmissionHooks(root, admission, () => { notifications++; }); }
      finally { Module.registerHooks = noRegistration; }
    }
    await t.test('captures actual callbacks from the empty copied-selection builder', () => {
      const admission = buildPackageAdmission({ candidates: [], unresolved: [] }, []);
      assert.equal(admission.productionAuthority, false);
      assert.equal(admission.completeClosure, false);
      assert.deepEqual(admission.admitted, []);
      assert.equal(capture(admission), sentinel);
      assert.equal(captures, 1);
      assert.deepEqual(Object.keys(callbacks).sort(), ['load', 'resolve']);
      assert.equal(typeof callbacks.load, 'function'); assert.equal(typeof callbacks.resolve, 'function');
      assert.equal(Module.registerHooks, noRegistration);
    });
    await t.test('denied load never reaches nextLoad or onLoad', () => {
      let delegated = 0;
      assert.throws(() => callbacks.load(url, {}, () => { delegated++; throw Error('nextLoad reached'); }),
        error => error.code === 'PACKAGE_FILE_DENIED');
      assert.equal(delegated, 0); assert.equal(notifications, 0);
    });
    await t.test('resolve calls only inert nextResolve then rejects its unadmitted URL', () => {
      let delegated = 0;
      const context = {};
      assert.throws(() => callbacks.resolve('inert-request', context, (specifier, received) => {
        delegated++; assert.equal(specifier, 'inert-request'); assert.equal(received, context);
        return { url }; // No Node resolution, loading, read or evaluation.
      }), error => error.code === 'PACKAGE_FILE_DENIED');
      assert.equal(delegated, 1); assert.equal(notifications, 0);
    });
    await t.test('synthetic generated-report-shaped inputs reject before capture', () => {
      // Deliberately inert negative inputs, NOT genuine generated-selection receipts.
      for (const basis of ['synthetic-generated-artifact-evidence-only', 'fixture-generated-artifact-evidence-only']) {
        const report = { basis, informationalOnly: true, productionAuthority: false, completeClosure: false,
          executionAuthority: false, atomicMeasuredHandleBinding: false,
          admitted: [{ path: 'node_modules/inert/denied.cjs', status: 'generated-artifact' }] };
        assert.throws(() => capture(report), /Missing package admission evidence/);
        assert.equal(captures, 1); assert.equal(Module.registerHooks, noRegistration);
      }
    });
    await t.test('missing admission and unauthorized authority reject before capture', () => {
      const empty = buildPackageAdmission({ candidates: [], unresolved: [] }, []);
      for (const report of [undefined, {}, { ...empty, productionAuthority: true }]) {
        assert.throws(() => capture(report), /Missing package admission evidence/);
        assert.equal(captures, 1); assert.equal(Module.registerHooks, noRegistration);
      }
    });
    await t.test('unowned generated manifests deny without entering the generated validator', () => {
      assert.throws(() => buildPackageAdmission({ candidates: [], unresolved: [], generatedArtifact: {} }, []),
        error => error.code === 'GENERATED_ARTIFACT_DENIED');
      assert.equal(captures, 1); assert.equal(firstPartyImports, 1); assert.deepEqual(attempts, []);
    });
    assert.equal(digest(reviewed), beforeDigest);
    assert.deepEqual(Object.keys(require.cache).sort(), [...beforeCache, reviewed].sort());
    assert.deepEqual({ ...process.env }, environment);
    assert.deepEqual(attempts, []); assert.equal(notifications, 0);
  } finally {
    for (const undo of restore.reverse()) undo();
    if (!beforeCache.includes(reviewed)) delete require.cache[reviewed];
    if (root) {
      const absolute = path.resolve(root), temporary = fs.realpathSync(os.tmpdir());
      const relative = path.relative(temporary, absolute);
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      assert.ok(path.basename(absolute).startsWith('discovery-package-callback-'));
      fs.rmSync(absolute, { recursive: true, force: false });
      assert.equal(fs.existsSync(absolute), false);
    }
  }
  assert.deepEqual(Object.keys(require.cache).sort(), beforeCache);
  assert.deepEqual({ ...process.env }, environment);
  assert.equal(digest(reviewed), beforeDigest);
});
