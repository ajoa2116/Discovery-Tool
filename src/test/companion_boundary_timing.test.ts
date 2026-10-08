import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompanionDeadline } from '../server/companion_deadline.ts';
import { CompanionBootstrapAuthority } from '../server/companion_bootstrap_authority.ts';
import { APPLICATION_SESSION_MS } from '../server/application_session_authority.ts';
import type { CompanionLifetime, CompanionLoss } from '../server/application_companion_supervisor.ts';

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

// Trusted transport stub for deterministic owner races; real identity/IPC is tested separately on Windows.
function fixture(holdActivation = false, holdLogout = false) {
  let wall = Date.now(), elapsed = 0, alive = true, bootstrap = '', sessionToken = '', nativeActive = false;
  const lost = deferred<CompanionLoss>(), activation = deferred(), activating = deferred(), logout = deferred();
  const stopped = lost.promise.then(() => { throw new Error('channel lost'); }); void stopped.catch(() => {});
  const transport: CompanionLifetime = {
    pid: 1, brokerPid: 2, generation: 1, get alive() { return alive; }, lost: lost.promise,
    closed: lost.promise.then(() => true), failureCode: lost.promise.then(() => undefined),
    async deliverBootstrap(input) { bootstrap = JSON.parse(input).token; }, async activateBootstrap() {},
    async requestBootstrapRedemption() { return bootstrap; },
    async deliverSession(token) { sessionToken = token; },
    async activateSession() { nativeActive = true; activating.resolve(); if (holdActivation) await Promise.race([activation.promise, stopped]); },
    async logoutSession(signal) { if (signal?.aborted) throw new Error('cancelled'); nativeActive = false; if (holdLogout) await Promise.race([logout.promise, stopped]); },
    async shutdown() { alive = false; nativeActive = false; lost.resolve('closed'); },
  };
  // Exercise the private owner's trusted-channel contract without adding a production injection factory.
  const owner = Reflect.construct(CompanionBootstrapAuthority, [transport, () => wall, () => elapsed]) as CompanionBootstrapAuthority;
  return { owner, transport, activation, activating, logout, token: () => sessionToken, nativeActive: () => nativeActive,
    rollbackWall: () => { wall -= 3600000; }, forwardWall: () => { wall += APPLICATION_SESSION_MS; }, setElapsed: (value: number) => { elapsed = value; } };
}

