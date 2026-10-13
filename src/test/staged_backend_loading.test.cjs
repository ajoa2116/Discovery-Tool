const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { runLoadingHarness } = require('../../scripts/staged-backend-loading.cjs');
const { classifyOutputs, buildPackageAdmission, selectedDependencyRequests, mappedStagePath, createSelectedPathCapture } = require('../../scripts/staged-backend-review.cjs');

test('helper mapping converts Windows file URLs and denies traversal, remote and ambiguous paths', () => {
  const root = 'C:\\fixture root';
  for (const input of ['file:///C:/fixture%20root/dist/index.html', 'C:\\fixture root\\dist\\index.html', 'dist/index.html'])
    assert.equal(mappedStagePath(input, root, 'win32').name, 'dist/index.html');
  for (const input of ['../secret.txt', 'dist/../dist/index.html', 'file:///C:/fixture%20root/%2e%2e/secret.txt',
    'file:///C:/outside/secret.txt', 'file://server/share/file.txt', 'file:///C:/fixture%20root/dist%2Findex.html',
    'file:///C:/fixture%20root/dist/index.html?x=1', 'file:///C:/fixture%20root/dist/index.html#fragment',
    'C:relative.txt', 'C:\\fixture root\\dist\\index.html:stream', '\\\\?\\C:\\fixture root\\dist\\index.html',
    'https://example.test/file', 'file:///C:/fixture%20root/dist%5C..%5Csecret.txt'])
    assert.throws(() => mappedStagePath(input, root, 'win32'), { code: 'MAPPING_DENIED' }, input);
});

test('helper mapping captures only exact selected identities and fails closed without reading bodies', () => {
  const root = mkdtempSync(join(tmpdir(), 'discovery-mapping space-'));
  mkdirSync(join(root, 'dist'));
  const file = join(root, 'dist', 'fixture # %.json'); writeFileSync(file, 'DO_NOT_READ_CONTENTS');
  const expected = 'dist/fixture # %.json', source = 'src/core/readiness/build_identity.ts', specifier = '../../../' + expected;
  const candidate = { source: expected, output: expected, status: 'copied-candidate', selectionReasons: ['observed-module-url:' + source] };
  const ref = { source, specifier, kind: 'module-url', resolvedPath: expected };
  const manifest = { candidates: [candidate], unresolved: [] }, inventory = { references: [ref] };
  const capture = createSelectedPathCapture(root, manifest, inventory);
  const first = capture.capture(pathToFileURL(file), expected, source, specifier, 'read-capture');
  const second = capture.capture(file, expected, source, specifier, 'read-capture');
  assert.deepEqual(first.identity, second.identity); assert.equal(first.contentsRead, false); assert.equal(first.executed, false);
  for (const [m, i] of [
    [{ candidates: [], unresolved: [] }, inventory],
    [{ candidates: [candidate, candidate], unresolved: [] }, inventory],
    [{ candidates: [{ ...candidate, status: 'unselected-unresolved' }], unresolved: [] }, inventory],
    [{ candidates: [{ ...candidate, selectionReasons: [] }], unresolved: [] }, inventory],
    [{ candidates: [candidate], unresolved: [{ target: expected, reason: 'conditional-unresolved' }] }, inventory],
    [manifest, { references: [ref, ref] }],
    [manifest, { references: [{ ...ref, resolvedPath: 'dist/wrong.json' }] }],
  ]) assert.throws(() => createSelectedPathCapture(root, m, i).capture(file, expected, source, specifier, 'read-capture'), { code: 'MAPPING_DENIED' });
  assert.throws(() => capture.capture(join(root, 'dist', 'wrong.json'), expected, source, specifier, 'read-capture'), { code: 'MAPPING_DENIED' });
  assert.throws(() => capture.capture(join(root, '..', 'outside.txt'), expected, source, specifier, 'read-capture'), { code: 'MAPPING_DENIED' });
  writeFileSync(file, 'CHANGED_FILE_IDENTITY_AND_LENGTH');
  assert.throws(() => capture.capture(file, expected, source, specifier, 'read-capture'), { code: 'MAPPING_DENIED' });
  unlinkSync(file);
  assert.throws(() => createSelectedPathCapture(root, manifest, inventory).capture(file, expected, source, specifier, 'read-capture'), { code: 'MAPPING_DENIED' });
});

