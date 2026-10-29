const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const names = ['a.cctvproj', 'b.cctvproj'];
const specs = names.map((name, i) => ({ name, projectName: `Synthetic process ${i ? 'B' : 'A'}`,
  mac: `00:11:22:33:44:${i ? '62' : '60'}`, uuid: `00000000-0000-4000-8000-00000000000${i + 1}`,
  before: `192.0.2.${i ? 30 : 10}`, after: `192.0.2.${i ? 40 : 20}`,
  metadata: { name: `  Camera ${i ? 'B' : 'A'}  `, location: `  Door ${i ? 'B' : 'A'}  `, notes: `  Notes ${i ? 'B' : 'A'}  ` } }));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function identity(directory) {
  const stat = fs.lstatSync(directory, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  return { dev: String(stat.dev), ino: String(stat.ino), birth: String(stat.birthtimeNs) };
}
function noRedirect(target) {
  for (let current = path.resolve(target);; current = path.dirname(current)) {
    assert.equal(fs.lstatSync(current).isSymbolicLink(), false, 'No symlink/junction');
    assert.equal(fs.realpathSync(current), current, 'Canonical path required');
    if (path.dirname(current) === current) break;
  }
}
function ownRoot(owner) {
  assert.equal(path.dirname(owner.root), owner.parent);
  assert.match(path.basename(owner.root), /^discovery-project-process-[A-Za-z0-9]+$/);
  noRedirect(owner.root); assert.deepEqual(identity(owner.root), owner.identity);
}
function file(owner, name, exists = true) {
  ownRoot(owner); assert.ok(names.includes(name));
  const target = path.resolve(owner.root, name); assert.equal(path.dirname(target), owner.root);
  if (exists) {
    noRedirect(target); const stat = fs.lstatSync(target);
    assert.ok(stat.isFile()); assert.equal(stat.nlink, 1);
  } else assert.equal(fs.existsSync(target), false);
  return target;
}
function entries(owner, expected) {
  ownRoot(owner); assert.deepEqual(fs.readdirSync(owner.root).sort(), [...expected].sort());
  for (const name of expected) file(owner, name);
}
function noSecrets(raw) {
  const parsed = JSON.parse(raw);
  function scan(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!/(password|passwd|credential|authorization|cookie|token|secret|api.?key|metadataWriteContext|generation)/i.test(key), 'No credential/runtime key');
      scan(child);
    }
  }
  scan(parsed);
  assert.ok(!/(?:Bearer |session_|bootstrap_)/.test(raw));
  for (const device of parsed.project.devices) {
    assert.equal(device.evidenceProvenance, 'SYNTHETIC_TEST');
    assert.equal(device.sessionVerification, undefined);
    for (const key of ['reachability', 'diagnostics', 'telemetry']) assert.ok(device[key] === undefined || Object.keys(device[key]).length === 0);
  }
  return parsed;
}
function guards(owner, role) {
  const violations = [];
  const deny = name => { violations.push(name); throw Error('Forbidden process fixture operation: ' + name); };
  const net = require('node:net'), dgram = require('node:dgram'), child = require('node:child_process');
  net.Socket.prototype.connect = () => deny('Socket.connect');
  net.Server.prototype.listen = () => deny('Server.listen');
  dgram.createSocket = () => deny('dgram.createSocket');
  require('node:dns').lookup = () => deny('dns.lookup');
  globalThis.fetch = () => deny('fetch');
  for (const method of ['spawn', 'spawnSync', 'fork', 'exec', 'execSync', 'execFile', 'execFileSync']) child[method] = () => deny('child_process.' + method);
  // Storage uses promises. Guard its writes and deny alternate mutation surfaces.
  const original = Object.fromEntries(['mkdir', 'writeFile', 'rename', 'rm'].map(name => [name, fs.promises[name].bind(fs.promises)]));
  const created = new Map();
  const temporary = target => /^(a|b)\.cctvproj\.[0-9a-f-]{36}\.tmp$/.test(path.basename(target));
  const writePath = target => {
    ownRoot(owner); assert.equal(role, 'writer'); assert.equal(typeof target, 'string');
    assert.equal(path.dirname(path.resolve(target)), owner.root);
    assert.ok(names.includes(path.basename(target)) || temporary(target));
    if (fs.existsSync(target)) { noRedirect(target); assert.equal(fs.lstatSync(target).nlink, 1); }
  };
  fs.promises.mkdir = async (target, options) => { ownRoot(owner); assert.equal(role, 'writer'); assert.equal(target, owner.root); return original.mkdir(target, options); };
  const fileIdentity = target => { const stat = fs.lstatSync(target, { bigint: true }); return [String(stat.dev), String(stat.ino), String(stat.birthtimeNs)]; };
  fs.promises.writeFile = async (target, data, options) => {
    writePath(target); assert.ok(temporary(target)); assert.equal(options.flag, 'wx'); assert.equal(fs.existsSync(target), false);
    await original.writeFile(target, data, options); created.set(target, fileIdentity(target));
  };
  fs.promises.rename = async (from, to) => {
    writePath(from); writePath(to); assert.ok(temporary(from)); assert.ok(names.includes(path.basename(to)));
    assert.deepEqual(fileIdentity(from), created.get(from)); await original.rename(from, to); created.delete(from);
  };
  fs.promises.rm = async target => {
    writePath(target); assert.ok(temporary(target)); assert.deepEqual(fileIdentity(target), created.get(target));
    await original.rm(target); created.delete(target);
  };
  for (const method of ['appendFile', 'copyFile', 'cp', 'link', 'symlink', 'truncate', 'unlink', 'rmdir', 'mkdtemp', 'open', 'chmod', 'chown', 'utimes', 'writeFile', 'rename', 'mkdir', 'rm']) {
    if (!Object.hasOwn(original, method)) fs.promises[method] = () => deny('fs.promises.' + method);
    for (const suffix of ['', 'Sync']) if (typeof fs[method + suffix] === 'function') fs[method + suffix] = () => deny('fs.' + method + suffix);
  }
  require('node:module').syncBuiltinESMExports();
  return violations;
}
// Pure observation logic: no process queries, launches, filesystem access or cleanup.
function observationSnapshot(value) {
  const record = item => {
    if (!item || typeof item !== 'object') return null;
    const text = (input, limit) => typeof input === 'string' && input.length <= limit ? input : null;
    const command = text(item.commandLine, 1024);
    const redacted = Boolean(command && /Bearer\s|session_|bootstrap_|--?(?:password|passwd|secret|credential|token)\b|(?:password|passwd|secret|credential|token)\s*[=:]|https?:\/\/[^\s]*[?@]/i.test(command));
    return { pid: item.pid, parentPid: item.parentPid, creationMs: item.creationMs,
      creationUtc: text(item.creationUtc, 64), executable: text(item.executable, 512),
      commandLine: redacted ? '[REDACTED]' : command, unavailable: item.unavailable === true || redacted };
  };
  return { observedAtMs: value?.observedAtMs, rootReparsePoints: value?.rootReparsePoints,
    rootError: value?.rootError === true, observationError: value?.observationError === true,
    parent: record(value?.parent), workerBefore: record(value?.workerBefore), workerAfter: record(value?.workerAfter),
    children: Array.isArray(value?.children) ? value.children.slice(0, 2).map(item => ({ before: record(item?.before), after: record(item?.after) })) : null,
    childrenTruncated: value?.childrenTruncated === true || (Array.isArray(value?.children) && value.children.length > 2) };
}
function classifyObservation(input, expected) {
  const value = observationSnapshot(input);
  const unknown = reason => ({ status: 'UNKNOWN', reason });
  const normalPath = text => text.replaceAll('/', '\\').toLowerCase();
  const complete = record => record && record.unavailable === false && Number.isInteger(record.pid) && record.pid > 0
    && Number.isInteger(record.parentPid) && record.parentPid >= 0 && Number.isSafeInteger(record.creationMs)
    && record.creationMs > 0 && record.creationMs <= value.observedAtMs && typeof record.creationUtc === 'string'
    && Date.parse(record.creationUtc) === record.creationMs && typeof record.executable === 'string' && record.executable.length > 0
    && typeof record.commandLine === 'string' && record.commandLine.trim().length > 0;
  const same = (left, right) => complete(left) && complete(right) && left.pid === right.pid && left.parentPid === right.parentPid
    && left.creationMs === right.creationMs && left.creationUtc === right.creationUtc
    && normalPath(left.executable) === normalPath(right.executable) && left.commandLine === right.commandLine;
  if (!expected || typeof expected.executable !== 'string' || !Number.isInteger(expected.parentPid)
      || !Number.isSafeInteger(value.observedAtMs) || value.rootError || value.observationError || value.rootReparsePoints !== 0) return unknown('OBSERVATION_INCOMPLETE');
  if (!complete(value.parent) || value.parent.pid !== expected.parentPid || normalPath(value.parent.executable) !== normalPath(expected.executable)) return unknown('PARENT_IDENTITY');
  if (expected.parentIdentity && !same(value.parent, expected.parentIdentity)) return unknown('PARENT_CHANGED');
  if (expected.pid === undefined) return { status: 'ALLOW', reason: 'PARENT_BASELINE_ONLY' };
  const before = value.workerBefore, after = value.workerAfter;
  if (!same(before, after) || before.pid !== expected.pid || before.parentPid !== value.parent.pid
      || before.creationMs < value.parent.creationMs || normalPath(before.executable) !== normalPath(expected.executable)) return unknown('WORKER_IDENTITY');
  const launch = expected.launch;
  if (!launch || !Number.isSafeInteger(launch.requestedAtMs) || !Number.isSafeInteger(launch.spawnedAtMs)
      || launch.spawnedAtMs < launch.requestedAtMs || before.creationMs < launch.requestedAtMs || before.creationMs > launch.spawnedAtMs) return unknown('WORKER_LAUNCH_TIME');
  // Only the fixed three-argument launch is supported; ambiguous quoting denies.
  const pieces = [...before.commandLine.matchAll(/"[^"\r\n]*"|[^\s"]+/g)];
  let end = 0;
  for (const piece of pieces) {
    if (before.commandLine.slice(end, piece.index).trim()) return unknown('WORKER_COMMAND');
    end = piece.index + piece[0].length;
  }
  const args = pieces.map(piece => piece[0].startsWith('"') ? piece[0].slice(1, -1) : piece[0]);
  if (before.commandLine.slice(end).trim() || typeof expected.workerPath !== 'string' || args.length !== 3 || normalPath(args[0]) !== normalPath(expected.executable)
      || normalPath(args[1]) !== normalPath(expected.workerPath) || args[2] !== expected.role) return unknown('WORKER_COMMAND');
  if (expected.workerIdentity && !same(before, expected.workerIdentity)) return unknown('WORKER_CHANGED');
  if (!Array.isArray(value.children) || value.childrenTruncated) return unknown('CHILD_OBSERVATION_INCOMPLETE');
  const seen = new Set();
  for (const child of value.children) {
    if (!same(child.before, child.after) || child.before.parentPid !== before.pid || child.before.creationMs < before.creationMs
        || child.before.pid === before.pid || seen.has(child.before.pid)) return unknown('CHILD_ANCESTRY_AMBIGUOUS');
    seen.add(child.before.pid);
  }
  return value.children.length ? { status: 'DENY', reason: 'UNEXPECTED_CHILD' } : { status: 'ALLOW', reason: 'NO_OBSERVED_CHILDREN' };
}
// Pure lifecycle gate. Failure is irreversible; closing a handle is not containment proof.
function createLifecycle() {
  const controller = new AbortController(), pending = new Set(), idle = new Set();
  let failure;
  const check = () => { if (failure) throw failure; };
  const fail = error => {
    if (!failure) { failure = error; controller.abort(error); }
    return failure;
  };
  return {
    get failed() { return Boolean(failure); }, signal: controller.signal, check, fail,
    begin(kind) {
      check(); const token = { kind }; pending.add(token);
      return () => {
        pending.delete(token); // Settlement bookkeeping remains allowed after failure.
        if (!pending.size) { for (const resolve of idle) resolve(); idle.clear(); }
      };
    },
    async wait(promise) {
      check(); let onAbort;
      try {
        const value = await Promise.race([promise, new Promise((_, reject) => {
          onAbort = () => reject(failure); controller.signal.addEventListener('abort', onAbort, { once: true });
        })]);
        check(); return value;
      } finally { controller.signal.removeEventListener('abort', onAbort); }
    },
    async drain(milliseconds) {
      if (!pending.size) return true;
      let timer, resolveIdle;
      try {
        return await Promise.race([new Promise(resolve => { resolveIdle = () => resolve(true); idle.add(resolveIdle); }),
          new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })]);
      } finally { clearTimeout(timer); idle.delete(resolveIdle); }
    },
    snapshot() { return { failed: Boolean(failure), pending: [...pending].map(token => token.kind) }; },
    cleanupAllowed(records) {
      return !failure && pending.size === 0 && records.length === 2 && records.every(record =>
        record.workflowSettled === true && record.success === true && record.containment === 'VERIFIED_FIXTURE' && record.identity
        && record.initialObservation?.status === 'ALLOW' && record.initialObservation.reason === 'NO_OBSERVED_CHILDREN'
        && record.finalObservation?.status === 'ALLOW' && record.finalObservation.reason === 'NO_OBSERVED_CHILDREN'
        && record.exitObserved === true && record.closed === true && record.exitCode === 0 && record.signal === null);
    },
  };
}
module.exports = { names, specs, hash, identity, noRedirect, ownRoot, file, entries, noSecrets, guards, observationSnapshot, classifyObservation, createLifecycle };

