import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { getEventListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { BackendIdentityHandoff, createBackendInstanceIdentity } from '../server/backend_identity_handoff.ts';
import { CompanionBootstrapAuthority } from '../server/companion_bootstrap_authority.ts';
import { APPLICATION_SESSION_MS } from '../server/application_session_authority.ts';
import type { CompanionLifetime, CompanionLoss } from '../server/application_companion_supervisor.ts';

const denied = /Backend identity handoff unavailable\./;
// Real private-brand owner with a modeled trusted channel. No native peer-proof claim.
async function ownerFixture() {
  let alive = true, bootstrap = '', elapsed = 0;
  let lose!: (reason: CompanionLoss) => void;
  const lost = new Promise<CompanionLoss>(resolve => { lose = resolve; });
  const transport: CompanionLifetime = {
    pid: 1, brokerPid: 2, generation: 1, get alive() { return alive; }, lost,
    closed: lost.then(() => true), failureCode: lost.then(() => undefined),
    async deliverBootstrap(value) { bootstrap = JSON.parse(value).token; }, async activateBootstrap() {},
    async requestBootstrapRedemption() { return bootstrap; }, async deliverSession() {}, async activateSession() {},
    async logoutSession() {}, async shutdown() { alive = false; lose('closed'); },
  };
  const owner = Reflect.construct(CompanionBootstrapAuthority, [transport, Date.now, () => elapsed]) as CompanionBootstrapAuthority;
  await owner.issueBootstrap(); const receipt = await owner.deliverSession();
  return { owner, receipt, lose: () => { alive = false; lose('failed'); }, expire: () => { elapsed = APPLICATION_SESSION_MS; } };
}
async function fixture() {
  const f = await ownerFixture(), server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const identity = createBackendInstanceIdentity(server);
  const closeListener = () => new Promise<void>((resolve, reject) => {
    if (!server.listening) return resolve(); server.close(error => error ? reject(error) : resolve());
  });
  return { ...f, server, identity, closeListener,
    async close() { await f.owner.dispose(); await closeListener(); } };
}

test('exact owner, active receipt and listener produce only a frozen, non-authorizing candidate', async () => {
  const f = await fixture();
  try {
    const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity);
    const challenge = h.challenge;
    assert.equal(JSON.stringify(challenge), '{}'); assert.equal(JSON.stringify(h), '{"productionAuthority":false}');
    const binding = h.confirmCandidate(f.owner, f.identity, challenge);
    assert.equal(binding.productionAuthority, false); assert.equal(binding.backendInstanceId, f.identity.instanceId);
    assert.equal(binding.sessionId, f.receipt.id); assert.ok(Object.isFrozen(binding)); assert.ok(Object.isFrozen(f.identity));
    h.assertCandidate(f.owner, f.identity, binding); h.revoke();
    assert.equal(h.ended.aborted, true); assert.throws(() => h.assertCandidate(f.owner, f.identity, binding), denied);
    assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 0);
  } finally { await f.close(); }
});

test('fake owner validator cannot establish private-brand ownership', async () => {
  const f = await fixture(); let calls = 0;
  try {
    const fake = { companion: f.owner.companion, authorizeFixtureReceipt() { calls++; } };
    assert.throws(() => new BackendIdentityHandoff(fake as never, f.receipt, f.identity), denied);
    assert.equal(calls, 0);
  } finally { await f.close(); }
});

test('copied, foreign and modified receipts cannot attach an owner', async () => {
  const f = await fixture(), other = await ownerFixture();
  try {
    for (const receipt of [{ ...f.receipt }, other.receipt, { ...f.receipt, kind: 'bootstrap' }]) {
      assert.throws(() => new BackendIdentityHandoff(f.owner, receipt as never, f.identity), denied);
    }
    f.owner.authorizeFixtureReceipt(f.receipt);
  } finally { await f.close(); await other.owner.dispose(); }
});

test('PID, port and UUID copies or serialized metadata cannot register a backend', async () => {
  const f = await fixture();
  try {
    for (const identity of [{ ...f.identity }, JSON.parse(JSON.stringify(f.identity)), { processId: process.pid, port: f.identity.port }]) {
      assert.throws(() => new BackendIdentityHandoff(f.owner, f.receipt, identity), denied);
    }
    assert.throws(() => createBackendInstanceIdentity(createServer()), denied);
    assert.throws(() => createBackendInstanceIdentity(f.server), denied);
    assert.throws(() => createBackendInstanceIdentity({ listening: true, address: () => ({ port: f.identity.port }) } as never), denied);
  } finally { await f.close(); }
});

