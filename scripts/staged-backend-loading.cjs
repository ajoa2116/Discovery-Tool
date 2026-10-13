// Isolated experiment only. Never invokes the production entrypoint or launcher.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { stageBackend } = require('./stage-backend.cjs');
const { classifyOutputs, buildPackageAdmission } = require('./staged-backend-review.cjs');
const ts = require('typescript');

function runLoadingHarness(root, out, options = {}) {
  const manifest = stageBackend(root, out);
  out = path.resolve(out);
  const packageAdmission = buildPackageAdmission(manifest);
  fs.writeFileSync(path.join(out, '.loading-package-admission.json'), JSON.stringify(packageAdmission, null, 2) + '\n', { flag: 'wx' });
  fs.copyFileSync(path.join(__dirname, 'staged-backend-probe.cjs'), path.join(out, '.loading-probe.cjs'), fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(__dirname, 'staged-backend-review.cjs'), path.join(out, '.loading-review.cjs'), fs.constants.COPYFILE_EXCL);
  // Inventory deliberately excludes tests. Emit exactly one explicit test input
  // separately; never alter the production manifest or infer production reachability.
  const fixtureSource = 'src/test/backend_lifecycle_fixture.ts', fixtureOutput = 'src/test/backend_lifecycle_fixture.js';
  const fixturePath = path.resolve(root, fixtureSource), rootPath = fs.realpathSync(root);
  if (fs.realpathSync(fixturePath) !== fixturePath || !fixturePath.startsWith(rootPath + path.sep) || fs.statSync(fixturePath).size > 2 * 1024 * 1024)
    throw Error('Unsupported test fixture input.');
  const fixture = ts.transpileModule(fs.readFileSync(fixturePath, 'utf8'), { fileName: fixturePath, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true } });
  if (fixture.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw Error('Test fixture transpilation failed.');
  fs.mkdirSync(path.join(out, 'src/test'));
  fs.writeFileSync(path.join(out, fixtureOutput), fixture.outputText, { flag: 'wx' });
  const testOnlyFixtures = [{ source: fixtureSource, output: fixtureOutput, reason: 'Explicit synthetic lifecycle test input; not production reachability evidence.' }];
  fs.writeFileSync(path.join(out, 'test-fixture-manifest.json'), JSON.stringify({ informationalOnly: true, productionAuthority: false,
    testOnly: true, compiler: ts.version, typeChecked: false, inputs: testOnlyFixtures }, null, 2) + '\n', { flag: 'wx' });
  return runStagedProbe(out, manifest, testOnlyFixtures, options);
}

// Reuse an already prepared external fixture stage; no inventory or staging scan.
function runStagedProbe(out, manifest, testOnlyFixtures = [], options = {}) {
  out = path.resolve(out);
  const packageAdmission = buildPackageAdmission(manifest);
  // Explicit environment, never inherit preload, module search or loader settings.
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  env.NODE_ENV = 'production';
  const executable = options.executable ?? process.execPath;
  const args = ['--permission', '--allow-fs-read=' + out, '--no-addons', '--no-experimental-strip-types', path.join(out, '.loading-probe.cjs')];
  if (options.startupSmokeOnly === true) args.push('--startup-smoke');
  if (options.resolutionOnly === true) args.push('--resolution-only');
  if (options.mappingOnly === true) args.push('--mapping-only');
  const child = spawnSync(executable, args, { cwd: out, env, windowsHide: true, shell: false, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  let probe;
  try { probe = JSON.parse(child.stdout); } catch { probe = { failures: [{ check: 'probe-output', message: 'No complete JSON probe result.' }] }; }
  const report = { informationalOnly: true, productionAuthority: false, completeClosure: false,
    stage: out, stageStatus: manifest.status, runtimeCommand: { executable, args },
    exitCode: child.status, signal: child.signal, launchError: child.error?.message ?? null, stderr: child.stderr,
    probe, packageAdmission, dependencyResolution: probe.dependencyResolution ?? null, helperMapping: probe.helperMapping ?? null, testOnlyFixtures, stageUnresolvedCount: manifest.unresolved.length,
    untested: ['Production launcher is intentionally not imported; composition lifecycle uses explicit test-only dependencies.',
      'Actual camera discovery, adapter changes, native hosts, PowerShell/helpers and authorized HTTP/WS sessions.',
      'Conditional/generated imports, OS/native/WASM closure, approved runtime compatibility and production integration.'],
    unexercisedSelectedOutputs: manifest.candidates.filter(c => ['transpiled', 'copied-candidate'].includes(c.status) &&
      /\.(?:[cm]?js)$/.test(c.output) && !probe.loadedModules?.includes(c.output)).map(c => c.output),
  };
  report.coverageClassification = classifyOutputs(manifest, JSON.parse(fs.readFileSync(path.join(out, 'inventory.json'), 'utf8')), probe);
  report.startupBlockers = [
    'Production index.js invokes start(); real listening and scheduling remain prohibited by this harness.',
    'Default Windows recovery and credential initialization need later controlled real runtime/provider validation.',
    'Real listener binding, monitoring, helper termination and operating-system shutdown behavior remain unverified.',
    'Approved runtime, authenticated native owner/process/session/listener binding and native/helper closure remain pending.'
  ];
  report.passed = child.status === 0 && !child.error && probe.passed === true;
  fs.writeFileSync(path.join(out, 'loading-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}
module.exports = { runLoadingHarness, runStagedProbe };
if (require.main === module) {
  const out = process.argv[2];
  if (!out) { console.error('Usage: node scripts/staged-backend-loading.cjs NEW_EXTERNAL_STAGE_DIRECTORY'); process.exitCode = 1; }
  else {
    const report = runLoadingHarness(path.resolve(__dirname, '..'), out);
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}
