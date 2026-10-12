import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const { inventory, annotateReachability } = createRequire(import.meta.url)('../../scripts/dependency-inventory.cjs');
function fixture(run: (root: string, put: (name: string, contents: string) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'discovery-inventory-'));
  const put = (name: string, contents: string) => {
    const full = join(root, name); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, contents);
  };
  put('package.json', '{"dependencies":{}}'); put('package-lock.json', '{"lockfileVersion":3,"packages":{}}');
  put('tsconfig.json', '{}');
  for (const dir of ['src', 'scripts', 'native']) mkdirSync(join(root, dir), { recursive: true });
  try { run(root, put); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('inventory finds module, dynamic, native, WASM and subprocess candidates without executing them', () => fixture((root, put) => {
  put('src/server/index.ts', `import './dep.ts'; import type { X } from './types.ts';
    import('candidate'); import(name); const fake = "import('not-a-call')";
    // import('comment-only')
    new URL('../../native/module.wasm', import.meta.url);
    spawn('powershell.exe', ['-Command', secret]); execFile(executable, []);
    require('node:fs'); readFile(computedAsset);`);
  put('src/server/dep.ts', 'export const x = 1;'); put('src/server/types.ts', 'export type X = string;');
  put('native/module.wasm', 'fixture'); put('native/host.exe', 'fixture');
  put('native/Host.cs', '[DllImport("kernel32.dll")] static void Call();');
  put('native/Host.csproj', '<Project><PackageReference Include="Native.Package" Version="1" /></Project>');
  put('scripts/helper.ps1', 'Write-Output "fixture"');
  put('package.json', '{"dependencies":{"candidate":"1.0.0"}}');
  put('package-lock.json', '{"packages":{"node_modules/candidate":{"version":"1.0.0","hasInstallScript":true}}}');
  put('node_modules/candidate/package.json', '{"main":"index.js"}');
  put('node_modules/candidate/index.js', `require('node:fs').writeFileSync(${JSON.stringify(join(root, 'EXECUTED'))}, 'bad');`);
  const result = inventory(root);
  assert.equal(result.productionAuthority, false); assert.equal(result.completeVerification, false);
  assert.equal(result.informationalOnly, true); assert.equal(result.runtime.approved, false);
  assert.ok(result.files.some((f: any) => f.path === 'native/module.wasm' && f.kind === 'wasm-asset'));
  assert.ok(result.files.some((f: any) => f.path === 'native/host.exe' && f.kind === 'native-asset'));
  assert.ok(result.references.some((r: any) => r.kind === 'dynamic-import' && r.resolvedPath === 'node_modules/candidate/index.js'));
  assert.ok(result.references.some((r: any) => r.specifier === './types.ts' && r.typeOnly));
  assert.ok(result.references.some((r: any) => r.kind === 'native-library' && r.specifier === 'kernel32.dll'));
  assert.ok(result.references.some((r: any) => r.kind === 'subprocess' && r.specifier === 'powershell.exe'));
  assert.ok(result.unresolved.some((r: any) => r.kind === 'dynamic-import' && r.reason === 'computed-input'));
  assert.ok(result.unresolved.some((r: any) => r.kind === 'file-input' && r.reason === 'computed-input'));
  assert.ok(result.unresolved.some((r: any) => r.reason === 'install-script-generated-inputs-not-verified'));
  assert.ok(result.unresolved.some((r: any) => r.reason === 'package-conditions-and-runtime-resolution-unverified'));
  assert.ok(!result.references.some((r: any) => ['not-a-call', 'comment-only'].includes(r.specifier)));
  assert.ok(!existsSync(join(root, 'EXECUTED')));
  assert.ok(!JSON.stringify(result).includes('-Command'));
}));

test('missing imports, external paths, absent packages and broken metadata are explicit', () => fixture((root, put) => {
  put('src/input.ts', "import './missing.ts'; import('../../outside.ts'); import('absent-package');");
  put('package-lock.json', 'invalid JSON');
  const result = inventory(root);
  assert.ok(result.unresolved.some((r: any) => r.reason === 'path-not-resolved'));
  assert.ok(result.unresolved.some((r: any) => r.kind === 'metadata'));
  assert.ok(result.unresolved.some((r: any) => r.reason === 'lockfile-packages-unavailable'));
}));

test('cycles terminate and output is repeatable without changing inspected files', () => fixture((root, put) => {
  put('src/a.ts', "import './b.ts';"); put('src/b.ts', "import './a.ts';");
  const before = readFileSync(join(root, 'src/a.ts'), 'utf8');
  const one = inventory(root); const two = inventory(root);
  assert.deepEqual(one, two);
  assert.equal(one.files.filter((f: any) => f.path === 'src/a.ts').length, 1);
  assert.equal(readFileSync(join(root, 'src/a.ts'), 'utf8'), before);
}));

test('scan bounds and oversized code report partial analysis', () => fixture((root, put) => {
  put('src/a.ts', ' '.repeat(300)); put('src/b.ts', "import('hidden');");
  assert.ok(inventory(root, { maxTextBytes: 100 }).unresolved.some((r: any) => r.reason === 'text-size-limit'));
  const bounded = inventory(root, { maxFiles: 1 });
  assert.equal(bounded.files.length, 1);
  assert.ok(bounded.unresolved.some((r: any) => r.reason === 'file-limit'));
}));

test('deep dependency expressions cannot overflow the AST inventory traversal', () => fixture((root, put) => {
  put('src/deep.js', Array(15000).fill('a').join('+') + "; import('missing-after-expression');");
  const result = inventory(root);
  assert.ok(result.references.some((r: any) => r.specifier === 'missing-after-expression'));
  assert.ok(!result.unresolved.some((r: any) => r.reason === 'parser-failure-partial-analysis'));
}));

test('directory junctions are flagged and not followed', () => fixture((root, put) => {
  put('external/hidden.ts', "import('never-scan');");
  symlinkSync(join(root, 'external'), join(root, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = inventory(root);
  assert.ok(result.unresolved.some((r: any) => r.source === 'src/linked' && r.reason === 'symlink-not-followed'));
  assert.ok(!result.files.some((f: any) => f.path.includes('hidden.ts')));
}));

test('CLI emits a standalone non-authorizing report without creating output files', () => fixture(root => {
  const result = spawnSync(process.execPath, ['scripts/dependency-inventory.cjs', root], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).productionAuthority, false);
  assert.equal(result.stderr, '');
}));

test('annotations observe explicit paths, mixed roles, dynamic candidates and cycles without filename inference', () => {
  const report = {
    informationalOnly: true, productionAuthority: false, completeVerification: false,
    files: ['prod.ts', 'test.ts', 'shared.test.ts', 'dynamic.ts', 'unrelated.ts', 'node_modules/installed/index.js'].map(path => ({ path })),
    references: [
      { source: 'prod.ts', resolvedPath: 'shared.test.ts', resolution: 'local-candidate', kind: 'static-import', line: 1 },
      { source: 'test.ts', resolvedPath: 'shared.test.ts', resolution: 'local-candidate', kind: 'static-import', line: 2 },
      { source: 'shared.test.ts', resolvedPath: 'dynamic.ts', resolution: 'local-candidate', kind: 'dynamic-import', line: 3 },
      { source: 'dynamic.ts', resolvedPath: 'prod.ts', resolution: 'local-candidate', kind: 'static-import', line: 4 },
    ], unresolved: [], limits: ['original limit'],
  };
  const result = annotateReachability(report, [{ role: 'production-backend', path: 'prod.ts' }, { role: 'test', path: 'test.ts' }]);
  const shared = result.files.find((file: any) => file.path === 'shared.test.ts');
  assert.deepEqual(shared.annotation.roles, ['production-backend', 'test']);
  assert.equal(shared.annotation.reachability.status, 'observed');
  assert.ok(result.files.find((file: any) => file.path === 'dynamic.ts').annotation.reachability.evidence.some((e: any) => e.via === 'dynamic-import'));
  for (const name of ['unrelated.ts', 'node_modules/installed/index.js']) {
    const annotation = result.files.find((file: any) => file.path === name).annotation;
    assert.equal(annotation.reachability.status, 'unknown'); assert.deepEqual(annotation.roles, []);
  }
  assert.deepEqual(result, annotateReachability(report, [{ role: 'production-backend', path: 'prod.ts' }, { role: 'test', path: 'test.ts' }]));
});

test('annotations preserve original candidates, flags, limits and no-trust fields', () => {
  const report = {
    informationalOnly: true, productionAuthority: false, completeVerification: false,
    files: [{ path: 'entry.ts', scope: 'project-candidate' }, { path: 'unknown.dll', kind: 'native-asset' }],
    references: [{ source: 'entry.ts', kind: 'dynamic-import', specifier: '<computed>' }],
    unresolved: [{ source: 'entry.ts', reason: 'computed-input' }, { source: 'unknown.dll', reason: 'unverified-native' }],
    limits: ['keep every analysis limit'], packages: [{ path: 'node_modules/example' }],
  };
  const before = JSON.stringify(report);
  const result = annotateReachability(report, [{ role: 'development', path: 'entry.ts' }]);
  assert.equal(JSON.stringify(report), before);
  assert.deepEqual(result.files.map(({ annotation, ...file }: any) => file), report.files);
  assert.deepEqual(result.references.map(({ sourceAnnotation, ...ref }: any) => ref), report.references);
  assert.deepEqual(result.unresolved.map(({ sourceAnnotation, ...flag }: any) => flag), report.unresolved);
  assert.deepEqual(result.limits, report.limits); assert.deepEqual(result.packages, report.packages);
  assert.equal(result.productionAuthority, false); assert.equal(result.completeVerification, false);
  assert.equal(result.unresolved[0].sourceAnnotation.reachability.status, 'observed');
  assert.equal(result.unresolved[1].sourceAnnotation.reachability.status, 'unknown');
});

test('annotations retain type-only evidence and cannot promote unresolved hints to reachability', () => {
  const report = {
    files: ['entry.ts', 'types.ts', 'child.ts', 'hint.ts'].map(path => ({ path })),
    references: [
      { source: 'entry.ts', resolvedPath: 'types.ts', resolution: 'local-candidate', kind: 'static-import', typeOnly: true },
      { source: 'types.ts', resolvedPath: 'child.ts', resolution: 'local-candidate', kind: 'static-import' },
      { source: 'entry.ts', resolvedPath: 'hint.ts', kind: 'require' },
    ], unresolved: [], limits: [],
  };
  const result = annotateReachability(report, [{ role: 'production-backend', path: 'entry.ts' }, { role: 'build', path: 'missing.ts' }]);
  for (const name of ['types.ts', 'child.ts']) {
    assert.deepEqual(result.files.find((f: any) => f.path === name).annotation.reachability.evidence.map((e: any) => e.dependencyUse), ['type-only']);
  }
  assert.equal(result.files.find((f: any) => f.path === 'hint.ts').annotation.reachability.status, 'unknown');
  assert.deepEqual(result.annotationIssues, [{ entrypoint: 'build:missing.ts', reason: 'entrypoint-not-inventoried', status: 'unknown' }]);
  assert.throws(() => annotateReachability(report, [{ role: 'build', path: '../outside.ts' }]));
  assert.throws(() => annotateReachability(report, [{ role: 'build', path: 'C:/outside.ts' }]));
});

test('annotations CLI accepts explicit roots and roles without silently applying defaults', () => fixture((root, put) => {
  put('src/server/index.ts', "import './shared.ts';"); put('src/server/shared.ts', 'export const x = 1;');
  put('scripts/build.cjs', "require('../src/server/shared.ts');");
  const result = spawnSync(process.execPath, ['scripts/dependency-inventory.cjs', root,
    '--entry', 'production-backend:src/server/index.ts', '--entry', 'build:scripts/build.cjs'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.entrypoints.length, 2); assert.equal(report.annotationIssues.length, 0);
  assert.deepEqual(report.files.find((f: any) => f.path === 'src/server/shared.ts').annotation.roles, ['build', 'production-backend']);
  assert.equal(report.productionAuthority, false);
}));

test('child-process bindings recognize ESM aliases, namespace/default imports and CommonJS destructuring', () => fixture((root, put) => {
  put('src/calls.ts', `import { spawn as launch, execFile as require } from 'node:child_process';
    import * as cp from 'child_process'; import defaultCp from 'node:child_process';
    launch('node.exe'); require('helper.exe'); cp.spawnSync('sync.exe'); defaultCp.execFile('default.exe');
    const { execFileSync: run } = globalRequire('not-confirmed');
    const { spawn: start } = requireShadow('node:child_process');`);
  put('scripts/common.cjs', `const {spawn: launch} = require('node:child_process');
    var child_process = require('child_process'); const copy = child_process;
    const run = copy.execFile; launch('a.exe'); child_process.spawn('b.exe'); run('c.exe');`);
  const result = inventory(root, { entrypoints: [] });
  const calls = result.references.filter((r: any) => r.kind === 'subprocess');
  assert.equal(calls.length, 7);
  assert.ok(calls.every((r: any) => r.childProcessBinding.status === 'confirmed'));
  assert.deepEqual(calls.map((r: any) => r.executableArgument.value).sort(), ['a.exe', 'b.exe', 'c.exe', 'default.exe', 'helper.exe', 'node.exe', 'sync.exe']);
  assert.equal(result.productionAuthority, false);
}));

test('child-process bindings respect parameter, block, hoisted and require shadowing', () => fixture((root, put) => {
  put('src/shadow.ts', `import { spawn } from 'node:child_process'; import * as cp from 'node:child_process';
    import { execFile as launch } from 'child_process'; function aliasShadow(launch) { launch('shadow-alias.exe'); }
    function f(spawn, cp) { spawn('parameter.exe'); cp.exec('parameter-command'); }
    { spawn('before-local.exe'); const spawn = custom; }
    function g() { spawn('hoisted.exe'); var spawn = custom; }
    function h(require) { const cp = require('child_process'); cp.spawn('shadow-require.exe'); }
    spawn('real.exe'); const pattern = /x/; pattern.exec(input);`);
  const result = inventory(root, { entrypoints: [] });
  const calls = result.references.filter((r: any) => r.kind === 'subprocess');
  assert.equal(calls.filter((r: any) => r.childProcessBinding.status === 'confirmed').length, 1);
  assert.equal(calls.find((r: any) => r.specifier === 'real.exe').childProcessBinding.status, 'confirmed');
  assert.equal(calls.filter((r: any) => r.childProcessBinding.status === 'ambiguous').length, 7);
  assert.equal(calls.find((r: any) => r.specifier === 'shadow-alias.exe').childProcessBinding.status, 'ambiguous');
  assert.ok(result.unresolved.some((u: any) => u.reason === 'ambiguous-child-process-binding'));
  assert.ok(result.unresolved.some((u: any) => u.reason === 'computed-input'));
}));

test('child-process bindings resolve const strings while retaining computed evidence and unknown executable identity', () => fixture((root, put) => {
  put('scripts/start.cjs', `const { spawn, exec } = require('node:child_process');
    const part = 'node'; const executable = part + '.exe'; const alias = executable;
    spawn(alias); spawn(process.execPath); spawn(getBinary()); exec('echo fixture');
    let mutable = 'mutable.exe'; spawn(mutable);`);
  const result = inventory(root, { entrypoints: [] });
  const calls = result.references.filter((r: any) => r.kind === 'subprocess');
  const resolved = calls.find((r: any) => r.executableArgument.value === 'node.exe');
  assert.equal(resolved.specifier, '<computed>');
  assert.equal(resolved.childProcessBinding.status, 'confirmed');
  assert.ok(result.unresolved.some((u: any) => u.line === resolved.line && u.reason === 'computed-input'));
  assert.equal(calls.filter((r: any) => r.executableArgument.status === 'computed').length, 3);
  assert.equal(calls.find((r: any) => r.specifier === 'echo fixture').argumentMeaning, 'shell-command-text');
  assert.ok(calls.every((r: any) => !r.resolvedPath));
  assert.equal(result.completeVerification, false);
}));

test('child-process bindings invalidate reassigned aliases and namespace methods without executing commands', () => fixture((root, put) => {
  put('scripts/calls.cjs', `const cp = require('child_process'); cp.spawn = fake; cp.spawn('mutated.exe');
    const {spawn} = require('child_process'); spawn = fake; spawn('assigned.exe');
    const executable = 'original.exe'; ({executable} = supplied); const cp2 = require('child_process'); cp2.spawn(executable);`);
  const result = inventory(root, { entrypoints: [] });
  const calls = result.references.filter((r: any) => r.kind === 'subprocess');
  assert.equal(calls.filter((r: any) => r.childProcessBinding.status === 'ambiguous').length, 2);
  const confirmed = calls.find((r: any) => r.childProcessBinding.status === 'confirmed');
  assert.equal(confirmed.executableArgument.status, 'computed');
  assert.ok(result.unresolved.some((u: any) => u.reason === 'computed-input'));
  assert.deepEqual(result.runtime.approved, false);
}));
