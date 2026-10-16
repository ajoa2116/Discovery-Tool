const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, spawn } = require('node:child_process');

test('fixture-only measured input ownership, integrity and lifetime', { skip: process.platform !== 'win32' }, async () => {
  const repo = path.resolve(__dirname, '../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-measured-input-'));
  fs.writeFileSync(path.join(root, 'fixture-marker'), 'inert-measured-input-lifetime');
  const redirect = path.join(root, 'junction/application/v1/native/redirect');
  const outside = path.join(root, 'junction-target');
  fs.mkdirSync(path.dirname(redirect), { recursive: true }); fs.mkdirSync(outside);
  fs.symlinkSync(outside, redirect, 'junction');
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const sources = ['native/ApplicationCompanion/InstalledRootAdmission.cs', 'native/ApplicationCompanion/WindowsBoundary.cs',
    'src/test/support/installed_root_admission_fixture.cs', 'src/test/support/measured_input_lifetime.cs', 'src/test/support/measured_input_lifetime_fixture.cs',
    'native/ApplicationCompanion/OwnedChild.cs', 'src/test/support/owned_child_link_guards.cs', 'src/test/support/owned_input_process.cs',
    'src/test/support/native_dll_experiment.cs'];
  const project = path.join(root, 'fixture.csproj');
  fs.writeFileSync(project, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0-windows</TargetFramework><StartupObject>MeasuredInputLifetimeFixture</StartupObject><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup><ItemGroup>' +
    sources.map(file => '<Compile Include="' + xml(path.join(repo, file)) + '" />').join('') + '</ItemGroup></Project>');
  const env = Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA','USERPROFILE','APPDATA']
    .flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  env.DOTNET_CLI_TELEMETRY_OPTOUT = '1'; env.DOTNET_NOLOGO = '1';
  const run = args => spawnSync('dotnet', args, { cwd: root, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  const nativeExperiment = process.env.DISCOVERY_NATIVE_DLL_EXPERIMENT === '1';
  if (nativeExperiment) {
    assert.equal(process.arch, 'x64');
    const nativeRoot = path.join(root, 'native-build'); fs.mkdirSync(nativeRoot);
    const vswhere = path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe');
    const installation = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
      { encoding: 'utf8', shell: false, windowsHide: true });
    assert.equal(installation.status, 0); assert.ok(installation.stdout.trim());
    const tools = path.join(installation.stdout.trim(), 'VC/Tools/MSVC',
      fs.readFileSync(path.join(installation.stdout.trim(), 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt'), 'utf8').trim(), 'bin/Hostx64/x64');
    const dependency = 'experiment_dep_' + require('node:crypto').randomBytes(16).toString('hex');
    fs.writeFileSync(path.join(nativeRoot, 'dependency-name.txt'), dependency + '.dll', { flag: 'wx' });
    const nativeRun = (exe, args) => {
      const result = spawnSync(path.join(tools, exe), args, { cwd: nativeRoot, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 30000 });
      fs.appendFileSync(path.join(nativeRoot, 'build.log'), `${exe} ${JSON.stringify(args)}\n${result.stdout || ''}${result.stderr || ''}`);
      assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stdout + result.stderr);
    };
    for (const [source, output, libraries] of [
      ['harmless_loader_primary.c', 'primary', []],
      ['harmless_loader_dependency.c', dependency, []],
      ['harmless_loader_probe.c', 'probe', [path.join(nativeRoot, dependency + '.lib')]],
    ]) {
      nativeRun('cl.exe', ['/nologo', '/c', '/TC', '/O1', '/GS-', '/Zl', '/Fo' + path.join(nativeRoot, output + '.obj'), path.join(__dirname, 'support', source)]);
      nativeRun('link.exe', ['/NOLOGO', '/DLL', '/NOENTRY', '/NODEFAULTLIB', '/MANIFEST:NO', '/MACHINE:X64', '/INCREMENTAL:NO', '/DYNAMICBASE', '/NXCOMPAT',
        '/OUT:' + path.join(nativeRoot, output + '.dll'), '/IMPLIB:' + path.join(nativeRoot, output + '.lib'), path.join(nativeRoot, output + '.obj'), ...libraries]);
    }
  }
  let ownerPreserved = false;
  const runFixture = args => new Promise((resolve, reject) => {
    // A timeout must NEVER kill an owner that may hold ACL restoration handles.
    const child = spawn(path.join(root, 'bin/Release/net10.0-windows/fixture.exe'), args, { cwd: root, env, shell: false, windowsHide: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const preserve = reason => {
      if (settled) return; settled = true; ownerPreserved = true; clearTimeout(timer);
      child.unref(); child.stdout.destroy(); child.stderr.destroy();
      try {
        fs.writeFileSync(path.join(root, 'owner-preserved.json'), JSON.stringify({ pid: child.pid, reason, stdout, stderr,
          ownerReviewRequired: true, handlesSurviveExit: false, productionAuthority: false }), { flag: 'wx' });
      } finally { reject(new Error(`${reason}; fixture owner PID=${child.pid} preserved at ${root}. Do not terminate it or clean its files before owner review.`)); }
    };
    const timer = setTimeout(() => preserve('Fixture timeout: process deliberately not killed; cleanup state unknown'), 60000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; if (stderr.includes('FIXTURE_RECOVERY_PENDING')) preserve('Unresolved consumer completion, ACL restoration or handle release'); });
    child.once('error', error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once('close', (status, signal) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ status, signal, stdout, stderr }); } });
  });
  console.log('Measured-input evidence: ' + root);
  try {
    const build = run(['build', project, '-c', 'Release', '--disable-build-servers', '--ignore-failed-sources', '-p:NuGetAudit=false']);
    fs.writeFileSync(path.join(root, 'build.log'), (build.stdout || '') + (build.stderr || ''));
    assert.equal(build.error, undefined); assert.equal(build.status, 0, build.stdout + build.stderr);
    const child = await runFixture(nativeExperiment ? [root, '--native-dll-experiment'] : [root]);
    fs.writeFileSync(path.join(root, 'result.stdout'), child.stdout || ''); fs.writeFileSync(path.join(root, 'result.stderr'), child.stderr || '');
    assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stdout + child.stderr);
    const report = JSON.parse(child.stdout);
    assert.equal(report.passed, true); assert.equal(report.allHandlesClosed, true);
    assert.equal(report.recoveryHandlesOpen, 0); assert.ok(report.restorationOwnersReleased > 0);
    for (const mode of ['early', 'late', 'both']) {
      assert.ok(report.results.some(r => r.name === `restore-failure-all-attempted:${mode}` && r.passed));
      assert.ok(report.results.some(r => r.name === `restoration-normal-disposal-no-leaks:${mode}` && r.passed));
    }
    assert.equal(report.productionAuthority, false); assert.equal(report.completeClosure, false); assert.equal(report.raceFree, false);
    assert.equal(report.inputs.length, 9); assert.ok(report.scenarioCount >= 100);
    for (const mode of ['normal', 'denial', 'release', 'dispose', 'duplicate', 'cancel', 'failure', 'inconclusive',
      'copied-consumer', 'forged-consumer', 'forged-completion', 'copied-completion', 'stale-completion', 'end-replay',
      'copied-completion-consumer', 'check-after-end', 'release-after-end', 'stream-cleanup', 'pin-cleanup']) {
      for (const prefix of ['consumer-active', 'consumer-retains-exact-handles', 'consumer-end-retains-until-ack',
        'consumer-completed-release', 'consumer-completion-replay-denied'])
        assert.ok(report.results.some(r => r.name === `${prefix}:${mode}` && r.passed), `${prefix}:${mode}`);
      const before = report.consumptionEvidence.find(r => r.mode === mode && r.stage === 'before-completion');
      const after = report.consumptionEvidence.find(r => r.mode === mode && r.stage === 'released');
      assert.ok(before.retained > report.inputs.length); assert.equal(after.retained, 0); assert.equal(after.consumer, 'Completed');
    }
    for (const mode of ['before-measure', 'before-handoff', 'copied-handoff', 'stale-handoff', 'wrong-selection', 'after-release'])
      assert.ok(report.results.some(r => r.name === `consumer-begin-denied:${mode}` && r.passed));
    for (const mode of ['stream-cleanup', 'pin-cleanup']) {
      assert.ok(report.results.some(r => r.name === `consumer-cleanup-pending:${mode}` && r.passed));
      const after = report.consumptionEvidence.find(r => r.mode === mode && r.stage === 'released');
      assert.equal(after.failures.length, 1);
    }
    assert.ok(report.results.some(r => r.name === 'consumer-inconclusive-blocks-restoration' && r.passed));
    for (const mode of ['normal', 'delayed', 'denial-live', 'cancel', 'failure', 'channel-loss', 'crash',
      'simulated-bypass', 'stale', 'copied', 'duplicate', 'dispose', 'timeout', 'wait-failure', 'wrong-process', 'input-cleanup', 'evidence-cleanup']) {
      for (const prefix of ['process-registered', 'process-exit-before-release', 'process-final-cleanup'])
        assert.ok(report.results.some(r => r.name === `${prefix}:${mode}` && r.passed), `${prefix}:${mode}`);
      const evidence = report.processEvidence.find(r => r.mode === mode).proof;
      assert.equal(evidence.released, true); assert.equal(evidence.retained, false);
      assert.equal(evidence.birthHandleClosed, true); assert.equal(evidence.observationClosed, true);
      assert.equal(evidence.jobClosed, true); assert.equal(evidence.pipeClosed, true);
      assert.equal(evidence.disposalRequested, true); assert.equal(evidence.disposalCompleted, true);
      assert.equal(evidence.referenceReleaseAttempted, true); assert.equal(evidence.referenceReleased, true);
      assert.equal(evidence.closureConfirmed, true); assert.equal(evidence.additionalReferenceOutstanding, false);
      assert.equal(evidence.referenceReleaseUncertain, false);
      assert.equal(evidence.events.filter(e => e === 'additional-reference-release-issued').length, 1);
      assert.ok(evidence.events.includes('registered-suspended-birth-handle-and-job'));
      assert.ok(evidence.events.includes('exact-birth-handle-signaled'));
      assert.equal(evidence.events.at(-1), 'process-evidence-released-after-input-cleanup');
    }
    for (const name of ['process-timeout-no-exit-inference', 'process-failed-wait-retains-pins', 'process-substituted-handle-denied',
      'process-identity-retained-during-input-cleanup', 'process-evidence-cleanup-pending', 'process-channel-loss-denies',
      'process-death-blocks-consumption', 'process-delayed-retains-pins'])
      assert.ok(report.results.some(r => r.name === name && r.passed), name);
    assert.equal(report.loaderEvidence.length, 24);
    for (const entry of report.loaderEvidence) {
      assert.ok(report.results.some(r => r.name === `loader-final-cleanup:${entry.mode}` && r.passed));
      assert.ok(report.results.some(r => r.name === `loader-retains-inputs-until-exit:${entry.mode}` && r.passed));
      assert.equal(entry.process.closureConfirmed, true); assert.equal(entry.process.released, true);
      assert.equal(entry.process.events.filter(e => e === 'additional-reference-release-issued').length, 1);
      assert.ok(entry.process.events.includes('exact-birth-handle-signaled'));
      for (const key of ['birthHandleClosed', 'observationClosed', 'jobClosed', 'pipeClosed']) assert.equal(entry.process[key], true);
      if (entry.denial !== null) assert.ok(report.results.some(r => r.name === `loader-denied:${entry.mode}` && r.passed));
      for (const evidence of entry.evidence) {
        assert.equal(evidence.RetainedFileObjectIdentityChecked, true); assert.equal(evidence.NamespaceObservedStable, true);
        assert.equal(evidence.RealLoaderConsumedMeasuredHandle, false); assert.equal(evidence.ProductionAuthority, false);
        assert.equal(evidence.CompleteClosure, false); assert.equal(evidence.RaceFree, false);
      }
    }
    if (nativeExperiment) {
      const native = report.nativeLoaderEvidence; assert.ok(native);
      for (const name of ['attempted-substitution-blocked', 'postload-identity-corroborated', 'excluded-dependency-denied',
        'reuse-and-unload-accounted', 'pins-retained-until-process-exit', 'final-cleanup', 'unexpected-import-rejected-before-load',
        'comparable-dependency-inputs', 'allowed-dependency-resolved', 'allowed-fresh-modules-only', 'allowed-dependency-unloaded',
        'negative-after-unload-denied', 'unadmitted-dependency-request-denied', 'denial-retains-pins'])
        assert.ok(report.results.some(r => r.name === `native-loader-${name}` && r.passed), name);
      assert.equal(native.report.Passed, true); assert.equal(native.report.AtomicMeasuredHandleBinding, false);
      assert.equal(native.report.ProductionAuthority, false); assert.equal(native.report.RemainingReferences, 0);
      assert.equal(native.report.LoadReferences, 3); assert.equal(native.report.FreeCalls, 3); assert.equal(native.report.SuccessfulFrees, 3);
      assert.equal(native.report.SearchError, 126); assert.equal(native.pinsClosed, true); assert.equal(native.monitorCompleted, true);
      const control = native.report.Control; assert.ok(control);
      for (const flag of ['ComparableBytes', 'FreshBeforePositive', 'ImportAddressMatched', 'ImageMappings', 'AbsentAfterProbeFree']) assert.equal(control[flag], true);
      assert.equal(control.NegativeAfterUnloadError, 126); assert.equal(control.ExplicitLoads, 1); assert.equal(control.SuccessfulFrees, 1);
      assert.equal(control.NewModules.length, 2);
      assert.deepEqual(new Set(control.NewModules), new Set([control.AllowedProbePath, control.LoadedDependencyPath]));
      for (const [observed, fullPath] of [[control.ProbeFile, control.AllowedProbePath], [control.DependencyFile, control.LoadedDependencyPath]]) {
        const suffix = path.relative(path.dirname(path.dirname(fullPath)), fullPath).replaceAll('\\', '/');
        const selected = native.inputs.find(f => f.RelativePath === suffix); assert.ok(selected);
        for (const field of ['Volume', 'FileId', 'Length', 'Sha256']) assert.equal(observed[field], selected[field]);
      }
      assert.equal(native.inputs.length, 13); assert.equal(native.process.released, true); assert.equal(native.process.retained, false);
      assert.equal(native.process.closureConfirmed, true); assert.equal(native.process.additionalReferenceOutstanding, false);
      assert.equal(native.process.referenceReleaseUncertain, false);
      assert.equal(native.process.events.filter(e => e === 'additional-reference-release-issued').length, 1);
      for (const flag of ['birthHandleClosed', 'observationClosed', 'jobClosed', 'pipeClosed']) assert.equal(native.process[flag], true);
      assert.ok(native.process.events.includes('exact-birth-handle-signaled'));
      assert.equal(native.process.events.at(-1), 'process-evidence-released-after-input-cleanup');
    }
    fs.writeFileSync(path.join(root, 'lifetime-results.json'), JSON.stringify(report, null, 2));
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !['bin','obj'].includes(e.name))) {
      const before = path.join(root, entry.name), after = before + '.released';
      fs.renameSync(before, after); fs.renameSync(after, before);
    }
    fs.writeFileSync(path.join(root, 'cleanup.json'), JSON.stringify({ fixtureExited: true, originalHandleAssertionsPassed: true, privateDirectoriesRenamed: true, productionAuthority: false }));
  } finally {
    if (!ownerPreserved && fs.existsSync(redirect)) fs.rmdirSync(redirect); // never mutate an unresolved owner's fixture
  }
});

