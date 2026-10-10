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
  assert.deepEqual(JSON.parse(result.stdout), { v: 1, type: 'LAUNCHER_SELF_TEST_OK', cases: 21, checks: 42 });
  assert.doesNotMatch(result.stdout + result.stderr, /session_|bootstrap_|nonce|stack/i);
});

test('launcher entry points reject arbitrary executables and malformed invocation', () => {
  for (const args of [['--launcher-peer', 'invalid', '1', 'normal'], ['--launcher', 'node.exe'],
    ['--launcher-self-test', 'unexpected']]) {
    const result = spawnSync(APPLICATION_COMPANION_PATH, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(result.error, undefined); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
});

test('native ownership foundation has no production or 18C.7Q authority attachment path', async () => {
  const [production, startup, native, owned] = await Promise.all([
    readFile(new URL('../server/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/start-production.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../../native/ApplicationCompanion/NativeLauncherLease.cs', import.meta.url), 'utf8'),
    readFile(new URL('../../native/ApplicationCompanion/OwnedChild.cs', import.meta.url), 'utf8'),
  ]);
  assert.match(production, /new ProductionAuthenticationBoundary\(\)/);
  assert.doesNotMatch(production + startup, /NativeLauncherLease|launcher-peer|launcher-self-test|BackendIdentityHandoff/);
  assert.doesNotMatch(native, /Console\.(Write|Error)|session_|bootstrap_|ProcessStartInfo|node\.exe/);
  // The only launcher arguments are nonsecret routing metadata and an allowlisted fixture mode.
  assert.match(owned, /--launcher-peer \{pipe\} \{Environment\.ProcessId\} \{mode\}/);
  assert.match(owned, /false, 0x4 \| 0x08000000 \| 0x80000/);
});
