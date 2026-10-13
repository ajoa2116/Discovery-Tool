const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const { createSelectedPathCapture } = require('../../scripts/staged-backend-review.cjs');

const evidenceRoot = fs.mkdtempSync(path.join(tmpdir(), 'discovery-retained-files-'));
const results = [];
// Instrument only synchronous operations within this test; always restore fs and
// release any leaked descriptor after recording a failing assertion.
function instrumentDescriptors(run) {
  const names = ['openSync','closeSync','fstatSync','readSync','lstatSync'];
  const original = Object.fromEntries(names.map(name => [name, fs[name]]));
  const live = new Set(), acquired = [], counts = {}, faults = [];
  let injected = 0, confirmedClosed = 0;
  const arm = (...next) => { faults.splice(0, faults.length, ...next.map(f => ({ ...f, fired: false }))); for (const n of names) counts[n] = 0; };
  for (const name of names) fs[name] = (...args) => {
    counts[name] = (counts[name] ?? 0) + 1;
    const fault = faults.find(f => f.method === name && (!f.fired || f.always) && (f.always || counts[name] === (f.nth ?? 1)));
    const fail = () => { fault.fired = true; injected++; throw Object.assign(Error('Controlled fixture I/O failure.'), { code: 'EIO' }); };
    if (fault && fault.placement !== 'after') fail();
    const value = original[name](...args);
    if (name === 'openSync') { live.add(value); acquired.push(value); }
    if (name === 'closeSync') {
      live.delete(args[0]);
      assert.throws(() => original.fstatSync(args[0]), { code: 'EBADF' }); confirmedClosed++;
    }
    if (fault) fail();
    return value;
  };
  try { return run({ live, acquired, arm, injected: () => injected, confirmedClosed: () => confirmedClosed, original }); }
  finally {
    for (const name of names) fs[name] = original[name];
    for (const fd of live) { try { original.closeSync(fd); } catch {} }
  }
}
// Exact existing helper/asset selection shape; only synthetic bytes are created.
function fixture(name, helper = false) {
  const base = path.join(evidenceRoot, name), root = path.join(base, 'stage');
  const expected = helper ? 'scripts/observe-windows-receive.ps1' : 'dist/fixture asset #.html';
  const source = helper ? 'src/core/readiness/windows_receive_observation.ts' : 'src/server/production_assets.ts';
  const specifier = helper ? '../../../scripts/observe-windows-receive.ps1' : '../../dist/';
  const file = path.join(root, expected);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'AAAA');
  // Exact integer timestamp makes a restored-metadata byte substitution test reliable.
  fs.utimesSync(file, new Date(1700000000000), new Date(1700000000000));
  const manifest = { candidates: [{ source: expected, output: expected, status: 'copied-candidate',
    selectionReasons: [(helper ? 'observed-module-url:' : 'observed-module-url-directory:') + source] }], unresolved: [] };
  const inventory = { references: [{ source, specifier, kind: 'module-url', ...(helper ? { resolvedPath: expected } : {}) }] };
  const capture = createSelectedPathCapture(root, manifest, inventory);
  return { base, root, expected, source, specifier, file, manifest, inventory, capture,
    retain: () => capture.retain(file, expected, source, specifier) };
}
function record(name, f, evidence, outcome) {
  results.push({ name, validation: evidence, outcome, checks: f.capture.retentionChecks,
    helpersExecuted: 0, providerExecuted: false, productionAuthority: false, raceFree: false });
}
after(() => {
  fs.writeFileSync(path.join(evidenceRoot, 'retention-results.json'), JSON.stringify({
    informationalOnly: true, productionAuthority: false, raceFree: false, results,
    limitations: ['Standard Node handles are not demonstrated deny-write/delete locks.',
      'Checks are sequential observations; concurrent races, mapped-code integrity and production execution remain unproved.'] }, null, 2));
  console.log('Retained-file evidence: ' + path.join(evidenceRoot, 'retention-results.json'));
});

test('retained files: unchanged helpers/assets pass inert use and terminal evidence cannot replay', () => {
  for (const helper of [false, true]) {
    const f = fixture(helper ? 'positive-helper' : 'positive-asset', helper);
    try {
      const evidence = f.retain();
      assert.match(evidence.digest, /^[a-f0-9]{64}$/); assert.equal(evidence.handleRetained, true);
      const result = f.capture.simulateUse(evidence, helper ? f.file : pathToFileURL(f.file));
      assert.equal(result.status, 'verified-inert-use'); assert.equal(result.executed, false); assert.equal(result.handleClosed, true);
      assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'foreign-or-terminal-evidence' });
      assert.throws(() => f.capture.simulateUse({ ...evidence }, f.file), { code: 'RETAINED_FILE_DENIED' });
      record(helper ? 'unchanged-helper' : 'unchanged-encoded-url-asset', f, evidence, result);
    } finally { f.capture.dispose(); }
  }
});