for (const substitution of ['owner', 'backend', 'challenge', 'binding'] as const) {
  test(`${substitution} substitution terminates the candidate`, async () => {
    const f = await fixture(), other = await ownerFixture();
    try {
      const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity), challenge = h.challenge;
      if (substitution === 'binding') {
        const binding = h.confirmCandidate(f.owner, f.identity, challenge);
        assert.throws(() => h.assertCandidate(f.owner, f.identity, { ...binding }), denied);
      } else {
        assert.throws(() => h.confirmCandidate(substitution === 'owner' ? other.owner : f.owner,
          substitution === 'backend' ? { ...f.identity } : f.identity,
          substitution === 'challenge' ? JSON.parse(JSON.stringify(challenge)) : challenge), denied);
      }
      assert.equal(h.ended.aborted, true); f.owner.authorizeFixtureReceipt(f.receipt);
    } finally { await f.close(); await other.owner.dispose(); }
  });
}

test('confirmation replay revokes the previously bound candidate', async () => {
  const f = await fixture();
  try {
    const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity), challenge = h.challenge;
    const binding = h.confirmCandidate(f.owner, f.identity, challenge);
    assert.throws(() => h.confirmCandidate(f.owner, f.identity, challenge), denied);
    assert.equal(h.ended.aborted, true); assert.throws(() => h.assertCandidate(f.owner, f.identity, binding), denied);
  } finally { await f.close(); }
});

test('another registered listener and another genuine challenge cannot be substituted', async () => {
  for (const substituteChallenge of [false, true]) {
    const f = await fixture(), other = await fixture();
    try {
      const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity);
      const alternate = new BackendIdentityHandoff(other.owner, other.receipt, other.identity);
      assert.throws(() => h.confirmCandidate(f.owner, substituteChallenge ? f.identity : other.identity,
        substituteChallenge ? alternate.challenge : h.challenge), denied);
      assert.equal(h.ended.aborted, true);
      alternate.assertCandidate(other.owner, other.identity,
        alternate.confirmCandidate(other.owner, other.identity, alternate.challenge));
      alternate.revoke();
    } finally { await f.close(); await other.close(); }
  }
});

test('stale owner cannot start a new attachment', async () => {
  for (const mode of ['expired', 'disposed', 'process'] as const) {
    const f = await fixture();
    try {
      if (mode === 'expired') f.expire();
      if (mode === 'disposed') await f.owner.dispose();
      if (mode === 'process') f.lose();
      assert.throws(() => new BackendIdentityHandoff(f.owner, f.receipt, f.identity), denied);
    } finally { await f.close(); }
  }
});

test('owner and backend lifetimes are each reserved once, including failed confirmation', async () => {
  const f = await fixture(), other = await fixture();
  try {
    const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity);
    assert.throws(() => new BackendIdentityHandoff(f.owner, f.receipt, other.identity), denied);
    assert.throws(() => new BackendIdentityHandoff(other.owner, other.receipt, f.identity), denied);
    assert.throws(() => h.confirmCandidate(f.owner, f.identity, {}), denied);
    assert.throws(() => new BackendIdentityHandoff(f.owner, f.receipt, f.identity), denied);
  } finally { await f.close(); await other.close(); }
});

for (const mode of ['elapsed', 'absolute', 'rollback', 'nonfinite'] as const) {
  test(`${mode} deadline failure rejects a previously valid candidate`, async () => {
    const f = await fixture(); let elapsed = 100, wall = Date.now();
    try {
      const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity, { elapsedClock: () => elapsed, wallClock: () => wall });
      const challenge = h.challenge;
      const binding = h.confirmCandidate(f.owner, f.identity, challenge);
      elapsed = 100 + 9999; h.assertCandidate(f.owner, f.identity, binding);
      if (mode === 'elapsed') { elapsed = 10100; wall -= 60000; }
      if (mode === 'absolute') wall += 10000;
      if (mode === 'rollback') elapsed = 100;
      if (mode === 'nonfinite') elapsed = NaN;
      assert.throws(() => h.assertCandidate(f.owner, f.identity, binding), denied); assert.equal(h.ended.aborted, true);
    } finally { await f.close(); }
  });
}

