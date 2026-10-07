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

test('private delivery issues unique 256-bit capabilities and redemption rotates authority', () => {
  const f = fixture();
  const first = f.authority.issueBootstrap(), second = f.authority.issueBootstrap();
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

test('invalid and foreign capabilities fail without consuming another valid capability', () => {
  const f = fixture(), other = fixture();
  f.authority.issueBootstrap(); other.authority.issueBootstrap();
  for (const token of [undefined, null, {}, '', 'bootstrap_bad', 'x'.repeat(10000), other.tokens[0]]) {
    assert.throws(() => f.authority.redeemBootstrap(token), /authority unavailable/);
    assert.throws(() => f.authority.validateSession(token), /authority unavailable/);
  }
  const session = f.authority.redeemBootstrap(f.tokens[0]);
  assert.throws(() => other.authority.validateSession(session.secret.expose()));
});

test('expiry is exclusive, absolute and does not revive after clock rollback', () => {
  const f = fixture(); f.authority.issueBootstrap();
  f.setNow(1000 + APPLICATION_BOOTSTRAP_MS);
  assert.throws(() => f.authority.redeemBootstrap(f.tokens[0]));
  f.setNow(1000);
  assert.throws(() => f.authority.redeemBootstrap(f.tokens[0]));
  f.authority.issueBootstrap();
  const session = f.authority.redeemBootstrap(f.tokens[1]);
  f.setNow(session.receipt.expiresAt - 1);
  assert.ok(f.authority.validateSession(session.secret.expose()));
  f.setNow(session.receipt.expiresAt);
  assert.throws(() => f.authority.validateSession(session.secret.expose()));
  f.setNow(1000);
  assert.throws(() => f.authority.validateSession(session.secret.expose()));
});

test('revocation affects only the selected session; disposal permanently ends all authority', () => {
  const f = fixture();
  const sessions = [0, 1].map(() => { f.authority.issueBootstrap(); return f.authority.redeemBootstrap(f.tokens.at(-1)); });
  assert.equal(f.authority.revokeSession('unknown'), false);
  assert.equal(f.authority.revokeSession(sessions[0].receipt.id), true);
  assert.equal(f.authority.revokeSession(sessions[0].receipt.id), false);
  assert.throws(() => f.authority.validateSession(sessions[0].secret.expose()));
  assert.ok(f.authority.validateSession(sessions[1].secret.expose()));
  f.authority.issueBootstrap(); f.authority.dispose();
  assert.throws(() => f.authority.redeemBootstrap(f.tokens.at(-1)));
  assert.throws(() => f.authority.validateSession(sessions[1].secret.expose()));
  assert.throws(() => f.authority.issueBootstrap());
});

test('delivery failure and reentrant redemption fail closed with redacted errors', () => {
  let token = '';
  const authority = new ApplicationSessionAuthority({ deliver: secret => {
    token = secret.expose();
    assert.throws(() => authority.redeemBootstrap(token));
    throw new Error(token);
  } });
  assert.throws(() => authority.issueBootstrap(), error => error instanceof Error && error.message === 'Application authority unavailable.');
  assert.throws(() => authority.redeemBootstrap(token));
});

test('ordinary serialization/inspection redacts secrets and authority state', () => {
  const f = fixture(); f.authority.issueBootstrap();
  const session = f.authority.redeemBootstrap(f.tokens[0]);
  for (const text of [JSON.stringify(session), inspect(session), String(session.secret), JSON.stringify(f.authority), inspect(f.authority)]) {
    assert.ok(!text.includes(session.secret.expose()));
    assert.ok(!text.includes(f.tokens[0]));
  }
});

test('bounded stores reclaim expiry and consume bootstrap on session-capacity failure', () => {
  const f = fixture();
  for (let i = 0; i < 128; i++) f.authority.issueBootstrap();
  assert.throws(() => f.authority.issueBootstrap());
  for (const token of f.tokens.slice()) f.authority.redeemBootstrap(token);
  f.authority.issueBootstrap();
  const token = f.tokens.at(-1);
  assert.throws(() => f.authority.redeemBootstrap(token));
  f.setNow(1000 + APPLICATION_SESSION_MS);
  assert.throws(() => f.authority.redeemBootstrap(token));
  f.authority.issueBootstrap();
  assert.ok(f.authority.redeemBootstrap(f.tokens.at(-1)));
});

test('nonfinite clock fails closed', () => {
  const f = fixture(); f.authority.issueBootstrap(); f.setNow(NaN);
  assert.throws(() => f.authority.redeemBootstrap(f.tokens[0]));
});
