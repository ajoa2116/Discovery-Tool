import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { ApplicationSessionAuthority } from '../server/application_session_authority.ts';
import { PrivateBootstrapTransport, BOOTSTRAP_TRANSPORT_PATH, type StubMode } from '../server/private_bootstrap_transport.ts';

test('actual Windows restricted pipe descriptor and interactive token', async () => {
  assert.equal(process.platform, 'win32');
  const result = spawnSync(BOOTSTRAP_TRANSPORT_PATH, ['--self-test'], { encoding: 'utf8', timeout: 8000 });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).type, 'SELF_TEST_OK');
});

test('verified stub receives privately before bootstrap becomes redeemable', async () => {
  let token = '';
  const transport = new PrivateBootstrapTransport();
  const authority = new ApplicationSessionAuthority({ deliver(secret, receipt) {
    token = secret.expose();
    assert.throws(() => authority.redeemBootstrap(token));
    transport.deliver(secret, receipt);
    assert.throws(() => authority.redeemBootstrap(token));
  } });
  await authority.issueBootstrap();
  const session = authority.redeemBootstrap(token);
  assert.ok(authority.validateSession(session.secret.expose()));
  assert.throws(() => authority.redeemBootstrap(token));
  authority.dispose();
});

for (const mode of ['malformed', 'duplicate', 'oversized', 'wrong-ack', 'replay', 'timeout', 'disconnect', 'wrong-peer'] as StubMode[]) {
  test(`actual ${mode} failure invalidates bootstrap and closes owned transport`, async () => {
    let token = '';
    const transport = new PrivateBootstrapTransport(mode);
    const authority = new ApplicationSessionAuthority({ deliver(secret, receipt) { token = secret.expose(); transport.deliver(secret, receipt); } });
    const started = Date.now();
    await assert.rejects(authority.issueBootstrap(), error => error instanceof Error && error.message === 'Application authority unavailable.');
    assert.ok(Date.now() - started < 10000);
    assert.throws(() => authority.redeemBootstrap(token));
    authority.dispose();
  });
}
