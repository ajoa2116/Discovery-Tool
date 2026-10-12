import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { syntheticTlsFixture } from './support/synthetic_tls_binding.ts';
import { decideCameraAccess } from '../shared/camera_access.ts';

const denied = /Synthetic TLS binding unavailable\./;
type Fixture = Awaited<ReturnType<typeof syntheticTlsFixture>>;
async function cleaned(f: Fixture) {
  const closing = f.close(); assert.equal(f.close(), closing); await closing;
  const s = f.snapshot();
  assert.equal(s.ended, true); assert.equal(s.listening, false); assert.equal(s.shutdownComplete, true);
  assert.equal(s.websocketClients, 0); assert.equal(s.connections, 0); assert.equal(s.pendingClients, 0); assert.equal(s.pendingRequests, 0);
  assert.equal(s.sweepActive, false); assert.equal(s.upgradeHandlers, 0);
  assert.throws(f.assertLive, denied);
}

test('one real HTTPS listener serves Express and ws, with a fresh pin and no authority', { timeout: 15000 }, async () => {
  const f = await syntheticTlsFixture(), other = await syntheticTlsFixture();
  try {
    assert.notEqual(f.pin, other.pin); assert.match(f.pin, /^[a-f0-9]{64}$/);
    f.assertLive(); assert.equal(f.snapshot().listenerRegistered, true);
    assert.deepEqual(await f.probeHttp(), { status: 200, body: '{"fixture":"synthetic-read-only"}' });
    assert.equal(await f.probeWs(), '{"fixture":"synthetic-event"}');
    assert.equal((await f.apiDenial()).status, 401); await assert.rejects(f.wsDenial(), denied);
    assert.equal(f.snapshot().productionAuthority, false); assert.equal(f.snapshot().nativeOwnerAuthenticated, false);
    assert.equal(f.snapshot().completeClosure, false);
    assert.doesNotMatch(JSON.stringify(f.snapshot()), /PRIVATE KEY|session_|bootstrap_|"key"|"cert"/);
    assert.equal(decideCameraAccess('synthetic-missing', [], []).allowed, false);
  } finally { await cleaned(f); await cleaned(other); }
});

for (const kind of ['server', 'ws', 'session', 'binding'] as const) {
  test(`exact ${kind} substitution revokes permanently; foreign fixture remains live`, { timeout: 15000 }, async () => {
    const f = await syntheticTlsFixture(), other = await syntheticTlsFixture();
    try {
      assert.throws(() => f.substituteForTest(kind, other), denied); assert.equal(f.ended.aborted, true);
      assert.throws(f.assertLive, denied); other.assertLive();
      assert.deepEqual(await other.probeHttp(), { status: 200, body: '{"fixture":"synthetic-read-only"}' });
    } finally { await cleaned(f); await cleaned(other); }
  });
}

test('copied session/binding metadata and a replay cannot attach or revive a listener', { timeout: 15000 }, async () => {
  for (const kind of ['session', 'binding', 'replay'] as const) {
    const f = await syntheticTlsFixture();
    try {
      assert.throws(() => kind === 'replay' ? f.replayForTest() : f.substituteForTest(kind), denied);
      assert.equal(f.ended.aborted, true); assert.throws(f.replayForTest, denied);
    } finally { await cleaned(f); }
  }
});

test('HTTP and WS reject a wrong TLS pin before synthetic data and revoke the candidate', { timeout: 15000 }, async () => {
  for (const operation of ['wrongPin', 'wrongWsPin'] as const) {
    const f = await syntheticTlsFixture();
    try { await assert.rejects(f[operation](), denied); assert.equal(f.ended.aborted, true);
      assert.equal(f.snapshot().syntheticReads, 0); assert.equal(f.snapshot().syntheticUpgrades, 0); }
    finally { await cleaned(f); }
  }
});

test('another live HTTPS endpoint cannot substitute for the privately bound listener', { timeout: 15000 }, async () => {
  const f = await syntheticTlsFixture(), other = await syntheticTlsFixture();
  try {
    await assert.rejects(f.endpointSubstitutionForTest(other), denied); assert.equal(f.ended.aborted, true);
    other.assertLive(); assert.equal((await other.probeHttp()).status, 200);
  } finally { await cleaned(f); await cleaned(other); }
});

test('cancellation terminates an active websocket and removes observer/handler state', { timeout: 15000 }, async () => {
  const controller = new AbortController(), f = await syntheticTlsFixture({ signal: controller.signal });
  try {
    assert.equal(await f.holdWsForTest(), '{"fixture":"synthetic-event"}');
    assert.equal(f.snapshot().websocketClients, 1); controller.abort();
    assert.equal(f.ended.aborted, true); assert.throws(f.probeHttp, denied);
  } finally { await cleaned(f); }
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('elapsed/absolute expiry deny synchronously, even before the sweep runs', { timeout: 15000 }, async () => {
  for (const kind of ['elapsed', 'wall'] as const) {
    let elapsed = 0, wall = Date.now();
    const f = await syntheticTlsFixture({ elapsedClock: () => elapsed, wallClock: () => wall });
    try { if (kind === 'elapsed') elapsed = 10000; else wall += 10000;
      assert.throws(f.probeHttp, denied); assert.equal(f.ended.aborted, true); }
    finally { await cleaned(f); }
  }
});

test('pre-cancellation creates no fixture and production never imports the test binding', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(syntheticTlsFixture({ signal: controller.signal }), denied);
  const production = await readFile(new URL('../server/backend_application.ts', import.meta.url), 'utf8');
  assert.match(production, /new ProductionAuthenticationBoundary\(\)/);
  assert.doesNotMatch(production, /synthetic_tls_binding|ExactFixtureBinding/);
});

test('cancellation while listen is pending closes the late listener before rejecting', { timeout: 15000 }, async () => {
  const controller = new AbortController();
  await assert.rejects(syntheticTlsFixture({ signal: controller.signal,
    onListenRequestedForTest: () => controller.abort() }), denied);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('a synchronous startup callback failure still collects the pending listener', { timeout: 15000 }, async () => {
  await assert.rejects(syntheticTlsFixture({ onListenRequestedForTest: () => { throw Error('synthetic startup failure'); } }), denied);
});

test('independent HTTP or WS server loss terminates the exact association', { timeout: 15000 }, async () => {
  for (const operation of ['loseListenerForTest','loseWsForTest'] as const) {
    const f=await syntheticTlsFixture();
    try { await f[operation](); assert.equal(f.ended.aborted,true); assert.throws(f.assertLive,denied); }
    finally { await cleaned(f); }
  }
});
