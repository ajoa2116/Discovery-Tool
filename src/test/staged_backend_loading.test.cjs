const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { runLoadingHarness } = require('../../scripts/staged-backend-loading.cjs');
const { classifyOutputs } = require('../../scripts/staged-backend-review.cjs');

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
