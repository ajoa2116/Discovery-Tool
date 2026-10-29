const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { spawn, execFile } = require('node:child_process');
const fixture = require('./support/project_process_fixture.cjs');

const worker = path.join(__dirname, 'support/project_process_worker.cjs');
const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const environment = Object.fromEntries(['SystemRoot', 'WINDIR', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'ProgramFiles'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
let owner, parentIdentity, controlInspections = 0, networkAttempts = 0;
const lifecycle = fixture.createLifecycle();
const workers = [];
const inspectScript = `
$ErrorActionPreference='Stop'
$proof=([Console]::In.ReadToEnd() | ConvertFrom-Json)
function Convert-ProcessRecord($item) {
 if($null -eq $item) { return $null }
 $created=([DateTime]$item.CreationDate).ToUniversalTime()
 $bounded=([string]$item.CommandLine).Length -le 1024 -and ([string]$item.ExecutablePath).Length -le 512
 return @{pid=[int]$item.ProcessId;parentPid=[int]$item.ParentProcessId;creationUtc=$created.ToString('o');creationMs=([DateTimeOffset]$created).ToUnixTimeMilliseconds();executable=$(if($bounded){$item.ExecutablePath}else{$null});commandLine=$(if($bounded){$item.CommandLine}else{$null});unavailable=(-not $bounded)}
}
function Read-ProcessRecord($targetWorkerPid) {
 return Convert-ProcessRecord (Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$targetWorkerPid))
}
$result=@{rootReparsePoints=0;rootError=$false;observationError=$false;children=@();childrenTruncated=$false}
try {
 $cursor=$proof.root
 while($cursor) {
  $item=Get-Item -Force -LiteralPath $cursor
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { $result.rootReparsePoints++ }
  $next=[IO.Directory]::GetParent($cursor)
  if($null -eq $next) { break }; $cursor=$next.FullName
 }
} catch { $result.rootError=$true }
try {
 $result.parent=Read-ProcessRecord $proof.parentPid
 if($proof.workerPid) {
  $result.workerBefore=Read-ProcessRecord $proof.workerPid
  $candidates=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId = '+[int]$proof.workerPid) | Sort-Object ProcessId)
  $result.childrenTruncated=$candidates.Count -gt 2
  $result.children=@($candidates | Select-Object -First 2 | ForEach-Object {
   $candidatePid=$_.ProcessId
   @{before=(Convert-ProcessRecord $_);after=(Read-ProcessRecord $candidatePid)}
  })
  $result.workerAfter=Read-ProcessRecord $proof.workerPid
 }
} catch { $result.observationError=$true }
$result.observedAtMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$result | ConvertTo-Json -Compress -Depth 6
`;
async function inspect(root, record) {
  lifecycle.check();
  const settled = lifecycle.begin('observer');
  controlInspections++;
  let child, resolveResponse, responseDone = false, closeDone = false;
  const observerDeadline = setTimeout(() => lifecycle.fail(Error('Observer lifetime bound')), 10000);
  const settleObservation = () => {
    if (responseDone && closeDone) { clearTimeout(observerDeadline); settled(); }
  };
  const response = new Promise(resolve => { resolveResponse = resolve; });
  let observerClosed;
  try {
    child = execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', inspectScript], {
      windowsHide: true, env: environment, timeout: 10000, maxBuffer: 8192, signal: lifecycle.signal,
    }, (error, stdout, stderr) => {
      let result = { observationError: true };
      if (!error && !stderr) { try { result = JSON.parse(stdout); } catch {} }
      const snapshot = fixture.observationSnapshot(result);
      // Late callbacks may emit sanitized diagnostics, never classification/progress.
      console.log(JSON.stringify({ event: 'process-observation', role: record?.role ?? 'parent', afterFailure: lifecycle.failed, snapshot }));
      responseDone = true; settleObservation();
      resolveResponse(snapshot);
    });
    observerClosed = new Promise(resolve => child.once('close', () => {
      closeDone = true; settleObservation(); resolve();
      console.log(JSON.stringify({ event: 'observer-close', role: record?.role ?? 'parent', afterFailure: lifecycle.failed }));
    }));
    child.stdin.on('error', () => lifecycle.fail(Error('Observer input failed')));
    child.stdin.end(JSON.stringify({ root, workerPid: record?.pid, parentPid: process.pid }));
  } catch (error) {
    if (!child) { clearTimeout(observerDeadline); settled(); }
    throw lifecycle.fail(error);
  }
  const [snapshot] = await lifecycle.wait(Promise.all([response, observerClosed]));
  lifecycle.check();
  const classification = fixture.classifyObservation(snapshot, { parentPid: process.pid, executable: process.execPath,
    parentIdentity, pid: record?.pid, role: record?.role, launch: record?.launch, workerPath: worker, workerIdentity: record?.identity });
  if (record) record.observation = classification;
  console.log(JSON.stringify({ event: 'process-classification', role: record?.role ?? 'parent', ...classification }));
  if (classification.status !== 'ALLOW') throw lifecycle.fail(Error('Process observation ' + classification.status + ': ' + classification.reason));
  return snapshot;
}
async function runWorker(role, writer) {
  lifecycle.check();
  fixture.ownRoot(owner);
  const record = { role, pid: 0, closed: false, exitObserved: false, exitCode: null, signal: null, containment: 'UNKNOWN',
    launch: { requestedAtMs: Date.now(), spawnedAtMs: null, parentPid: process.pid, executable: process.execPath, args: [worker, role] } };
  workers.push(record);
  const child = spawn(process.execPath, [worker, role], { cwd: path.resolve(__dirname, '../..'), env: environment, windowsHide: true, shell: false, stdio: 'pipe' });
  record.pid = child.pid;
  console.log(JSON.stringify({ event: 'worker-launch-request', ...record }));
  child.once('spawn', () => {
    const spawnedAtMs = Date.now();
    if (!lifecycle.failed) record.launch.spawnedAtMs = spawnedAtMs;
    console.log(JSON.stringify({ event: 'worker-spawn', role, pid: record.pid, spawnedAtMs, afterFailure: lifecycle.failed }));
  });
  child.once('exit', (code, signal) => {
    record.exitObserved = true; record.exitCode = code; record.signal = signal;
    console.log(JSON.stringify({ event: 'worker-exit', role, pid: record.pid, code, signal }));
  });
  let input = '', total = 0, frames = [], waiting, exitRequested = false;
  const stop = error => lifecycle.fail(error);
  const closed = new Promise(resolve => child.once('close', (code, signal) => {
    record.closed = true; record.exitCode = code; record.signal = signal; resolve();
    console.log(JSON.stringify({ event: 'worker-close', role, pid: record.pid, code, signal }));
    if (!exitRequested) stop(Error('Worker closed before requested exit'));
  }));
  child.on('error', () => stop(Error('Worker spawn failed')));
  child.stdin.on('error', () => stop(Error('Worker input failed')));
  child.stderr.on('data', chunk => { record.stderrBytes = (record.stderrBytes ?? 0) + chunk.length; stop(Error('Worker reported failure')); });
  child.stdout.on('data', chunk => {
    if (lifecycle.failed) return;
    total += chunk.length; if (total > 16384) { stop(Error('Worker output bound')); return; }
    input += chunk.toString('utf8');
    try {
      for (let end; (end = input.indexOf('\n')) >= 0;) {
        const value = JSON.parse(input.slice(0, end)); input = input.slice(end + 1);
        if (waiting) { const done = waiting; waiting = undefined; done.resolve(value); } else frames.push(value);
      }
    } catch { stop(Error('Malformed worker frame')); }
  });
  const next = () => {
    lifecycle.check();
    return lifecycle.wait(frames.length ? Promise.resolve(frames.shift()) : new Promise(resolve => { waiting = { resolve }; }));
  };
  const workflowSettled = lifecycle.begin('workflow');
  const timer = setTimeout(() => stop(Error('Worker lifetime bound')), 30000);
  try {
      lifecycle.check();
      child.stdin.write(JSON.stringify({ owner, writer }) + '\n');
      assert.deepEqual(await next(), { type: 'READY', role, pid: record.pid, ppid: process.pid });
      const identity = await inspect(owner.root, record);
      lifecycle.check();
      record.identity = identity.workerBefore;
      record.initialObservation = record.observation;
      fixture.entries(owner, role === 'writer' ? [] : fixture.names);
      lifecycle.check();
      child.stdin.write('{"type":"GO"}\n');
      const result = await next();
      assert.equal(result.type, 'DONE'); assert.equal(result.role, role); assert.equal(result.pid, record.pid);
      assert.deepEqual(result.networkOrProcessViolations, []); assert.deepEqual(result.files, fixture.names);
      assert.equal(result.results.length, 2); fixture.entries(owner, fixture.names);
      await inspect(owner.root, record);
      lifecycle.check();
      record.finalObservation = record.observation;
      exitRequested = true;
      child.stdin.end('{"type":"EXIT"}\n');
      await lifecycle.wait(closed); assert.equal(record.exitObserved, true); assert.equal(record.exitCode, 0); assert.equal(record.signal, null);
      assert.equal(input, ''); assert.deepEqual(frames, []);
      lifecycle.check(); record.success = true; record.containment = 'VERIFIED_FIXTURE';
      console.log(JSON.stringify({ worker: role, ...record, projects: result.results.length }));
      return result;
  } catch (error) {
    throw lifecycle.fail(error);
  } finally {
    clearTimeout(timer);
    waiting = undefined;
    workflowSettled(); record.workflowSettled = true;
    const activityDrain = lifecycle.drain(3000);
    if (!record.closed) {
      child.stdin.destroy();
      try { record.killRequested = child.kill(); } catch { record.killRequested = false; }
      let cleanupTimer;
      await Promise.race([closed, new Promise(resolve => { cleanupTimer = setTimeout(resolve, 3000); })]);
      clearTimeout(cleanupTimer);
      if (!record.closed) { stop(Error('Worker closure unconfirmed')); child.stdout.destroy(); child.stderr.destroy(); child.unref(); }
    }
    const activitySettled = await activityDrain;
    if (!activitySettled) stop(Error('Observation settlement unconfirmed'));
    console.log(JSON.stringify({ event: 'worker-final-observation', ...record, activitySettled, lifecycle: lifecycle.snapshot(), cleanupUncertain: lifecycle.failed || !record.success || !record.closed }));
  }
}
async function run() {
  let failure;
  const net = require('node:net'), dgram = require('node:dgram');
  const deny = () => { networkAttempts++; throw Error('Forbidden parent network operation'); };
  net.Socket.prototype.connect = deny; net.Server.prototype.listen = deny; dgram.createSocket = deny;
  try {
    assert.equal(process.platform, 'win32');
    const parent = fs.realpathSync(tmpdir()); fixture.noRedirect(parent); parentIdentity = (await inspect(parent)).parent;
    const root = fs.mkdtempSync(path.join(parent, 'discovery-project-process-'));
    owner = { root, parent, identity: fixture.identity(root) }; fixture.ownRoot(owner);
    console.log(JSON.stringify({ fixtureRoot: root, rootIdentity: owner.identity }));
    const writer = await runWorker('writer');
    lifecycle.check();
    assert.equal(workers[0].closed, true); assert.equal(workers[0].exitCode, 0);
    const hashes = fixture.names.map(name => fixture.hash(fs.readFileSync(fixture.file(owner, name))));
    await runWorker('reader', writer);
    lifecycle.check();
    assert.notEqual(workers[0].pid, workers[1].pid);
    assert.deepEqual(fixture.names.map(name => fixture.hash(fs.readFileSync(fixture.file(owner, name)))), hashes);
    assert.equal(networkAttempts, 0);
  } catch (error) { failure = lifecycle.fail(error); console.error(error.message); }
  finally {
    // Worker finally already used its three-second settlement window.
    const activitySettled = await lifecycle.drain(workers.length ? 0 : 3000);
    if (!activitySettled) { failure = lifecycle.fail(Error('Outstanding observation: preserve root')); console.error(failure.message); }
    if (owner) try {
      assert.equal(lifecycle.cleanupAllowed(workers), true, 'Containment/settlement UNKNOWN: preserve root');
      fixture.ownRoot(owner);
      const present = fs.readdirSync(owner.root);
      assert.ok(present.every(name => fixture.names.includes(name)), 'Unknown entry: preserve owned root');
      const files = present.map(name => fixture.file(owner, name)); // Validate complete set before deleting.
      for (const file of files) { fixture.ownRoot(owner); fixture.file(owner, path.basename(file)); fs.unlinkSync(file); }
      fixture.ownRoot(owner); fs.rmdirSync(owner.root);
      assert.throws(() => fs.lstatSync(owner.root), error => error.code === 'ENOENT');
      console.log(JSON.stringify({ cleanupConfirmed: true, removedFiles: files.length, rootAbsent: true, workerClosures: workers.map(worker => worker.closed), networkAttempts, controlInspections }));
    } catch (error) { failure = lifecycle.fail(error); console.error('CLEANUP UNCERTAIN; preserve ' + owner.root); }
  }
  if (failure) process.exitCode = 1;
  else console.log('PASS: two explicit saves, two fresh-process reopens, exact metadata/identity/history/exclusion and byte preservation');
}
void run();