test('deadline resists wall rollback, retains absolute expiry, and never revives', () => {
  let wall = 1000, elapsed = 0;
  const deadline = new CompanionDeadline(100, () => elapsed, 1100, () => wall);
  elapsed = 40; wall = -10000; assert.equal(deadline.remaining(), 60);
  elapsed = 100; assert.equal(deadline.remaining(), 0);
  elapsed = 0; wall = 1000; assert.equal(deadline.remaining(), 0);
  const absolute = new CompanionDeadline(100, () => elapsed, 1100, () => wall);
  wall = 1100; assert.equal(absolute.remaining(), 0); wall = 1000; assert.equal(absolute.remaining(), 0);
});
test('invalid or regressing monotonic clock fails closed', () => {
  for (const value of [NaN, Infinity, -1]) {
    let elapsed = 0; const deadline = new CompanionDeadline(100, () => elapsed);
    elapsed = value; assert.throws(() => deadline.remaining()); elapsed = 0; assert.equal(deadline.remaining(), 0);
  }
});
test('native active state cannot authorize before server activation acknowledgment', async () => {
  const f = fixture(true);
  try {
    await f.owner.issueBootstrap(); const granting = f.owner.redeemBootstrap(); await f.activating.promise;
    assert.equal(f.nativeActive(), true); assert.throws(() => f.owner.validateSession(f.token()));
    f.activation.resolve(); const proof = await granting; assert.deepEqual(f.owner.validateSession(f.token()), proof.receipt);
    assert.equal('deliverSession' in f.owner.companion, false); assert.equal('activateSession' in f.owner.companion, false);
    assert.equal('transport' in f.owner, false);
  } finally { await f.owner.dispose(); }
});
test('session elapsed lifetime begins at issuance and is not reset at activation or wall rollback', async () => {
  const f = fixture(true);
  try {
    await f.owner.issueBootstrap(); const granting = f.owner.redeemBootstrap(); await f.activating.promise;
    f.rollbackWall(); f.setElapsed(APPLICATION_SESSION_MS - 1); f.activation.resolve(); const proof = await granting;
    assert.deepEqual(f.owner.validateSession(f.token()), proof.receipt);
    f.setElapsed(APPLICATION_SESSION_MS); assert.throws(() => f.owner.validateSession(f.token())); assert.equal(f.transport.alive, false);
    f.setElapsed(0); assert.throws(() => f.owner.validateSession(f.token()));
  } finally { await f.owner.dispose(); }
});
test('absolute expiry still shortens elapsed lifetime', async () => {
  const f = fixture();
  try { await f.owner.issueBootstrap(); await f.owner.redeemBootstrap(); f.forwardWall(); assert.throws(() => f.owner.validateSession(f.token())); assert.equal(f.transport.alive, false); }
  finally { await f.owner.dispose(); }
});
test('elapsed expiry proactively revokes a pending activation and ignores late acknowledgment', async () => {
  const f = fixture(true);
  try {
    await f.owner.issueBootstrap(); const granting = f.owner.redeemBootstrap(); const denied = assert.rejects(granting); await f.activating.promise;
    f.rollbackWall(); f.setElapsed(APPLICATION_SESSION_MS);
    await denied; f.activation.resolve(); assert.throws(() => f.owner.validateSession(f.token())); assert.equal(f.transport.alive, false);
  } finally { await f.owner.dispose(); }
});
test('cancellation while native is active but acknowledgment is pending revokes server authority', async () => {
  const f = fixture(true); const controller = new AbortController();
  try {
    await f.owner.issueBootstrap(); const granting = f.owner.redeemBootstrap(controller.signal); const denied = assert.rejects(granting); await f.activating.promise;
    controller.abort(); await denied; f.activation.resolve(); assert.throws(() => f.owner.validateSession(f.token())); assert.equal(f.transport.alive, false);
  } finally { await f.owner.dispose(); }
});
test('direct logout revokes immediately while native acknowledgment is pending', async () => {
  const f = fixture(false, true);
  try {
    await f.owner.issueBootstrap(); await f.owner.redeemBootstrap(); const loggingOut = f.owner.companion.logoutSession();
    assert.throws(() => f.owner.validateSession(f.token())); await assert.rejects(f.owner.companion.logoutSession());
    f.logout.resolve(); await loggingOut; assert.equal(f.transport.alive, false);
  } finally { await f.owner.dispose(); }
});
test('cancelled logout remains revoked and closes the companion', async () => {
  const f = fixture(); const controller = new AbortController();
  try {
    await f.owner.issueBootstrap(); await f.owner.redeemBootstrap(); controller.abort(); await assert.rejects(f.owner.companion.logoutSession(controller.signal));
    assert.throws(() => f.owner.validateSession(f.token())); assert.equal(f.transport.alive, false);
  } finally { await f.owner.dispose(); }
});

test('throwing clock is terminal even when the clock later recovers', () => {
  let broken = false;
  const deadline = new CompanionDeadline(100, () => { if (broken) throw new Error('clock failure'); return 0; });
  broken = true; assert.throws(() => deadline.remaining()); broken = false; assert.equal(deadline.remaining(), 0);
});

test('logout during pending activation cannot become a later authorized session', async () => {
  const f = fixture(true);
  try {
    await f.owner.issueBootstrap(); const granting = f.owner.redeemBootstrap(); const denied = assert.rejects(granting); await f.activating.promise;
    await assert.rejects(f.owner.companion.logoutSession()); await denied;
    f.activation.resolve(); assert.throws(() => f.owner.validateSession(f.token())); assert.equal(f.transport.alive, false);
  } finally { await f.owner.dispose(); }
});