for (const loss of ['process', 'logout', 'session', 'listener', 'cancel'] as const) {
  test(`${loss} loss revokes pending and bound candidates`, async () => {
    for (const bound of [false, true]) {
      const f = await fixture(), cancellation = new AbortController();
      try {
        const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity, { signal: cancellation.signal });
        const challenge = h.challenge;
        const binding = bound ? h.confirmCandidate(f.owner, f.identity, challenge) : undefined;
        if (loss === 'process') { f.lose(); await Promise.resolve(); }
        if (loss === 'logout') await f.owner.logout();
        if (loss === 'session') { f.expire(); assert.throws(() => f.owner.authorizeFixtureReceipt(f.receipt)); }
        if (loss === 'listener') await f.closeListener();
        if (loss === 'cancel') cancellation.abort();
        assert.equal(h.ended.aborted, true);
        assert.throws(() => bound ? h.assertCandidate(f.owner, f.identity, binding) : h.confirmCandidate(f.owner, f.identity, challenge), denied);
        assert.equal(getEventListeners(cancellation.signal, 'abort').length, 0);
      } finally { await f.close(); }
    }
  });
}

test('closed listener identity stays revoked even when the same process reuses its port', async () => {
  const f = await fixture(); const replacement = createServer();
  try {
    const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity), challenge = h.challenge;
    await f.closeListener();
    await new Promise<void>(resolve => replacement.listen(f.identity.port, '127.0.0.1', resolve));
    const identity = createBackendInstanceIdentity(replacement);
    assert.equal(identity.port, f.identity.port); assert.equal(identity.processId, f.identity.processId);
    assert.notEqual(identity.instanceId, f.identity.instanceId);
    assert.throws(() => h.confirmCandidate(f.owner, identity, challenge), denied); assert.equal(h.ended.aborted, true);
  } finally { await f.close(); await new Promise<void>(resolve => replacement.close(() => resolve())); }
});

test('pre-cancelled attachment rejects; abort callbacks cannot resurrect a candidate', async () => {
  const f = await fixture(); const controller = new AbortController(); controller.abort();
  try {
    assert.throws(() => new BackendIdentityHandoff(f.owner, f.receipt, f.identity, { signal: controller.signal }), denied);
    const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity), challenge = h.challenge;
    let observed = false;
    h.ended.addEventListener('abort', () => {
      observed = true; assert.throws(() => h.confirmCandidate(f.owner, f.identity, challenge), denied);
    });
    h.revoke(); assert.equal(observed, true);
  } finally { await f.close(); }
});

test('reentrant confirmation cannot issue a binding after terminal transition', async () => {
  const f = await fixture(); let reenter: (() => void) | undefined;
  try {
    const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity, { elapsedClock: () => { reenter?.(); return 0; } });
    const challenge = h.challenge;
    reenter = () => { reenter = undefined; assert.throws(() => h.confirmCandidate(f.owner, f.identity, challenge), denied); };
    assert.throws(() => h.confirmCandidate(f.owner, f.identity, challenge), denied); assert.equal(h.ended.aborted, true);
  } finally { await f.close(); }
});

test('reentrant construction cannot reserve the same owner and backend twice', async () => {
  const f = await fixture(); let inner: BackendIdentityHandoff | undefined;
  try {
    assert.throws(() => new BackendIdentityHandoff(f.owner, f.receipt, f.identity, {
      wallClock: () => { if (!inner) inner = new BackendIdentityHandoff(f.owner, f.receipt, f.identity); return Date.now(); },
    }), denied);
    assert.ok(inner); const binding = inner.confirmCandidate(f.owner, f.identity, inner.challenge);
    inner.assertCandidate(f.owner, f.identity, binding); inner.revoke();
  } finally { await f.close(); }
});

test('idle deadline revocation is observed before watchdog expiry', async () => {
  const f = await fixture(); let elapsed = 0;
  try {
    const h = new BackendIdentityHandoff(f.owner, f.receipt, f.identity, { elapsedClock: () => elapsed });
    const result = new Promise<void>((resolve, reject) => {
      const watchdog = setTimeout(() => reject(new Error('Revocation watchdog expired')), 3000);
      h.ended.addEventListener('abort', () => { clearTimeout(watchdog); resolve(); }, { once: true });
    });
    elapsed = 10000; await result; assert.equal(h.ended.aborted, true);
    assert.equal(getEventListeners(f.owner.boundaryEnded, 'abort').length, 0);
  } finally { await f.close(); }
});

test('foundation remains outside production composition and public request routes', async () => {
  const source = await readFile(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /BackendIdentityHandoff|createBackendInstanceIdentity/);
  assert.match(source, /new ProductionAuthenticationBoundary\(\)/);
});
