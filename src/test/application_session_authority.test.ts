import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { ApplicationSessionAuthority, APPLICATION_BOOTSTRAP_MS, APPLICATION_SESSION_MS } from '../server/application_session_authority.ts';

function fixture() {
  let now = 1000;
  const tokens: string[] = [];
  const authority = new ApplicationSessionAuthority({ deliver: secret => { tokens.push(secret.expose()); } }, () => now);
  return { authority, tokens, setNow: (value: number) => { now = value; } };
}

test('private delivery issues unique 256-bit capabilities and redemption rotates authority', async () => {
  const f = fixture();
  const first = await f.authority.issueBootstrap(), second = await f.authority.issueBootstrap();
  assert.equal(first.expiresAt, 1000 + APPLICATION_BOOTSTRAP_MS);
  assert.notEqual(first.id, second.id);
  assert.notEqual(f.tokens[0], f.tokens[1]);
  assert.match(f.tokens[0], /^bootstrap_[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(f.tokens[0].slice('bootstrap_'.length), 'base64url').length, 32);
  assert.ok(!JSON.stringify(first).includes(f.tokens[0]));
  const session = f.authority.redeemBootstrap(f.tokens[0]);
  assert.match(session.secret.expose(), /^session_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(session.receipt.id, first.id);
  assert.equal(session.receipt.expiresAt, 1000 + APPLICATION_SESSION_MS);
  assert.deepEqual(f.authority.validateSession(session.secret.expose()), session.receipt);
  assert.throws(() => f.authority.redeemBootstrap(f.tokens[0]), /authority unavailable/);
  assert.throws(() => f.authority.validateSession(f.tokens[1]));
  assert.throws(() => f.authority.redeemBootstrap(session.secret.expose()));
});

test('invalid and foreign capabilities fail without consuming another valid capability', async () => {
  const f = fixture(), other = fixture();
  await f.authority.issueBootstrap(); await other.authority.issueBootstrap();
  for (const token of [undefined, null, {}, '', 'bootstrap_bad', 'x'.repeat(10000), other.tokens[0]]) {
    assert.throws(() => f.authority.redeemBootstrap(token), /authority unavailable/);
    assert.throws(() => f.authority.validateSession(token), /authority unavailable/);
  }
  const session = f.authority.redeemBootstrap(f.tokens[0]);
  assert.throws(() => other.authority.validateSession(session.secret.expose()));
});

test('expiry is exclusive, absolute and does not revive after clock rollback', async () => {
  const f = fixture(); await f.authority.issueBootstrap();
  f.setNow(1000 + APPLICATION_BOOTSTRAP_MS);
  assert.throws(() => f.authority.redeemBootstrap(f.tokens[0]));
  f.setNow(1000);
  assert.throws(() => f.authority.redeemBootstrap(f.tokens[0]));
  await f.authority.issueBootstrap();
  const session = f.authority.redeemBootstrap(f.tokens[1]);
  f.setNow(session.receipt.expiresAt - 1);
  assert.ok(f.authority.validateSession(session.secret.expose()));
  f.setNow(session.receipt.expiresAt);
  assert.throws(() => f.authority.validateSession(session.secret.expose()));
  f.setNow(1000);
  assert.throws(() => f.authority.validateSession(session.secret.expose()));
});

test('revocation affects only the selected session; disposal permanently ends all authority', async () => {
  const f = fixture();
  const sessions: ReturnType<ApplicationSessionAuthority['redeemBootstrap']>[] = [];
  for (let i = 0; i < 2; i++) {
    await f.authority.issueBootstrap();
    sessions.push(f.authority.redeemBootstrap(f.tokens.at(-1)));
  }
  assert.equal(f.authority.revokeSession('unknown'), false);
  assert.equal(f.authority.revokeSession(sessions[0].receipt.id), true);
  assert.equal(f.authority.revokeSession(sessions[0].receipt.id), false);
  assert.throws(() => f.authority.validateSession(sessions[0].secret.expose()));
  assert.ok(f.authority.validateSession(sessions[1].secret.expose()));
  await f.authority.issueBootstrap(); f.authority.dispose();
  assert.throws(() => f.authority.redeemBootstrap(f.tokens.at(-1)));
  assert.throws(() => f.authority.validateSession(sessions[1].secret.expose()));
  await assert.rejects(f.authority.issueBootstrap());
});

test('delivery failure and reentrant redemption fail closed with redacted errors', async () => {
  let token = '';
  const authority = new ApplicationSessionAuthority({ deliver: secret => {
    token = secret.expose();
    assert.throws(() => authority.redeemBootstrap(token));
    throw new Error(token);
  } });
  await assert.rejects(authority.issueBootstrap(), error => error instanceof Error && error.message === 'Application authority unavailable.');
  assert.throws(() => authority.redeemBootstrap(token));
});

test('ordinary serialization/inspection redacts secrets and authority state', async () => {
  const f = fixture(); await f.authority.issueBootstrap();
  const session = f.authority.redeemBootstrap(f.tokens[0]);
  for (const text of [JSON.stringify(session), inspect(session), String(session.secret), JSON.stringify(f.authority), inspect(f.authority)]) {
    assert.ok(!text.includes(session.secret.expose()));
    assert.ok(!text.includes(f.tokens[0]));
  }
});

test('bounded stores reclaim expiry and consume bootstrap on session-capacity failure', async () => {
  const f = fixture();
  for (let i = 0; i < 128; i++) await f.authority.issueBootstrap();
  await assert.rejects(f.authority.issueBootstrap());
  for (const token of f.tokens.slice()) f.authority.redeemBootstrap(token);
  await f.authority.issueBootstrap();
  const token = f.tokens.at(-1);
  assert.throws(() => f.authority.redeemBootstrap(token));
  f.setNow(1000 + APPLICATION_SESSION_MS);
  assert.throws(() => f.authority.redeemBootstrap(token));
  await f.authority.issueBootstrap();
  assert.ok(f.authority.redeemBootstrap(f.tokens.at(-1)));
});

test('nonfinite clock fails closed', async () => {
  const f = fixture(); await f.authority.issueBootstrap(); f.setNow(NaN);
  assert.throws(() => f.authority.redeemBootstrap(f.tokens[0]));
});

function delayedFixture() {
  let now = 1000, token = '', deliverySignal: AbortSignal | undefined;
  let resolve!: () => void, reject!: (error: Error) => void;
  const acknowledgment = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  const authority = new ApplicationSessionAuthority({ deliver(secret, _receipt, signal) {
    token = secret.expose(); deliverySignal = signal;
    return acknowledgment;
  } }, () => now);
  return { authority, resolve, reject, token: () => token, signal: () => deliverySignal, setNow: (value: number) => { now = value; } };
}

test('delayed acknowledgment keeps authority pending; concurrent redemption succeeds exactly once', async () => {
  const f = delayedFixture();
  let completed = false;
  const issued = f.authority.issueBootstrap().then(receipt => { completed = true; return receipt; });
  await Promise.resolve();
  assert.ok(f.token());
  assert.equal(completed, false);
  assert.throws(() => f.authority.redeemBootstrap(f.token()));
  f.resolve(); await issued;
  const results = await Promise.allSettled([0, 1].map(() => Promise.resolve().then(() => f.authority.redeemBootstrap(f.token()))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});

test('async rejection invalidates capability and hides delivery exception details', async () => {
  const f = delayedFixture(), issued = f.authority.issueBootstrap();
  const rejection = assert.rejects(issued, { message: 'Application authority unavailable.' });
  await Promise.resolve(); f.reject(new Error(f.token())); await rejection;
  assert.throws(() => f.authority.redeemBootstrap(f.token()));
  assert.equal(f.signal()?.aborted, true);
});

test('expiry during delivery is checked at acknowledgment using the injected clock', async () => {
  const f = delayedFixture(), issued = f.authority.issueBootstrap();
  const rejection = assert.rejects(issued);
  await Promise.resolve(); f.setNow(1000 + APPLICATION_BOOTSTRAP_MS); f.resolve(); await rejection;
  assert.throws(() => f.authority.redeemBootstrap(f.token()));
});

test('synchronous delivery also rechecks expiry before reporting success', async () => {
  let now = 1000, token = '';
  const authority = new ApplicationSessionAuthority({ deliver(secret) { token = secret.expose(); now += APPLICATION_BOOTSTRAP_MS; } }, () => now);
  await assert.rejects(authority.issueBootstrap());
  assert.throws(() => authority.redeemBootstrap(token));
});

for (const ending of ['abort', 'dispose'] as const) {
  for (const late of ['success', 'rejection'] as const) {
    test(`${ending} rejects pending issuance promptly and ignores late ${late}`, async () => {
      const f = delayedFixture(), controller = new AbortController();
      const issued = f.authority.issueBootstrap(controller.signal);
      const rejection = assert.rejects(issued);
      await Promise.resolve();
      if (ending === 'abort') controller.abort(); else f.authority.dispose();
      assert.throws(() => f.authority.redeemBootstrap(f.token()));
      await rejection; // No delivery acknowledgment is needed to finish cancellation.
      assert.equal(f.signal()?.aborted, true);
      if (late === 'success') f.resolve(); else f.reject(new Error('late'));
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.throws(() => f.authority.redeemBootstrap(f.token()));
      if (ending === 'dispose') await assert.rejects(f.authority.issueBootstrap());
    });
  }
}

test('cancellation wins over an acknowledgment resolved in the same turn', async () => {
  const f = delayedFixture(), controller = new AbortController();
  const issued = f.authority.issueBootstrap(controller.signal), rejection = assert.rejects(issued);
  await Promise.resolve(); f.resolve(); controller.abort(); await rejection;
  assert.throws(() => f.authority.redeemBootstrap(f.token()));
});

test('pre-aborted and immediately disposed issuances never invoke delivery', async () => {
  let calls = 0;
  const authority = new ApplicationSessionAuthority({ deliver() { calls++; } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(authority.issueBootstrap(controller.signal));
  const issued = authority.issueBootstrap(); authority.dispose(); await assert.rejects(issued);
  assert.equal(calls, 0);
});

test('cancelling a completed issuance does not revoke unrelated or redeemed authority', async () => {
  const f = fixture(), controller = new AbortController();
  await f.authority.issueBootstrap(controller.signal);
  const session = f.authority.redeemBootstrap(f.tokens[0]);
  controller.abort();
  assert.ok(f.authority.validateSession(session.secret.expose()));
  await f.authority.issueBootstrap();
  assert.ok(f.authority.redeemBootstrap(f.tokens[1]));
});


test('provisional session cannot validate before activation and cannot activate twice', async () => {
  const f = fixture(); await f.authority.issueBootstrap();
  const session = f.authority.redeemBootstrapProvisional(f.tokens[0]);
  assert.throws(() => f.authority.validateSession(session.secret.expose()));
  f.authority.activateSession(session.receipt.id);
  assert.deepEqual(f.authority.validateSession(session.secret.expose()), session.receipt);
  assert.throws(() => f.authority.activateSession(session.receipt.id));
  f.authority.revokeSession(session.receipt.id); assert.throws(() => f.authority.validateSession(session.secret.expose()));
});
test('expired or revoked provisional sessions cannot be activated or revived', async () => {
  for (const expired of [false, true]) {
    const f = fixture(); await f.authority.issueBootstrap(); const session = f.authority.redeemBootstrapProvisional(f.tokens[0]);
    if (expired) f.setNow(session.receipt.expiresAt); else f.authority.revokeSession(session.receipt.id);
    assert.throws(() => f.authority.activateSession(session.receipt.id));
    f.setNow(1000); assert.throws(() => f.authority.validateSession(session.secret.expose()));
  }
});
