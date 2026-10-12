import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';

const { stageBackend } = createRequire(import.meta.url)('../../scripts/stage-backend.cjs');
function fixture(run: (root: string, out: string, put: (file: string, text: string) => void) => void) {
  const base = mkdtempSync(join(tmpdir(), 'discovery-backend-stage-'));
  const root = join(base, 'checkout'), out = join(base, 'stage');
  const put = (file: string, text: string) => {
    const full = join(root, file); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, text);
  };
  for (const dir of ['src/server', 'scripts', 'native']) mkdirSync(join(root, dir), { recursive: true });
  put('package.json', '{"version":"1.6.0","type":"module","scripts":{"start":"DO_NOT_RUN"}}');
  put('package-lock.json', '{"packages":{}}'); put('tsconfig.json', '{}');
  try { run(root, out, put); }
  finally {
    const target = resolve(base), tempRelative = relative(resolve(tmpdir()), target);
    assert.ok(tempRelative && !tempRelative.startsWith('..') && !isAbsolute(tempRelative));
    rmSync(target, { recursive: true, force: true });
  }
}

test('staging transpiles JavaScript with preserved layout, rewritten imports and no runtime/helper execution', () => fixture((root, out, put) => {
  put('src/server/index.ts', `import { value } from './dep.ts'; export const answer: number = value;
    import('./conditional.ts'); import(computed); const helper = new URL('../../scripts/helper.ps1', import.meta.url);
    const host = new URL('../../native/host/host.exe', import.meta.url);
    const assets = new URL('../../dist/', import.meta.url);`);
  put('src/server/dep.ts', 'export const value: number = 42;');
  put('src/server/conditional.ts', "throw new Error('NEVER_EXECUTE');");
  put('scripts/helper.ps1', 'throw "NEVER_EXECUTE"');
  put('native/host/host.exe', 'not an executable'); put('native/host/library.dll', 'fixture');
  put('dist/index.html', '<html>fixture</html>');
  const original = readFileSync(join(root, 'src/server/index.ts'), 'utf8');
  const manifest = stageBackend(root, out);
  const compiled = readFileSync(join(out, 'src/server/index.js'), 'utf8');
  assert.match(compiled, /['"]\.\/dep\.js['"]/); assert.match(compiled, /['"]\.\/conditional\.js['"]/);
  assert.doesNotMatch(compiled, /answer: number/);
  assert.equal(readFileSync(join(root, 'src/server/index.ts'), 'utf8'), original);
  assert.ok(!existsSync(join(out, 'src/server/index.ts')));
  for (const asset of ['scripts/helper.ps1', 'native/host/host.exe', 'native/host/library.dll', 'dist/index.html']) assert.ok(existsSync(join(out, asset)), asset);
  assert.ok(manifest.unresolved.some((u: any) => u.reason === 'computed-input'));
  assert.ok(manifest.unresolved.some((u: any) => u.reason === 'native-host-loading-closure-unverified'));
  assert.equal(manifest.productionAuthority, false); assert.equal(manifest.completeClosure, false);
  assert.equal(manifest.runtimeValidated, false); assert.equal(manifest.compiler.typeChecked, false);
  assert.equal(manifest.runtime.included, false);
  assert.equal(JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).scripts, undefined);
}));

test('staging selects lock-resolved dependency candidates and records unresolved optional and generated inputs', () => fixture((root, out, put) => {
  put('src/server/index.ts', "import candidate from 'candidate'; export {candidate};");
  put('package.json', '{"version":"1","type":"module","dependencies":{"candidate":"1.0.0"}}');
  put('package-lock.json', JSON.stringify({ packages: {
    'node_modules/candidate': { version: '1.0.0', dependencies: { nested: '2.0.0' }, optionalDependencies: { absent: '1' }, hasInstallScript: true },
    'node_modules/candidate/node_modules/nested': { version: '2.0.0' },
  } }));
  put('node_modules/candidate/package.json', '{"version":"1.0.0","main":"index.js"}');
  put('node_modules/candidate/index.js', "throw Error('NEVER_EXECUTE_PACKAGE');");
  put('node_modules/candidate/runtime.wasm', 'fixture');
  put('node_modules/candidate/node_modules/nested/package.json', '{"version":"2.0.0","main":"index.js"}');
  put('node_modules/candidate/node_modules/nested/index.js', 'module.exports=1;');
  const manifest = stageBackend(root, out);
  assert.equal(manifest.packages.length, 2);
  assert.ok(manifest.packages.find((p: any) => p.path.endsWith('/nested')).selectionReasons.includes('lock-dependency-of:node_modules/candidate'));
  assert.ok(existsSync(join(out, 'node_modules/candidate/runtime.wasm')));
  assert.ok(existsSync(join(out, 'node_modules/candidate/node_modules/nested/index.js')));
  assert.ok(manifest.unresolved.some((u: any) => u.reason === 'dependency-resolution-missing-from-lock'));
  assert.ok(manifest.unresolved.some((u: any) => u.reason === 'installed-generated-inputs-not-verified'));
  assert.ok(manifest.unresolved.some((u: any) => u.reason === 'package-conditions-and-runtime-resolution-unverified'));
}));

test('staging preserves unknown/type-only candidates and original inventory flags', () => fixture((root, out, put) => {
  put('src/server/index.ts', "import type { X } from './types.ts'; import('./missing.ts'); export const x = 1;");
  put('src/server/types.ts', 'export type X = string;'); put('src/unknown.ts', 'export const unknown = 1;');
  const manifest = stageBackend(root, out);
  const report = JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8'));
  for (const name of ['src/server/types.ts', 'src/unknown.ts']) {
    assert.equal(manifest.candidates.find((c: any) => c.source === name).status, 'unselected-unresolved');
    assert.ok(manifest.unresolved.some((u: any) => u.source === name));
  }
  for (const flag of report.unresolved) assert.ok(manifest.unresolved.some((u: any) => JSON.stringify(u) === JSON.stringify(flag)));
  assert.ok(!existsSync(join(out, 'src/unknown.js')));
  assert.equal(report.completeVerification, false);
}));

test('staging refuses checkout/existing/linked output locations and records linked assets', () => fixture((root, out, put) => {
  put('src/server/index.ts', "new URL('../../native/linked/', import.meta.url);");
  put('outside/asset.dll', 'fixture');
  symlinkSync(join(root, 'outside'), join(root, 'native/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => stageBackend(root, join(root, 'stage')));
  mkdirSync(out); writeFileSync(join(out, 'keep'), 'existing');
  assert.throws(() => stageBackend(root, out)); assert.equal(readFileSync(join(out, 'keep'), 'utf8'), 'existing');
  const fresh = out + '-fresh'; const manifest = stageBackend(root, fresh);
  assert.ok(manifest.unresolved.some((u: any) => /linked|unsupported|unresolved/.test(u.reason)));
  assert.ok(!existsSync(join(fresh, 'native/linked/asset.dll')));
}));

test('staging reports missing roots and output collisions without claiming closure', () => fixture((root, out, put) => {
  put('src/server/index.ts', "import './collision.ts'; import './collision.js';");
  put('src/server/collision.ts', 'export const x:number=1;'); put('src/server/collision.js', 'export const x=2;');
  const manifest = stageBackend(root, out, { entrypoints: ['src/server/index.ts', 'src/server/missing.ts'] });
  assert.ok(manifest.unresolved.some((u: any) => u.reason === 'entrypoint-not-inventoried'));
  assert.ok(manifest.unresolved.some((u: any) => u.reason === 'output-path-collision'));
  assert.equal(manifest.status, 'partial-with-failures');
  assert.equal(manifest.productionAuthority, false);
}));

function wsFixture(put: (file: string, text: string) => void, options: { mismatch?: boolean; rethrow?: boolean } = {}) {
  put('src/server/index.ts', "import 'ws'; import(computed); export const x = 1;");
  put('src/unselected.ts', 'import(unknown);');
  const metadata = { name: 'ws', version: '1.0.0', main: 'index.js', dependencies: { required: '1', missing: '1' },
    peerDependencies: { bufferutil: '^4', 'utf-8-validate': '>=5' },
    peerDependenciesMeta: { bufferutil: { optional: true }, 'utf-8-validate': { optional: true } } };
  put('package-lock.json', JSON.stringify({ packages: {
    'node_modules/ws': { ...metadata, integrity: 'fixture-not-verified' },
    'node_modules/required': { version: '1' },
  } }));
  put('node_modules/ws/package.json', JSON.stringify(options.mismatch ? { ...metadata, peerDependenciesMeta: {} } : metadata));
  put('node_modules/ws/index.js', "require('./lib/buffer-util.js'); require('./lib/validation.js'); throw Error('NEVER_LAUNCH');");
  put('node_modules/required/package.json', '{"name":"required","version":"1","main":"index.js"}');
  put('node_modules/required/index.js', "throw Error('NEVER_LAUNCH');");
  put('node_modules/ws/lib/buffer-util.js', `function _mask() {} function _unmask() {}
    module.exports = { mask: _mask, unmask: _unmask };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try { const addon = require('bufferutil'); module.exports.mask = addon.mask; }
      catch (e) { ${options.rethrow ? 'throw e;' : ''} }
    }`);
  put('node_modules/ws/lib/validation.js', `function _isValidUTF8() { return true; }
    module.exports = { isValidUTF8: _isValidUTF8 };
    if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try { const addon = require('utf-8-validate'); module.exports.isValidUTF8 = addon; }
      catch (e) {}
    }`);
}

test('dependency classification records optional WS fallback locations and preserves missing resolution evidence', () => fixture((root, out, put) => {
  wsFixture(put);
  const manifest = stageBackend(root, out);
  for (const name of ['bufferutil', 'utf-8-validate']) {
    const dep = manifest.dependencies.find((d: any) => d.name === name);
    assert.equal(dep.classification, 'optional-with-observed-fallback');
    assert.equal(dep.declaredRequirement, 'optional');
    assert.equal(dep.resolution.status, 'missing-from-lock');
    assert.equal(dep.evidence.lockfile.source, 'package-lock.json');
    assert.equal(dep.evidence.lockfile.integrity, 'fixture-not-verified');
    assert.equal(dep.evidence.package.source, 'node_modules/ws/package.json');
    assert.equal(dep.evidence.package.peerOptional, true);
    assert.deepEqual(dep.evidence.lockfile.declarations, dep.evidence.package.declarations);
    assert.equal(dep.fallback.length, 1);
    assert.ok(dep.fallback[0].requireLine > 0 && dep.fallback[0].catchLine > dep.fallback[0].requireLine);
    assert.ok(dep.fallback[0].defaults.every((d: any) => d.exportLine > 0 && d.functionLine > 0));
    assert.match(dep.fallback[0].guards[0].expression, /WS_NO_/);
    assert.equal(dep.runtimeVerified, false); assert.equal(dep.safetyVerified, false);
    assert.equal(dep.fallback[0].runtimeVerified, false); assert.equal(dep.fallback[0].safetyVerified, false);
    assert.ok(manifest.unresolved.some((u: any) => u.source === 'node_modules/ws:' + name && u.reason === 'dependency-resolution-missing-from-lock'));
  }
  assert.equal(manifest.dependencies.find((d: any) => d.name === 'required').classification, 'required');
  assert.equal(manifest.dependencies.find((d: any) => d.name === 'missing').classification, 'unresolved');
  assert.ok(manifest.loadingSummary.requiredUnresolvedDependencies.includes('node_modules/ws:missing'));
  assert.equal(manifest.productionAuthority, false); assert.equal(manifest.completeClosure, false); assert.equal(manifest.runtimeValidated, false);
  const inventory = JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8'));
  for (const flag of inventory.unresolved) assert.ok(manifest.unresolved.some((u: any) => JSON.stringify(u) === JSON.stringify(flag)));
}));

test('dependency classification keeps conflicting optional metadata unresolved despite fallback observations', () => fixture((root, out, put) => {
  wsFixture(put, { mismatch: true });
  const manifest = stageBackend(root, out);
  for (const name of ['bufferutil', 'utf-8-validate']) {
    const dep = manifest.dependencies.find((d: any) => d.name === name);
    assert.equal(dep.classification, 'unresolved');
    assert.equal(dep.declaredRequirement, 'conflicting-or-unknown');
    assert.equal(dep.evidence.lockfile.peerOptional, true); assert.equal(dep.evidence.package.peerOptional, false);
    assert.ok(manifest.unresolved.some((u: any) => u.source === 'node_modules/ws:' + name && u.reason === 'dependency-metadata-inconsistent-or-unavailable'));
  }
}));

test('dependency classification requires observed fallback and separates loading review from unknown candidates', () => fixture((root, out, put) => {
  wsFixture(put, { rethrow: true });
  const manifest = stageBackend(root, out);
  const dep = manifest.dependencies.find((d: any) => d.name === 'bufferutil');
  assert.equal(dep.classification, 'unresolved'); assert.equal(dep.declaredRequirement, 'optional'); assert.deepEqual(dep.fallback, []);
  assert.ok(manifest.unresolved.some((u: any) => u.source === 'node_modules/ws:bufferutil' && u.reason === 'optional-dependency-fallback-not-established'));
  const { loadingReview, unselectedInventory, otherInventory } = manifest.loadingSummary;
  assert.equal(loadingReview.count + unselectedInventory.count + otherInventory.count, manifest.unresolved.length);
  assert.ok(loadingReview.records.some((r: any) => r.source === 'src/server/index.ts' && r.reason === 'computed-input'));
  assert.ok(unselectedInventory.records.some((r: any) => r.source === 'src/unselected.ts' && r.reason === 'computed-input'));
  assert.ok(!loadingReview.records.some((r: any) => r.source === 'src/unselected.ts'));
  assert.equal(manifest.candidates.find((c: any) => c.source === 'src/unselected.ts').status, 'unselected-unresolved');
}));