test('source guards enforce exactly-once process reference release ordering', () => {
  // Static regression checks only. This callback reads checkout source and never
  // builds, launches a fixture, inspects a process or accesses preserved evidence.
  const source = fs.readFileSync(path.join(__dirname, 'support/owned_input_process.cs'), 'utf8');
  const release = source.slice(source.indexOf('internal void ReleaseEvidence('), source.indexOf('internal void AwaitMonitor('));
  const disposal = source.slice(source.indexOf('private void RequestOwnedDisposal('), source.indexOf('internal void RequestShutdown('));
  const ordered = (body, markers) => {
    let previous = -1;
    for (const marker of markers) {
      const index = body.indexOf(marker);
      assert.ok(index > previous, `Missing or out-of-order source guard: ${marker}`);
      previous = index;
    }
  };
  ordered(disposal, ['if (disposalRequested)', 'if (!disposalCompleted) throw', 'disposalRequested = true',
    'child!.Dispose()', 'disposalCompleted = true']);
  ordered(release, ['if (referenceReleaseAttempted) throw', 'ConfirmExit(owner, token)', 'RequestOwnedDisposal()',
    'observation!.Dispose()', 'referenceReleaseAttempted = true', 'birth!.DangerousRelease()',
    'referenceReleased = true', 'retained = false', 'closureConfirmed = birth.IsClosed',
    'if (!closureConfirmed)', 'released = true']);
  assert.equal(release.match(/\.DangerousRelease\(\)/g)?.length, 1);
  assert.equal(release.indexOf('birth.IsClosed') > release.indexOf('.DangerousRelease()'), true);
  assert.doesNotMatch(release.slice(0, release.indexOf('.DangerousRelease()')), /birth!?\.IsClosed/);
  assert.doesNotMatch(release, /\b(?:for|while)\s*\(|referenceReleaseAttempted\s*=\s*false/);
  assert.match(release, /catch \(Exception error\)[\s\S]*releaseFailure = error\.ToString\(\);[\s\S]*throw;/);
  assert.match(source, /birth is not null && !closureConfirmed \? 1 : 0/);
  assert.match(source, /referenceReleaseUncertain = referenceReleaseAttempted && !referenceReleased/);
  assert.match(source, /released && disposalCompleted && referenceReleased && closureConfirmed/);
  const lease = fs.readFileSync(path.join(__dirname, 'support/measured_input_lifetime.cs'), 'utf8');
  assert.match(lease, /if \(InputHandles == 0 && ownedProcess is not null && !ownedProcess\.ResourcesReleased\)/);
  assert.match(lease, /if \(OutstandingHandles == 0\) lock \(OwnershipLock\)/);
});