const selectedPackage = name => ({ source: name, output: name, status: 'copied-candidate',
  selectionReasons: ['member-of-selected-lock-package:node_modules/synthetic'] });
const reviewedPackage = name => ({ path: name, reason: 'Explicit synthetic module reviewed for this test.' });

test('package admission denies missing, failed, ambiguous and unresolved selections without discarding edge gaps', () => {
  const name = 'node_modules/synthetic/approved.cjs';
  const gap = { source: name, kind: 'require', reason: 'computed-input' };
  const manifest = { candidates: [selectedPackage(name)], unresolved: [gap] };
  const valid = buildPackageAdmission(manifest, [reviewedPackage(name)]);
  assert.equal(valid.admitted.length, 1); assert.deepEqual(valid.unresolved, [gap]);
  assert.deepEqual(valid.admitted[0].selectionReasons, manifest.candidates[0].selectionReasons);
  for (const [candidates, unresolved, reviews, reason] of [
    [[], [], [reviewedPackage(name)], 'missing-selection'],
    [[{ ...selectedPackage(name), status: 'unselected-unresolved' }], [], [reviewedPackage(name)], 'unsuccessful-or-unresolved-selection'],
    [[{ ...selectedPackage(name), status: 'failed' }], [], [reviewedPackage(name)], 'unsuccessful-or-unresolved-selection'],
    [[selectedPackage(name), selectedPackage(name)], [], [reviewedPackage(name)], 'ambiguous-selection'],
    [[selectedPackage(name), selectedPackage(name.toUpperCase())], [], [reviewedPackage(name)], 'ambiguous-selection'],
    [[selectedPackage(name)], [], [reviewedPackage(name), reviewedPackage(name)], 'ambiguous-review'],
    [[selectedPackage(name)], [{ target: name, reason: 'conditional-selection-unresolved' }], [reviewedPackage(name)], 'unresolved-file-selection'],
    [[{ ...selectedPackage(name), selectionReasons: [] }], [], [reviewedPackage(name)], 'missing-selection-reasons'],
    [[selectedPackage(name)], [], [], 'unreviewed-package-file'],
  ]) {
    const report = buildPackageAdmission({ candidates, unresolved }, reviews);
    assert.equal(report.admitted.length, 0); assert.ok(report.denied.some(r => r.reason === reason), reason);
    assert.deepEqual(report.unresolved, unresolved);
  }
  assert.throws(() => buildPackageAdmission({}, []), /Missing/);
  assert.throws(() => buildPackageAdmission(manifest, [reviewedPackage('node_modules/synthetic/*.js')]), /Invalid/);
});