test('retained files: mutation with restored identity metadata is rejected by digest', () => {
  const f = fixture('same-size-bytes', true);
  try {
    const evidence = f.retain(); fs.writeFileSync(f.file, 'BBBB');
    fs.utimesSync(f.file, new Date(1700000000000), new Date(evidence.identity.modified));
    const stat = fs.statSync(f.file);
    assert.equal(stat.size, evidence.identity.bytes); assert.equal(stat.ino, evidence.identity.file);
    assert.equal(stat.mtimeMs, evidence.identity.modified);
    assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'changed-bytes' });
    // Restoring bytes after terminal denial cannot revive the retained evidence.
    fs.writeFileSync(f.file, 'AAAA');
    assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'foreign-or-terminal-evidence' });
    record('same-size-restored-metadata-mutation', f, evidence, 'denied-by-digest');
  } finally { f.capture.dispose(); }
});

test('retained files: replacement, deletion, ambiguous selection and wrong/outside paths deny inert use', () => {
  for (const name of ['replacement-same-size', 'replacement-identical-bytes', 'deletion', 'ambiguous', 'unselected', 'wrong-path', 'outside']) {
    const f = fixture(name);
    try {
      const evidence = f.retain(); let input = f.file;
      if (name.startsWith('replacement')) {
        // All move targets are resolved descendants of the explicitly named private case directory.
        const saved = path.join(f.base, 'retained-original.html');
        assert.ok(!path.relative(f.base, saved).startsWith('..'));
        fs.renameSync(f.file, saved);
        fs.writeFileSync(f.file, name === 'replacement-same-size' ? 'BBBB' : 'AAAA');
        fs.utimesSync(f.file, new Date(1700000000000), new Date(evidence.identity.modified));
      } else if (name === 'deletion') fs.unlinkSync(f.file);
      else if (name === 'ambiguous') f.manifest.candidates.push({ ...f.manifest.candidates[0] });
      else if (name === 'unselected') f.manifest.candidates[0].status = 'unselected-unresolved';
      else input = name === 'outside' ? path.join(f.base, 'outside.html') : path.join(f.root, 'dist', 'wrong.html');
      assert.throws(() => f.capture.simulateUse(evidence, input), { code: 'RETAINED_FILE_DENIED' });
      assert.equal(f.capture.retentionChecks[0].status, 'denied'); assert.equal(f.capture.retentionChecks[0].executed, false);
      record(name, f, evidence, 'denied-before-inert-use');
    } finally { f.capture.dispose(); }
  }
});

test('retained files: mutation changing length/metadata denies before inert use', () => {
  const f = fixture('longer-mutation');
  try {
    const evidence = f.retain(); fs.writeFileSync(f.file, 'LONGER');
    assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED' });
    record('length-changing-mutation', f, evidence, 'denied-before-inert-use');
  } finally { f.capture.dispose(); }
});

test('retained files: supported directory junction/symlink redirection rejects an out-of-stage target', t => {
  const f = fixture('directory-redirection');
  try {
    const evidence = f.retain(), directory = path.dirname(f.file), saved = path.join(f.base, 'saved-dist');
    const redirected = path.join(f.base, 'outside-dist');
    for (const target of [directory, saved, redirected]) assert.ok(!path.relative(f.base, target).startsWith('..'));
    fs.mkdirSync(redirected); fs.writeFileSync(path.join(redirected, path.basename(f.file)), 'AAAA');
    let directoryRenameBlocked = false;
    try { fs.renameSync(directory, saved); }
    catch (error) {
      if (!['EPERM','EACCES'].includes(error.code)) throw error;
      directoryRenameBlocked = true;
      // On this Windows host a retained child handle can block directory rename,
      // although ordinary file replacement/deletion still works. Move the file
      // to a checked private sibling and remove only the now-empty directory.
      fs.mkdirSync(saved);
      fs.renameSync(f.file, path.join(saved, path.basename(f.file)));
      fs.rmdirSync(directory);
    }
    try { fs.symlinkSync(redirected, directory, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (!['EPERM','EACCES','ENOTSUP'].includes(error.code)) throw error;
      record('directory-redirection', f, evidence, 'unsupported-platform-permission:' + error.code);
      t.skip('Directory-link creation unavailable: ' + error.code); return;
    }
    assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'mapping-rejected' });
    record('directory-junction-or-symlink-redirection', f, evidence, { status: 'denied-before-inert-use', directoryRenameBlocked });
  } finally { f.capture.dispose(); }
});

