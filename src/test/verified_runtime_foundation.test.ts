import { productionBackendSource } from './support/backend_source.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { APPLICATION_COMPANION_PATH } from '../server/application_companion_supervisor.ts';

test('native artifact approval rejects substitutions and binds exact owned file/lifetimes', () => {
  assert.equal(process.platform, 'win32');
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--backend-artifact-self-test'], {
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { v: 1, type: 'BACKEND_ARTIFACT_SELF_TEST_OK', cases: 17, checks: 43 });
  assert.doesNotMatch(result.stdout + result.stderr, /session_|bootstrap_|nonce|sha256|stack/i);
});

test('artifact verification has no caller-key or production launcher CLI', () => {
  for (const args of [['--backend-artifact-self-test', 'unexpected'], ['--verify-backend', 'node.exe'],
    ['--backend-trust-key', 'caller-key'], ['--backend-artifact-self-test', '--diagnostics', 'unexpected']]) {
    const result = spawnSync(APPLICATION_COMPANION_PATH, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(result.error, undefined); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
});

test('artifact self-test diagnostics retain check locations and exact denial classifications without secrets', () => {
  const result = spawnSync(APPLICATION_COMPANION_PATH, ['--backend-artifact-self-test', '--diagnostics'], {encoding:'utf8', timeout:30000, windowsHide:true});
  assert.equal(result.error, undefined); assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {v:1,type:'BACKEND_ARTIFACT_SELF_TEST_OK',cases:17,checks:43});
  const trace=JSON.parse(result.stderr);
  assert.equal(trace.type,'NATIVE_SELF_TEST_DIAGNOSTIC'); assert.equal(trace.test,'artifact');
  assert.equal(trace.outcome,'passed'); assert.equal(trace.checks,43); assert.equal(trace.exception,null);
  assert.ok(trace.events.every((e:any)=>Number.isInteger(e.line)&&e.line>0&&e.elapsedMs>=0));
  assert.equal(trace.events.filter((e:any)=>e.operation==='check').length,43);
  assert.ok(trace.events.filter((e:any)=>e.operation==='denial').every((e:any)=>e.expected===e.actual));
  assert.doesNotMatch(result.stderr,/cctv-application-|session_|bootstrap_|[A-Z]:\\|"stack"|"key"|"signature"\s*:/);
});

test('isolated release approval cannot activate production or serialize a native challenge', async () => {
  const [production, native, identity, startup] = await Promise.all([
    productionBackendSource(),
    readFile(new URL('../../native/ApplicationCompanion/VerifiedBackendArtifacts.cs', import.meta.url), 'utf8'),
    readFile(new URL('../server/backend_identity_handoff.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/start-production.cjs', import.meta.url), 'utf8'),
  ]);
  assert.match(production, /new ProductionAuthenticationBoundary\(\)/);
  assert.doesNotMatch(production + startup + identity, /VerifiedBackendArtifacts|NativeArtifactReservation|backend-artifact/);
  assert.match(native, /BackendReleaseTrust\? Production => null/);
  assert.match(native, /ProductionAuthority => false/);
  assert.doesNotMatch(native, /Console\.|nonce|session_|bootstrap_|ProcessStartInfo/);
});