test('exact package hooks reject unlisted ESM and CommonJS bodies, including transitive loads', () => {
  const stage = mkdtempSync(join(tmpdir(), 'discovery-package-admission-'));
  const pkg = join(stage, 'node_modules/synthetic'); mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const ext of ['mjs', 'cjs']) {
    writeFileSync(join(pkg, 'approved.' + ext), ext === 'mjs' ? 'export const value = 7;' : 'module.exports = 7;');
    writeFileSync(join(pkg, 'unlisted.' + ext), 'globalThis.unlistedExecuted = true;');
    for (const denied of ['missing', 'ambiguous', 'unresolved'])
      writeFileSync(join(pkg, denied + '.' + ext), 'globalThis.unlistedExecuted = true;');
    writeFileSync(join(pkg, 'parent.' + ext), ext === 'mjs' ? "import './unlisted.mjs';" : "require('./unlisted.cjs');");
  }
  const names = ['approved.mjs', 'approved.cjs', 'parent.mjs', 'parent.cjs'].map(n => 'node_modules/synthetic/' + n);
  const missing = 'node_modules/synthetic/unlisted.cjs';
  const deniedNames = ['missing', 'ambiguous', 'unresolved'].flatMap(n => ['mjs', 'cjs'].map(ext => 'node_modules/synthetic/' + n + '.' + ext));
  const ambiguous = deniedNames.filter(n => n.includes('/ambiguous.')).map(selectedPackage);
  const unresolvedNames = deniedNames.filter(n => n.includes('/unresolved.'));
  // Missing/duplicate/unresolved selections never grant admission even when reviewed.
  const manifest = { candidates: [...names.map(selectedPackage), selectedPackage(missing), ...ambiguous, ...ambiguous,
    ...unresolvedNames.map(selectedPackage)],
    unresolved: [{ source: 'node_modules/synthetic/parent.mjs', kind: 'import', reason: 'conditional-input-unresolved' },
      ...unresolvedNames.map(target => ({ target, reason: 'conditional-selection-unresolved' }))] };
  const admission = buildPackageAdmission(manifest, [...names, ...deniedNames].map(reviewedPackage));
  const helper = resolve(__dirname, '../../scripts/staged-backend-review.cjs');
  const runner = join(stage, 'check.cjs');
  writeFileSync(runner, `const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { installPackageAdmissionHooks } = require(${JSON.stringify(helper)});
const admission = ${JSON.stringify(admission)};
installPackageAdmissionHooks(__dirname, admission);
(async () => {
  assert.equal((await import('./node_modules/synthetic/approved.mjs')).value, 7);
  assert.equal(require('./node_modules/synthetic/approved.cjs'), 7);
  for (const name of ['unlisted.mjs', 'parent.mjs', 'missing.mjs', 'ambiguous.mjs', 'unresolved.mjs'])
    await assert.rejects(import(pathToFileURL(path.join(__dirname, 'node_modules/synthetic', name)).href), {code:'PACKAGE_FILE_DENIED'});
  for (const name of ['unlisted.cjs', 'parent.cjs', 'missing.cjs', 'ambiguous.cjs', 'unresolved.cjs'])
    assert.throws(() => require('./node_modules/synthetic/' + name), {code:'PACKAGE_FILE_DENIED'});
  assert.equal(globalThis.unlistedExecuted, undefined);
})().catch(error => { console.error(error); process.exitCode = 1; });`);
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
  const child = spawnSync(process.execPath, ['--no-addons', '--no-experimental-strip-types', runner],
    { env, cwd: stage, shell: false, windowsHide: true, timeout: 10000, encoding: 'utf8' });
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
  console.log('Package admission fixture: ' + stage);
});

test('selected dependency requests preserve exported subpaths and unexercised importer evidence', () => {
  const source = 'node_modules/parent/index.cjs', unreviewed = 'node_modules/parent/browser.cjs';
  const manifest = { packages: [{ path: 'node_modules/parent' }, { path: 'node_modules/parent/node_modules/nested' }],
    dependencies: [{ parent: 'node_modules/parent', name: 'subonly', classification: 'required' }],
    candidates: [selectedPackage(source)], unresolved: [] };
  const inventory = { references: [
    { source, specifier: 'subonly/get', kind: 'require', line: 1, typeOnly: false },
    { source: unreviewed, specifier: 'subonly/browser', kind: 'require', line: 2 },
    { source: 'node_modules/parent/node_modules/nested/index.cjs', specifier: 'subonly/nested', kind: 'require', line: 3 },
    { source, specifier: 'subonly/types', kind: 'import', line: 4, typeOnly: true },
  ] };
  const [edge] = selectedDependencyRequests(manifest, inventory, buildPackageAdmission(manifest, [reviewedPackage(source)]));
  assert.deepEqual(edge.requests.map(r => r.specifier), ['subonly/get']);
  assert.deepEqual(edge.unexercisedReferences.map(r => r.specifier), ['subonly/browser']);
  assert.equal(edge.requests[0].line, 1);
});

