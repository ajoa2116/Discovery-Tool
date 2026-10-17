import { productionBackendSource } from './support/backend_source.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { APPLICATION_COMPANION_PATH } from '../server/application_companion_supervisor.ts';

test('native launcher verifies real private peers, one-use bindings, loss and cleanup', () => {
  assert.equal(process.platform, 'win32');
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--launcher-self-test'], {
    encoding: 'utf8', timeout: 45000, windowsHide: true,
  });
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { v: 1, type: 'LAUNCHER_SELF_TEST_OK', cases: 30, checks: 105 });
  assert.doesNotMatch(result.stdout + result.stderr, /session_|bootstrap_|nonce|stack/i);
});

test('launcher entry points reject arbitrary executables and malformed invocation', () => {
  for (const args of [['--launcher-peer', 'invalid', '1', 'normal'], ['--launcher', 'node.exe'],
    ['--launcher-self-test', 'unexpected'], ['--launcher-self-test', '--diagnostics', 'unexpected']]) {
    const result = spawnSync(APPLICATION_COMPANION_PATH, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(result.error, undefined); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
});

test('launcher self-test diagnostics retain check locations and exact denial classifications without secrets', () => {
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--launcher-self-test', '--diagnostics'], {encoding:'utf8', timeout:45000, windowsHide:true});
  assert.equal(result.error, undefined); assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {v:1,type:'LAUNCHER_SELF_TEST_OK',cases:30,checks:105});
  const trace=JSON.parse(result.stderr);
  assert.equal(trace.type,'NATIVE_SELF_TEST_DIAGNOSTIC'); assert.equal(trace.test,'launcher');
  assert.equal(trace.outcome,'passed'); assert.equal(trace.checks,105); assert.equal(trace.exception,null);
  assert.ok(trace.events.every((e:any)=>Number.isInteger(e.line)&&e.line>0&&e.elapsedMs>=0));
  assert.equal(trace.events.filter((e:any)=>e.operation==='check').length,105);
  assert.ok(trace.events.filter((e:any)=>e.operation==='denial').every((e:any)=>e.expected===e.actual));
  assert.doesNotMatch(result.stderr,/cctv-application-|session_|bootstrap_|[A-Z]:\\|"stack"|"key"|"signature"\s*:/);
});

test('native ownership foundation has no production or 18C.7Q authority attachment path', async () => {
  const [production, startup, native, owned] = await Promise.all([
    productionBackendSource(),
    readFile(new URL('../../scripts/start-production.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../../native/ApplicationCompanion/NativeLauncherLease.cs', import.meta.url), 'utf8'),
    readFile(new URL('../../native/ApplicationCompanion/OwnedChild.cs', import.meta.url), 'utf8'),
  ]);
  assert.match(production, /new ProductionAuthenticationBoundary\(\)/);
  assert.doesNotMatch(production + startup, /NativeLauncherLease|launcher-peer|launcher-self-test|BackendIdentityHandoff/);
  assert.doesNotMatch(native, /Console\.(Write|Error)|session_|bootstrap_|ProcessStartInfo|node\.exe/);
  // The only launcher arguments are nonsecret routing metadata and an allowlisted fixture mode.
  assert.match(owned, /--launcher-peer \{pipe\} \{Environment\.ProcessId\} \{mode\}/);
  assert.match(owned, /inheritedOwner is not null, 0x4 \| 0x08000000 \| 0x80000/);
  assert.match(owned, /SafeFileHandle\? inheritedOwner = null/);
  assert.match(owned, /0x20002 \/\* HANDLE_LIST \*\//);
  assert.match(owned, /0x1000 \| 0x100000 \/\* QUERY_LIMITED_INFORMATION, SYNCHRONIZE only/);
});

test('pre-resume source ordering preserves retained ownership and default-deny', async () => {
  // Static assertions only: no native process is launched by this test body.
  const owned = await readFile(new URL('../../native/ApplicationCompanion/OwnedChild.cs', import.meta.url), 'utf8');
  const start = owned.slice(owned.indexOf('private static OwnedChild StartOwned('), owned.indexOf('private void RequirePreResumeOwnership('));
  const markers = ['if (!IsProcessInJob(handle, ownedJob', 'beforeResume?.Invoke(owned)',
    'owned.RequirePreResumeOwnership()', 'if (ResumeThread(', 'return owned;'];
  let previous = -1;
  for (const marker of markers) {
    const index = start.indexOf(marker);
    assert.ok(index > previous, marker); previous = index;
  }
  const guard = owned.slice(owned.indexOf('private void RequirePreResumeOwnership('), owned.indexOf('internal static OwnedChild StartIntegratedFixture('));
  assert.match(guard, /Volatile.Read\(ref disposed\) != 0/);
  assert.match(guard, /processHandle.IsClosed \|\| processHandle.IsInvalid \|\| job.IsClosed \|\| job.IsInvalid/);
  assert.match(guard, /WaitForSingleObject\(processHandle, 0\) != 0x102/);
  assert.match(guard, /if \(!IsProcessInJob\(processHandle, job, out bool member\)\) throw/);
  assert.match(guard, /if \(!member\) throw/);
  assert.doesNotMatch(guard, /GetProcessById|OpenProcess|DangerousGetHandle|MatchImageFile|ProductionAuthority/);
  assert.match(start, /handle is \{ IsClosed: false, IsInvalid: false \}/);
  assert.match(start, /using var thread = new SafeFileHandle\(info.Thread, true\)/);
});