test('retained files: disposal closes retained evidence and denies subsequent use', () => {
  const f = fixture('disposed'); const evidence = f.retain(); f.capture.dispose();
  assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'foreign-or-terminal-evidence' });
  record('disposed', f, evidence, 'terminal');
});

test('retained cleanup: transient close failure cannot strand descriptors or stop multi-file disposal', () => {
  const f = fixture('cleanup-close-error');
  instrumentDescriptors(tracker => {
    const first = f.retain(), second = f.retain();
    tracker.arm({ method: 'closeSync' });
    assert.throws(() => f.capture.dispose());
    assert.equal(tracker.injected(), 1);
    assert.equal(tracker.live.size, 0, 'Every acquired descriptor must close despite the first cleanup error.');
    assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
    for (const evidence of [first, second]) assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED' });
    results.push({ name: 'cleanup-transient-disposal', acquired: tracker.acquired.length, confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
  });
});

test('retained cleanup: partial validation faults publish no evidence and close acquired descriptors', () => {
  for (const [phase, method, nth] of [['opening','openSync',1], ['identity','fstatSync',1], ['digest-read','readSync',1],
    ['post-digest-identity','fstatSync',2], ['final-mapping','lstatSync',2]]) {
    const f = fixture('cleanup-validation-' + phase);
    instrumentDescriptors(tracker => {
      tracker.arm({ method, nth });
      let evidence;
      assert.throws(() => { evidence = f.retain(); }, { code: 'RETAINED_FILE_DENIED' });
      assert.equal(evidence, undefined); assert.equal(tracker.injected(), 1);
      assert.equal(tracker.live.size, 0); assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
      assert.equal(f.capture.cleanupState().pendingDescriptors, 0);
      assert.throws(() => f.capture.simulateUse({}, f.file), { code: 'RETAINED_FILE_DENIED' });
      tracker.arm(); f.capture.dispose();
      results.push({ name: 'partial-validation-' + phase, acquired: tracker.acquired.length, confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
    });
  }
});

test('retained cleanup: use faults invalidate evidence and close primary and secondary descriptors', () => {
  for (const [phase, method, nth] of [['primary-identity','fstatSync',1], ['secondary-opening','openSync',1],
    ['secondary-identity','fstatSync',2], ['secondary-read','readSync',1], ['retained-read','readSync',2],
    ['final-handle-verification','fstatSync',4], ['final-path-verification','lstatSync',2]]) {
    const f = fixture('cleanup-use-' + phase);
    instrumentDescriptors(tracker => {
      const evidence = f.retain(); tracker.arm({ method, nth });
      assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED' });
      assert.equal(tracker.injected(), 1); assert.equal(tracker.live.size, 0);
      assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
      tracker.arm();
      assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'foreign-or-terminal-evidence' });
      f.capture.dispose();
      results.push({ name: 'use-fault-' + phase, acquired: tracker.acquired.length, confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
    });
  }
});

test('retained cleanup: close errors before or after actual close deny use without masking operation failure', () => {
  for (const placement of ['before','after']) {
    const f = fixture('cleanup-close-' + placement);
    instrumentDescriptors(tracker => {
      const evidence = f.retain(); tracker.arm({ method: 'closeSync', placement });
      assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'cleanup-error' });
      assert.equal(tracker.injected(), 1); assert.equal(tracker.live.size, 0);
      assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
      tracker.arm(); assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED' });
      f.capture.dispose();
      results.push({ name: 'close-error-' + placement, acquired: tracker.acquired.length, confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
    });
  }
  const f = fixture('cleanup-primary-error');
  instrumentDescriptors(tracker => {
    tracker.arm({ method: 'readSync' }, { method: 'closeSync' });
    assert.throws(() => f.retain(), error => error.reason === 'validation-io' && error.cleanupErrors.includes('EIO'));
    assert.equal(tracker.injected(), 2); assert.equal(tracker.live.size, 0);
    tracker.arm(); f.capture.dispose();
    results.push({ name: 'primary-error-preserved-with-cleanup-error', confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
  });
});

test('retained cleanup: persistent close rejection stays tracked and terminal until later disposal releases it', () => {
  const f = fixture('cleanup-persistent');
  instrumentDescriptors(tracker => {
    const evidence = f.retain(); tracker.arm({ method: 'closeSync', always: true });
    assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED' });
    assert.equal(f.capture.cleanupState().pendingDescriptors, 2); assert.equal(tracker.live.size, 2);
    assert.equal(f.capture.retentionChecks.at(-1).handleClosed, false);
    assert.throws(() => f.retain(), { code: 'RETAINED_FILE_DENIED', reason: 'pending-cleanup' });
    assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED', reason: 'foreign-or-terminal-evidence' });
    const pending = f.capture.cleanupState(); tracker.arm(); f.capture.dispose();
    assert.equal(tracker.live.size, 0); assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
    assert.equal(f.capture.cleanupState().pendingDescriptors, 0);
    assert.throws(() => f.retain(), { code: 'RETAINED_FILE_DENIED', reason: 'disposed-capture' });
    results.push({ name: 'persistent-close-recovery', pending, confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
  });
});

test('retained cleanup: uncertain close state does not abandon a resource or prevent disposal of others', () => {
  const f = fixture('cleanup-uncertain');
  instrumentDescriptors(tracker => {
    const first = f.retain(), second = f.retain();
    tracker.arm({ method: 'closeSync' }, { method: 'fstatSync' });
    assert.throws(() => f.capture.dispose(), { code: 'RETAINED_FILE_DENIED', reason: 'cleanup-error' });
    assert.equal(tracker.live.size, 1); assert.equal(f.capture.cleanupState().pendingDescriptors, 1);
    for (const e of [first, second]) assert.throws(() => f.capture.simulateUse(e, f.file), { code: 'RETAINED_FILE_DENIED' });
    tracker.arm(); f.capture.dispose(); f.capture.dispose();
    assert.equal(tracker.live.size, 0); assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
    results.push({ name: 'uncertain-close-recovery', confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
  });
});

test('retained cleanup: failed partial validation remains tracked when close persistently fails', () => {
  const f = fixture('cleanup-partial-persistent');
  instrumentDescriptors(tracker => {
    tracker.arm({ method: 'readSync' }, { method: 'closeSync', always: true });
    let evidence;
    assert.throws(() => { evidence = f.retain(); }, error => error.reason === 'validation-io' && error.cleanupErrors.includes('EIO'));
    assert.equal(evidence, undefined); assert.equal(tracker.live.size, 1);
    assert.equal(f.capture.cleanupState().pendingDescriptors, 1);
    assert.equal(f.capture.retentionChecks.at(-1).handleClosed, false);
    assert.throws(() => f.retain(), { code: 'RETAINED_FILE_DENIED', reason: 'pending-cleanup' });
    const pending = f.capture.cleanupState(); tracker.arm(); f.capture.dispose();
    assert.equal(tracker.live.size, 0); assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
    assert.equal(f.capture.cleanupState().pendingDescriptors, 0);
    results.push({ name: 'partial-validation-persistent-close-recovery', pending, confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
  });
});

test('retained cleanup: repeated validation failures do not accumulate descriptors or locks', () => {
  const f = fixture('cleanup-repeated');
  instrumentDescriptors(tracker => {
    for (let attempt = 0; attempt < 16; attempt++) {
      tracker.arm({ method: 'readSync' }, { method: 'closeSync' });
      assert.throws(() => f.retain(), { code: 'RETAINED_FILE_DENIED' });
      assert.equal(tracker.live.size, 0); assert.equal(f.capture.cleanupState().pendingDescriptors, 0);
      const parked = path.join(f.base, 'parked.html');
      assert.ok(!path.relative(f.base, parked).startsWith('..'));
      fs.renameSync(f.file, parked); fs.renameSync(parked, f.file);
    }
    tracker.arm(); const evidence = f.retain(); f.capture.dispose();
    assert.equal(tracker.live.size, 0); assert.equal(tracker.confirmedClosed(), tracker.acquired.length);
    assert.throws(() => f.capture.simulateUse(evidence, f.file), { code: 'RETAINED_FILE_DENIED' });
    fs.unlinkSync(f.file);
    results.push({ name: '16-repeated-failures-and-successful-disposal', acquired: tracker.acquired.length, confirmedClosed: tracker.confirmedClosed(), cleanup: f.capture.cleanupState() });
  });
});