test('conditional package exports and subpath-only packages resolve without admitting alternatives', () => {
  const stage = mkdtempSync(join(tmpdir(), 'discovery-conditional-resolution-'));
  const pkg = join(stage, 'node_modules/synthetic'); mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ type: 'module', exports: {
    '.': { browser: './browser.mjs', import: './entry.mjs', require: './entry.cjs' },
    './unlisted': './browser.mjs', './missing': './missing.cjs', './dependency': './dependency.cjs' } }));
  writeFileSync(join(pkg, 'entry.cjs'), 'module.exports = 7;');
  writeFileSync(join(pkg, 'entry.mjs'), "import value from './entry.cjs'; export default value;");
  writeFileSync(join(pkg, 'browser.mjs'), 'globalThis.alternativeExecuted = true; export default 0;');
  writeFileSync(join(pkg, 'dependency.cjs'), "module.exports = require('missing-synthetic-dependency');");
  const sub = join(stage, 'node_modules/subonly'); mkdirSync(sub);
  writeFileSync(join(sub, 'package.json'), JSON.stringify({ exports: { './get': './get.cjs' } }));
  writeFileSync(join(sub, 'get.cjs'), 'module.exports = 9;');
  const names = ['node_modules/synthetic/entry.cjs', 'node_modules/synthetic/entry.mjs',
    'node_modules/synthetic/dependency.cjs', 'node_modules/subonly/get.cjs'];
  const manifest = { candidates: [...names, 'node_modules/synthetic/browser.mjs'].map(selectedPackage), unresolved: [] };
  const admission = buildPackageAdmission(manifest, names.map(reviewedPackage));
  const runner = join(stage, 'check.cjs');
  writeFileSync(runner, `const assert = require('node:assert/strict');
const {installPackageAdmissionHooks} = require(${JSON.stringify(resolve(__dirname, '../../scripts/staged-backend-review.cjs'))});
installPackageAdmissionHooks(__dirname, ${JSON.stringify(admission)});
(async () => {
  if (process.argv[2] === 'browser') {
    assert.throws(() => require('synthetic'), {code:'PACKAGE_FILE_DENIED'});
    await assert.rejects(import('synthetic'), {code:'PACKAGE_FILE_DENIED'});
  } else {
    assert.equal(require('synthetic'), 7); assert.equal((await import('synthetic')).default, 7);
    assert.equal(require('subonly/get'), 9); assert.equal((await import('subonly/get')).default, 9);
    assert.throws(() => require.resolve('subonly'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
    for (const mode of ['require','import']) {
      if (mode === 'require') {
        assert.throws(() => require('synthetic/unlisted'), {code:'PACKAGE_FILE_DENIED'});
        assert.throws(() => require('synthetic/missing'), {code:'MODULE_NOT_FOUND'});
        assert.throws(() => require('synthetic/dependency'), {code:'MODULE_NOT_FOUND'});
      } else {
        await assert.rejects(import('synthetic/unlisted'), {code:'PACKAGE_FILE_DENIED'});
        await assert.rejects(import('synthetic/missing'), {code:'ERR_MODULE_NOT_FOUND'});
        await assert.rejects(import('synthetic/dependency'), {code:'MODULE_NOT_FOUND'});
      }
    }
  }
  assert.equal(globalThis.alternativeExecuted, undefined);
})().catch(error => {console.error(error);process.exitCode=1;});`);
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap(k => process.env[k] ? [[k, process.env[k]]] : []));
  for (const args of [[runner], ['--conditions=browser', runner, 'browser']]) {
    const child = spawnSync(process.execPath, ['--no-addons', '--no-experimental-strip-types', ...args],
      { cwd: stage, env, windowsHide: true, shell: false, timeout: 10000, encoding: 'utf8' });
    assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
  }
});

test('classification preserves unknown package roles, exclusions and entrypoint evidence', () => {
  const candidates = [
    { source: 'src/server/index.ts', output: 'src/server/index.js', status: 'transpiled', selectionReasons: ['observed-backend-reference'] },
    { source: 'src/shared/camera_access.ts', output: 'src/shared/camera_access.js', status: 'transpiled', selectionReasons: ['observed-backend-reference'] },
    { source: 'node_modules/package/test.js', output: 'node_modules/package/test.js', status: 'copied-candidate', selectionReasons: ['member-of-selected-lock-package:node_modules/package'] },
    { source: 'dist/ui.js', output: 'dist/ui.js', status: 'copied-candidate', selectionReasons: ['observed-module-url-directory:src/server/index.ts'] },
  ];
  const inventory = { files: candidates.map(c => ({ path: c.source, annotation: { reachability: { evidence:
    c.source.startsWith('src/') ? [{ dependencyUse: 'runtime-candidate', entrypoint: 'src/server/index.ts' }] : [] } } })) };
  const classification = classifyOutputs({ candidates }, inventory, { loadedModules: ['src/shared/camera_access.js'],
    baselineLoadedModules: [], successfulProjectImports: ['src/shared/camera_access.js'] });
  assert.equal(classification.records.length, 4);
  const entry = classification.records.find(r => r.output === 'src/server/index.js');
  assert.equal(entry.category, 'excluded-real-entrypoint'); assert.equal(entry.priority, 'backend-first');
  assert.match(entry.reason, /timers.*recovery.*initialization/);
  const unknown = classification.records.find(r => r.output.endsWith('/test.js'));
  assert.equal(unknown.category, 'package-member-or-other-unknown'); assert.equal(unknown.runtimeReachability, 'unknown');
  assert.match(unknown.reason, /roles remain uncertain/); // Filename never establishes test-only exclusion.
  assert.equal(classification.previouslyUntested.additionallyLoaded, 1);
  assert.equal(classification.remaining.count, 3);
  assert.ok(classification.records.every(r => r.safetyVerified === false && r.productionAuthority === false));
});

