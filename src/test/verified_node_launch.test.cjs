// Isolated native fixture only; never runs index.js, helpers or real providers.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const { stageBackend } = require('../../scripts/stage-backend.cjs');
const runtime = 'C:\\Program Files\\nodejs\\node.exe';
const digest = '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';

test('verified native Node fixture: exact image, suspended launch, denials and lifetime cleanup', () => {
  assert.equal(process.execPath, runtime); assert.equal(process.version, 'v24.19.0'); assert.equal(process.arch, 'x64');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(runtime)).digest('hex'), digest, 'Runtime differs: stop before staging or launch');
  const root = path.resolve(__dirname, '../..');
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-verified-node-'));
  const stage = path.join(evidence, 'stage');
  console.log('Verified Node evidence: ' + evidence);
  const manifest = stageBackend(root, stage);
  const input = path.join(root, 'src/test/backend_lifecycle_fixture.ts');
  const output = ts.transpileModule(fs.readFileSync(input, 'utf8'), {fileName: input, reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext, rewriteRelativeImportExtensions:true}});
  assert.ok(!output.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error));
  fs.mkdirSync(path.join(stage, 'src/test'));
  fs.writeFileSync(path.join(stage, 'src/test/backend_lifecycle_fixture.js'), output.outputText, {flag:'wx'});
  fs.copyFileSync(path.join(root, 'scripts/verified-node-driver.cjs'), path.join(stage, 'node-launch-driver.cjs'), fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(root, 'scripts/staged-backend-review.cjs'), path.join(stage, 'node-launch-review.cjs'), fs.constants.COPYFILE_EXCL);
  const executable = path.join(root, 'native/ApplicationCompanion/bin/Release/net10.0-windows/ApplicationCompanion.exe');
  const args = ['--verified-node-fixture-self-test', stage];
  const result = spawnSync(executable, args, {cwd:evidence, encoding:'utf8', windowsHide:true, shell:false, timeout:60000,
    env:{SystemRoot:process.env.SystemRoot, NODE_OPTIONS:'--require=DO_NOT_LOAD', NODE_PATH:'DO_NOT_LOAD', PATH:'DO_NOT_LOAD'}});
  fs.writeFileSync(path.join(evidence, 'native-stdout.json'), result.stdout ?? '');
  fs.writeFileSync(path.join(evidence, 'native-stderr.log'), result.stderr ?? '');
  fs.writeFileSync(path.join(evidence, 'invocation.json'), JSON.stringify({executable,args,status:result.status,signal:result.signal,
    error:result.error?.message ?? null, runtime:{path:runtime,version:process.version,sha256:digest},
    stageUnresolved:manifest.unresolved.length, selectedStageFiles:manifest.candidates.filter(c=>c.output).length,
    completeClosure:false, productionAuthority:false},null,2));
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true); assert.equal(report.productionAuthority, false); assert.equal(report.completeClosure, false);
  assert.equal(report.runtime.sha256, digest); assert.equal(report.residualProcesses, 0);
  assert.deepEqual(report.cases.map(c=>c.name), ['positive','one-use-launch','manifest-tamper','entry-tamper','runtime-digest-policy','manifest-file-limit','manifest-expiry-limit','expired-before-create','cancelled-before-create',
    'wrong-image','job-failure','resume-failure','cancel-before-resume','cancellation-live','expiry-live']);
  assert.ok(report.cases.slice(1,-2).every(c=>c.outcome==='denied'));
  const positive=JSON.parse(fs.readFileSync(path.join(stage,'node-launch-positive.json'),'utf8'));
  assert.equal(positive.stagedComposition,true); assert.equal(positive.realEntrypointImported,false);
  assert.deepEqual(positive.blockedOperations,[]); assert.ok(!positive.loadedModules.includes('src/server/index.js'));
  assert.deepEqual(positive.environmentKeys, ['NODE_ENV','SystemRoot']);
  assert.equal(positive.cwd, stage);
  assert.deepEqual(positive.arguments, ['--permission', '--allow-fs-read='+stage, '--allow-fs-write='+path.join(stage,'node-launch-result.json'),
    '--no-addons', '--no-experimental-strip-types']);
  // All verifier file locks have been released, including after terminal revocation.
  for (const file of ['node-launch-driver.cjs','node-launch-review.cjs','src/test/backend_lifecycle_fixture.js']) {
    const fd=fs.openSync(path.join(stage,file),'r+'); fs.closeSync(fd);
  }
  console.log('Native fixture: ' + report.cases.length + ' cases; ' + report.createdProcesses + ' birth-specific processes cleaned up.');
});