// Explicit pure self-test entry point: no workers, observers, storage imports or writes.
async function lifecycleSelfTest() {
  let passed = 0;
  const test = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
  const verified = () => ({ workflowSettled: true, success: true, containment: 'VERIFIED_FIXTURE', identity: { synthetic: true },
    initialObservation: { status: 'ALLOW', reason: 'NO_OBSERVED_CHILDREN' },
    finalObservation: { status: 'ALLOW', reason: 'NO_OBSERVED_CHILDREN' },
    exitObserved: true, closed: true, exitCode: 0, signal: null });
  const records = () => [verified(), verified()];
  await test('UNKNOWN by default', () => assert.equal(createLifecycle().cleanupAllowed([]), false));
  await test('worker close without descendant proof', () => {
    const rows = records(); delete rows[0].initialObservation; delete rows[0].finalObservation;
    assert.equal(createLifecycle().cleanupAllowed(rows), false);
  });
  await test('verified-safe fixture cleanup', () => assert.equal(createLifecycle().cleanupAllowed(records()), true));
  await test('missing exit evidence', () => {
    const rows = records(); rows[0].exitObserved = false; assert.equal(createLifecycle().cleanupAllowed(rows), false);
  });
  await test('missing close evidence', () => {
    const rows = records(); rows[0].closed = false; assert.equal(createLifecycle().cleanupAllowed(rows), false);
  });
  await test('pending observer blocks cleanup', () => {
    const gate = createLifecycle(), finish = gate.begin('observer');
    assert.equal(gate.cleanupAllowed(records()), false); finish(); assert.equal(gate.cleanupAllowed(records()), true);
  });
  await test('pending workflow blocks cleanup', () => {
    const gate = createLifecycle(), finish = gate.begin('workflow');
    assert.equal(gate.cleanupAllowed(records()), false); finish(); assert.equal(gate.cleanupAllowed(records()), true);
  });
  await test('timeout with pending observer cancels progress, retains activity', async () => {
    const gate = createLifecycle(), finish = gate.begin('observer'); let cancel = 0, resolve;
    gate.signal.addEventListener('abort', () => cancel++);
    const waiting = gate.wait(new Promise(done => { resolve = done; }));
    const rejected = assert.rejects(waiting, /timeout/); gate.fail(Error('timeout')); await rejected;
    assert.equal(cancel, 1); assert.deepEqual(gate.snapshot().pending, ['observer']);
    assert.equal(await gate.drain(1), false); assert.equal(gate.cleanupAllowed(records()), false);
    resolve('late'); finish(); assert.equal(await gate.drain(1), true);
    assert.equal(gate.cleanupAllowed(records()), false);
  });
  await test('malformed READY permanently preserves root', () => {
    const gate = createLifecycle();
    try { assert.deepEqual({ type: 'WRONG' }, { type: 'READY' }); } catch (error) { gate.fail(error); }
    assert.equal(gate.cleanupAllowed(records()), false); assert.throws(() => gate.check());
  });
  await test('early stderr permanently preserves root', () => {
    const gate = createLifecycle(); gate.fail(Error('Worker reported failure'));
    assert.equal(gate.cleanupAllowed(records()), false);
  });
  await test('late callback cannot authorize GO or mutate progress', async () => {
    const gate = createLifecycle(); let resolve, progress = 0;
    const workflow = gate.wait(new Promise(done => { resolve = done; })).then(() => { gate.check(); progress++; }, () => {});
    gate.fail(Error('failure')); resolve('late ALLOW'); await workflow;
    assert.equal(progress, 0); assert.equal(gate.cleanupAllowed(records()), false);
  });
  await test('failure prevents reader startup and new observation', () => {
    const gate = createLifecycle(); gate.fail(Error('writer failure'));
    assert.throws(() => gate.check(), /writer failure/); assert.throws(() => gate.begin('observer'), /writer failure/);
  });
  await test('observer failure remains terminal after settlement', () => {
    const gate = createLifecycle(), finish = gate.begin('observer'); gate.fail(Error('Observer failure')); finish();
    assert.equal(gate.cleanupAllowed(records()), false);
  });
  await test('UNKNOWN and DENY never authorize cleanup', () => {
    for (const status of ['UNKNOWN', 'DENY']) {
      const rows = records(); rows[0].finalObservation.status = status;
      assert.equal(createLifecycle().cleanupAllowed(rows), false);
    }
  });
  await test('first failure survives late errors', () => {
    const gate = createLifecycle(), first = Error('first'); gate.fail(first); gate.fail(Error('late'));
    assert.throws(() => gate.check(), error => error === first);
  });
  await test('drain waits for actual settlement', async () => {
    const gate = createLifecycle(), finish = gate.begin('observer'); let drained = false;
    const waiting = gate.drain(100).then(value => { drained = value; });
    await Promise.resolve(); assert.equal(drained, false); finish(); await waiting; assert.equal(drained, true);
  });
  await test('late rejection is consumed after cancellation', async () => {
    const gate = createLifecycle(); let reject;
    const waiting = gate.wait(new Promise((_, fail) => { reject = fail; }));
    const rejected = assert.rejects(waiting, /cancel/); gate.fail(Error('cancel')); await rejected;
    reject(Error('late rejection')); await Promise.resolve();
    assert.equal(gate.cleanupAllowed(records()), false);
  });
  console.log(passed + ' pure lifecycle checks passed');
}
if (require.main === module && process.argv[2] === '--lifecycle-self-test') {
  lifecycleSelfTest().catch(error => { console.error(error); process.exitCode = 1; });
}