test('fresh staged JavaScript loads through isolated Node with synthetic services and no TSX/esbuild', () => {
  const base = mkdtempSync(join(tmpdir(), 'discovery-loading-harness-'));
  const stage = join(base, 'stage');
  // Poisoned child preload settings must be removed, never resolved or executed.
  const names = ['NODE_OPTIONS', 'NODE_PATH', 'NODE_PRELOAD', 'NODE_LOADER', 'TSX_TSCONFIG_PATH', 'ESBUILD_BINARY_PATH'];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  let report;
  try {
    for (const name of names) process.env[name] = name === 'NODE_OPTIONS' ? '--require=DO_NOT_LOAD' : 'DO_NOT_LOAD';
    report = runLoadingHarness(resolve(__dirname, '../..'), stage);
  } finally {
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
  console.log('Loading report: ' + join(stage, 'loading-report.json'));
  console.log('Runtime: ' + JSON.stringify(report.probe.runtime));
  assert.equal(report.passed, true, JSON.stringify({ failures: report.probe.failures, stderr: report.stderr, error: report.launchError }));
  assert.ok(report.probe.checks.length > 10);
  assert.deepEqual(report.probe.blockedOperations, []);
  assert.equal(report.probe.realEntrypointImported, false);
  assert.equal(report.probe.tsxEsbuildUnavailable, true);
  assert.ok(report.probe.loadedModules.includes('src/server/foreground_discovery_routes.js'));
  assert.ok(report.probe.loadedModules.includes('src/server/production_authentication_boundary.js'));
  assert.ok(report.probe.loadedModules.some(name => name.startsWith('node_modules/ws/')));
  assert.ok(!report.probe.loadedModules.includes('src/server/index.js'));
  assert.ok(report.unexercisedSelectedOutputs.includes('src/server/index.js'));
  assert.ok(report.stageUnresolvedCount > 0);
  assert.equal(report.packageAdmission.completeClosure, false);
  assert.equal(report.packageAdmission.productionAuthority, false);
  assert.equal(report.packageAdmission.unresolved.length, report.stageUnresolvedCount);
  const admitted = new Set(report.packageAdmission.admitted.map(r => r.path));
  assert.ok(report.probe.loadedModules.filter(n => n.startsWith('node_modules/')).every(n => admitted.has(n)));
  assert.ok(report.packageAdmission.admitted.every(r => r.selectionReasons.length && r.reviewReason));
  assert.ok(report.packageAdmission.denied.length > 0);
  assert.ok(report.coverageClassification.previouslyUntested.additionallyLoaded > 0);
  assert.equal(report.coverageClassification.remaining.count, report.unexercisedSelectedOutputs.length);
  assert.ok(report.coverageClassification.records.every(r => r.reason && r.productionAuthority === false));
  assert.ok(report.probe.loadedModules.includes('src/core/storage/project_db.js'));
  assert.ok(report.probe.loadedModules.includes('src/core/network/windows_adapter_service.js'));
  assert.ok(report.probe.loadedModules.includes('src/core/readiness/field_readiness.js'));
  assert.equal(report.probe.stagedComposition, true);
  assert.ok(report.startupBlockers.some(r => r.includes('credential initialization')));
  assert.equal(report.productionAuthority, false); assert.equal(report.completeClosure, false);
  const manifest = JSON.parse(readFileSync(join(stage, 'stage-manifest.json'), 'utf8'));
  assert.equal(manifest.runtimeValidated, false); assert.equal(manifest.productionAuthority, false);
});
