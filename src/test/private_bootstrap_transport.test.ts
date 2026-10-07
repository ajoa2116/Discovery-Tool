import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { ApplicationSecret, ApplicationSessionAuthority } from '../server/application_session_authority.ts';
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
  const authority = new ApplicationSessionAuthority({ async deliver(secret, receipt, signal) {
    token = secret.expose();
    assert.throws(() => authority.redeemBootstrap(token));
    await transport.deliver(secret, receipt, signal);
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
    const authority = new ApplicationSessionAuthority({ deliver(secret, receipt, signal) { token = secret.expose(); return transport.deliver(secret, receipt, signal); } });
    const started = Date.now();
    await assert.rejects(authority.issueBootstrap(), error => error instanceof Error && error.message === 'Application authority unavailable.');
    assert.ok(Date.now() - started < 10000);
    assert.throws(() => authority.redeemBootstrap(token));
    authority.dispose();
  });
}

for (const ending of ['abort', 'dispose'] as const) {
  test(`real helper ${ending} stays nonblocking, invalidates authority and completes cleanup`, async () => {
    let token = '', cleanup: Promise<void> | undefined;
    const transport = new PrivateBootstrapTransport('timeout'), controller = new AbortController();
    const authority = new ApplicationSessionAuthority({ deliver(secret, receipt, signal) {
      token = secret.expose(); cleanup = transport.deliver(secret, receipt, signal); return cleanup;
    } });
    const issued = authority.issueBootstrap(controller.signal);
    const rejected = assert.rejects(issued);
    await Promise.resolve();
    assert.ok(cleanup);
    const cleaned = assert.rejects(cleanup);
    assert.throws(() => authority.redeemBootstrap(token));
    let ticks = 0;
    const heartbeat = setInterval(() => { ticks++; }, 10);
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 600));
      if (ending === 'abort') controller.abort(); else authority.dispose();
      await rejected; await cleaned;
      assert.ok(ticks >= 3);
      assert.throws(() => authority.redeemBootstrap(token));
      await new Promise<void>(resolve => setTimeout(resolve, 30));
      assert.throws(() => authority.redeemBootstrap(token));
    } finally { clearInterval(heartbeat); authority.dispose(); }
  });
}

test('pre-abort and expired receipt reject before native delivery', async () => {
  const transport = new PrivateBootstrapTransport(), secret = new ApplicationSecret('bootstrap');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(transport.deliver(secret, { id: 'fixture', expiresAt: Date.now() + 30000 }, controller.signal));
  await assert.rejects(transport.deliver(secret, { id: 'fixture', expiresAt: Date.now() - 1 }));
});
